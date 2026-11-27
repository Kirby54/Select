"use client";

/*
 * Home scene: the company's work drawn as three pyramids of light in a night desert.
 * Every point belongs to a band of stone coloured by a task status (done at the base, blocked at the top),
 * in proportion to the real task counts. Sand dunes below, and wind carrying sand across the plateau:
 * it slides over the pyramids, and a little sand is torn off their faces and blown downwind.
 * Decoration only: the numbers next to it (legend, histogram) are the company's real figures.
 */

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export interface SceneBand {
  key: string;
  label: string;
  count: number;
  color: string;
  href: string;
}

/** Giza layout: Khufu, Khafre, Menkaure on a diagonal, three small queens' pyramids beside Khufu. */
const PYRAMIDS: { x: number; z: number; hw: number; h: number; share: number }[] = [
  { x: 0.95, z: 0.55, hw: 1.0, h: 1.27, share: 0.4 },
  { x: -0.55, z: -0.45, hw: 0.94, h: 1.2, share: 0.33 },
  { x: -1.75, z: -1.35, hw: 0.46, h: 0.58, share: 0.13 },
  { x: 2.15, z: -0.25, hw: 0.2, h: 0.24, share: 0.05 },
  { x: 2.15, z: 0.3, hw: 0.2, h: 0.24, share: 0.045 },
  { x: 2.15, z: 0.85, hw: 0.2, h: 0.24, share: 0.045 },
];
const SUN = new THREE.Vector3(0.75, 0.55, 0.35).normalize();
/** Same gradient as the Team pyramid: apex to base. */
const HEIGHT_PALETTE = ["#fb923c", "#facc15", "#4f8cf7", "#2dd4bf", "#8b7cf6"].map((c) => new THREE.Color(c));
function heightColor(rel: number): THREE.Color {
  const t = Math.min(0.999, Math.max(0, 1 - rel)) * (HEIGHT_PALETTE.length - 1);
  const i = Math.floor(t);
  return HEIGHT_PALETTE[i]!.clone().lerp(HEIGHT_PALETTE[i + 1]!, t - i);
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Points on the four faces of each pyramid, with denser ridges and stone courses. */
function pyramidCloud(total: number) {
  const rnd = rng(11);
  const pos: number[] = [];
  const light: number[] = [];
  const height: number[] = [];
  const rel: number[] = [];
  const edge: number[] = [];
  for (const p of PYRAMIDS) {
    const n = Math.floor(total * p.share);
    const apex = new THREE.Vector3(p.x, p.h, p.z);
    const corners = [
      new THREE.Vector3(p.x - p.hw, 0, p.z - p.hw),
      new THREE.Vector3(p.x + p.hw, 0, p.z - p.hw),
      new THREE.Vector3(p.x + p.hw, 0, p.z + p.hw),
      new THREE.Vector3(p.x - p.hw, 0, p.z + p.hw),
    ];
    const courses = Math.round(p.h * 46);
    for (let i = 0; i < n; i++) {
      const f = Math.floor(rnd() * 4);
      const a = corners[f]!;
      const b = corners[(f + 1) % 4]!;
      const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(apex, a)).normalize();
      const roll = rnd();
      let q: THREE.Vector3;
      let onEdge = 1;
      if (roll < 0.3) {
        // ridge from a corner to the apex
        const t = Math.pow(rnd(), 0.8);
        q = a.clone().lerp(apex, t);
      } else if (roll < 0.42) {
        // base edge
        q = a.clone().lerp(b, rnd());
      } else {
        // uniform on the triangle a, b, apex
        onEdge = 0;
        let u = rnd();
        let v = rnd();
        if (u + v > 1) {
          u = 1 - u;
          v = 1 - v;
        }
        q = a.clone().addScaledVector(new THREE.Vector3().subVectors(b, a), u).addScaledVector(new THREE.Vector3().subVectors(apex, a), v);
        // stone courses: most points settle on horizontal lines
        if (rnd() < 0.3) {
          const k = Math.round((q.y / p.h) * courses) / courses;
          const scale = (1 - k) / Math.max(0.0001, 1 - q.y / p.h);
          q.set(p.x + (q.x - p.x) * scale, k * p.h, p.z + (q.z - p.z) * scale);
        }
      }
      q.addScaledVector(normal, (rnd() - 0.5) * 0.012);
      pos.push(q.x, q.y, q.z);
      light.push(0.32 + 0.68 * Math.max(0, normal.dot(SUN)));
      height.push(q.y / 1.27);
      rel.push(q.y / p.h);
      edge.push(onEdge);
    }
  }
  return { pos, light, height, rel, edge, rnd };
}

/** The 3D scene alone, filling its parent (the Home page puts it behind the whole app). */
/**
 * `lowPower`: drawn at 1x resolution and 30 fps (used behind pages where the scene is dimmed).
 * Independently, if the machine keeps falling under ~40 fps, the scene drops to 1x resolution by itself.
 */
export function PyramidScene({ bands, selected = -1, className, paused = false, lowPower = false }: { bands: SceneBand[]; selected?: number; className?: string; paused?: boolean; lowPower?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selRef = useRef<number>(selected);
  const pausedRef = useRef(paused);
  const lowPowerRef = useRef(lowPower);
  const [failed, setFailed] = useState(false);
  const bandKey = bands.map((b) => `${b.key}:${b.count}`).join("|");

  useEffect(() => {
    selRef.current = selected;
  }, [selected]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    lowPowerRef.current = lowPower;
  }, [lowPower]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch (error) {
      // No WebGL (old GPU, disabled acceleration): the page still works, only the picture is missing.
      console.warn("WebGL unavailable, the pyramid scene is not drawn", error);
      queueMicrotask(() => setFailed(true));
      return;
    }
    renderer.setClearColor(0x000000, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    const group = new THREE.Group();
    scene.add(group);
    const uniforms = {
      uTime: { value: 0 },
      uPR: { value: renderer.getPixelRatio() },
      uDist: { value: 6 },
      uSel: { value: -1 },
      uSelColor: { value: new THREE.Color(1, 1, 1) },
      // camera's right-hand direction on the ground: the wind follows it, so on screen it always blows left to right
      uWind: { value: new THREE.Vector3(1, 0, 0) },
    };

    /* ---- the pyramids ---- */
    const N = 26000;
    const cloud = pyramidCloud(N);
    const count = cloud.pos.length / 3;
    const color = new Float32Array(count * 3);
    const bandOf = new Float32Array(count);
    const size = new Float32Array(count);
    const alpha = new Float32Array(count);
    const flow = new Float32Array(count);
    const phase = new Float32Array(count);
    const total = bands.reduce((s, b) => s + b.count, 0);
    // Bands stacked from the base (first band) to the apex (last band), in proportion to the counts.
    const edges: number[] = [];
    let acc = 0;
    for (const b of bands) {
      acc += total ? b.count / total : 0;
      edges.push(acc);
    }
    // Colour by height on each pyramid, as on the Team page; outlines bright, faces softer.
    const statusColors = bands.map((b) => new THREE.Color(b.color));
    // The status bands are kept for the legend: hovering a row still isolates that layer.
    const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => cloud.height[a]! - cloud.height[b]!);
    order.forEach((i, rank) => {
      const r = cloud.rnd;
      let band = -1;
      if (total) {
        // a soft, noisy boundary between bands so they read as layers of sand, not paint
        const f = Math.min(0.9999, Math.max(0, rank / count + (r() - 0.5) * 0.03));
        band = edges.findIndex((e) => f < e);
        if (band < 0) band = bands.length - 1;
      }
      const l = cloud.light[i]!;
      const shade = (cloud.edge[i] ? 1 : 0.55) * (0.6 + 0.4 * l);
      const tint = heightColor(cloud.rel[i]!);
      color[i * 3] = tint.r * shade;
      color[i * 3 + 1] = tint.g * shade;
      color[i * 3 + 2] = tint.b * shade;
      bandOf[i] = band;
      size[i] = (cloud.edge[i] ? 1.9 : 1.5) + r() * 1.2;
      alpha[i] = cloud.edge[i] ? 0.9 : 0.35 + 0.45 * l * (0.7 + r() * 0.3);
      flow[i] = r() < 0.1 ? 1 : 0;
      phase[i] = r();
    });
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.Float32BufferAttribute(cloud.pos, 3));
    pGeo.setAttribute("acolor", new THREE.BufferAttribute(color, 3));
    pGeo.setAttribute("aband", new THREE.BufferAttribute(bandOf, 1));
    pGeo.setAttribute("asize", new THREE.BufferAttribute(size, 1));
    pGeo.setAttribute("aalpha", new THREE.BufferAttribute(alpha, 1));
    pGeo.setAttribute("aflow", new THREE.BufferAttribute(flow, 1));
    pGeo.setAttribute("aphase", new THREE.BufferAttribute(phase, 1));
    const WIND = `uniform float uTime;
      float gust(){ return 0.75 + 0.35 * sin(uTime * 0.31) + 0.15 * sin(uTime * 1.13); }`;
    const pyramids = new THREE.Points(
      pGeo,
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `attribute vec3 acolor; attribute float aband; attribute float asize; attribute float aalpha;
          attribute float aflow; attribute float aphase;
          uniform float uPR; uniform float uDist; uniform float uSel; uniform vec3 uSelColor; uniform vec3 uWind; varying vec3 vC; varying float vA; ${WIND}
          void main(){
            vec3 p = position; float a = aalpha; vC = acolor;
            // a band of warm light climbs the pyramids every 10 s, like the sun catching the stone
            float c = mod(uTime, 9.0) / 6.0;
            if (c < 1.0) { float d = (p.y - mix(-0.1, 1.4, c)) / 0.07; float g = exp(-d * d); vC = mix(vC, vec3(1.0), g * 0.35); a = min(1.0, a + g * 0.25); }
            if (aflow > 0.5) {
              // sand torn off the face, carried downwind, then settling back
              float t = fract(uTime * 0.06 * gust() + aphase);
              p += uWind * (t * 3.2);
              p.y += sin(t * 3.1416) * 0.35 - t * p.y * 0.8;
                            a *= (1.0 - t) * 0.9;
              vC = mix(vC, vec3(0.95), t); // the grain turns to white sand as it flies
            }
            // legend hover: that layer takes its status colour, the rest fades
            if (uSel > -0.5) { if (abs(aband - uSel) > 0.5) a *= 0.1; else { vC = uSelColor * (0.75 + 0.25 * aalpha); a = max(a, 0.8); } }
            vA = a;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = asize * uPR * (uDist / -mv.z); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying vec3 vC; varying float vA;
          void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
            gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.25, d)); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    group.add(pyramids);

    /* ---- the dunes ---- */
    const dr = rng(23);
    const DN = 22000;
    const dPos = new Float32Array(DN * 3);
    const dAlpha = new Float32Array(DN);
    for (let i = 0; i < DN; i++) {
      const x = -5.5 + dr() * 11;
      const z = -4.5 + dr() * 8;
      // keep the pyramid footprints clear
      const inside = PYRAMIDS.some((p) => Math.max(Math.abs(x - p.x), Math.abs(z - p.z)) < p.hw * 1.02);
      dPos[i * 3] = x;
      dPos[i * 3 + 1] = inside ? -0.01 : 0;
      dPos[i * 3 + 2] = z;
      dAlpha[i] = (inside ? 0.03 : 0.12) + Math.pow(dr(), 2) * 0.4;
    }
    const dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute("position", new THREE.BufferAttribute(dPos, 3));
    dGeo.setAttribute("aalpha", new THREE.BufferAttribute(dAlpha, 1));
    group.add(
      new THREE.Points(
        dGeo,
        new THREE.ShaderMaterial({
          uniforms,
          vertexShader: `attribute float aalpha; uniform float uPR; uniform float uDist; uniform vec3 uWind; varying float vA; varying float vH; ${WIND}
            void main(){
              vec3 p = position;
              // dunes, far from the pyramids, slowly migrating downwind; ripples on top
              float far = smoothstep(1.2, 3.2, length(p.xz - vec2(0.2, -0.2)));
              float m = 0.0;
              float h = 0.16 * sin(0.9 * (p.x - m) + 0.6 * p.z) + 0.1 * sin(1.7 * p.z - 0.4 * (p.x - m) + 1.3) + 0.05 * sin(3.1 * (p.x - m) + 2.0 * p.z);
              p.y += -0.03 + far * (h + 0.12) + 0.012 * sin(18.0 * (dot(p.xz, uWind.xz) - uTime * 0.16));
              vH = far * (h + 0.3);
              float edge = 1.0 - smoothstep(3.6, 5.4, length(p.xz));
              vA = aalpha * edge;
              vec4 mv = modelViewMatrix * vec4(p, 1.0);
              gl_PointSize = 1.8 * uPR * (uDist / -mv.z); gl_Position = projectionMatrix * mv; }`,
          fragmentShader: `varying float vA; varying float vH;
            void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
              vec3 c = mix(vec3(0.5), vec3(0.95), clamp(vH * 1.6, 0.0, 1.0));
              gl_FragColor = vec4(c, vA * smoothstep(0.5, 0.2, d)); }`,
          transparent: true,
          depthWrite: false,
        }),
      ),
    );

    /* ---- the wind: sand streaming across the plateau, over and around the pyramids ---- */
    const wr = rng(57);
    const WN = 20000;
    const wPos = new Float32Array(WN * 3);
    const wSize = new Float32Array(WN);
    const wAlpha = new Float32Array(WN);
    const wPhase = new Float32Array(WN);
    // gusts carry sand in clouds: a few dense streaks, many loose grains
    const streaks = Array.from({ length: 46 }, () => ({ y: Math.pow(wr(), 2.2) * 0.9, z: -3.6 + wr() * 6.4, spread: 0.04 + wr() * 0.16, x: wr() }));
    for (let i = 0; i < WN; i++) {
      let y: number;
      let z: number;
      const x = wr();
      if (wr() < 0.6) {
        const k = streaks[Math.floor(wr() * streaks.length)]!;
        y = Math.abs(k.y + (wr() - 0.5) * k.spread);
        z = k.z + (wr() - 0.5) * k.spread * 6;
      } else {
        y = -Math.log(1 - wr() * 0.995) * 0.18;
        z = -4 + wr() * 7.2;
      }
      wPos[i * 3] = x;
      wPos[i * 3 + 1] = y;
      wPos[i * 3 + 2] = z;
      wSize[i] = 1.0 + wr() * 1.8;
      wAlpha[i] = 0.22 + Math.pow(wr(), 2) * 0.7;
      wPhase[i] = wr() * 6.2832;
    }
    const wGeo = new THREE.BufferGeometry();
    wGeo.setAttribute("position", new THREE.BufferAttribute(wPos, 3));
    wGeo.setAttribute("asize", new THREE.BufferAttribute(wSize, 1));
    wGeo.setAttribute("aalpha", new THREE.BufferAttribute(wAlpha, 1));
    wGeo.setAttribute("aphase", new THREE.BufferAttribute(wPhase, 1));
    const pyrUniform = PYRAMIDS.slice(0, 3).map((p) => new THREE.Vector4(p.x, p.z, p.hw, p.h));
    const windGroup = new THREE.Group();
    group.add(windGroup);
    windGroup.add(
      new THREE.Points(
        wGeo,
        new THREE.ShaderMaterial({
          uniforms: { ...uniforms, uPyr: { value: pyrUniform } },
          vertexShader: `attribute float asize; attribute float aalpha; attribute float aphase;
            uniform float uPR; uniform float uDist; uniform vec4 uPyr[3]; varying float vA; ${WIND}
            void main(){
              const float XMIN = -5.5, SPAN = 11.0;
              float speed = 0.8 + 0.4 * fract(aphase * 7.13);
              vec3 p = position;
              // integrated gust so the wind speeds up and slows down without jumping
              float travel = uTime * 0.16 * speed;
              p.x = XMIN + mod(position.x * SPAN + travel, SPAN);
              // turbulence: grains hop, swirl and drift sideways
              p.y += 0.02 * sin(p.x * 1.9 + aphase); // a fixed gentle arc along the path, no back-and-forth
              // over and around the pyramids instead of through them
              for (int k = 0; k < 3; k++) {
                vec4 q = uPyr[k];
                float r = max(abs(p.x - q.x), abs(p.z - q.y));
                float surf = q.w * (1.0 - r / (q.z * 1.06));
                if (surf > p.y) { p.y = surf + 0.015 + 0.02 * fract(aphase * 3.7); }
              }
              float edge = smoothstep(XMIN, XMIN + 1.2, p.x) * (1.0 - smoothstep(XMIN + SPAN - 1.2, XMIN + SPAN, p.x));
              vA = aalpha * edge * (0.7 + 0.3 * sin(uTime * 0.5 + aphase * 3.0));
              vec4 mv = modelViewMatrix * vec4(p, 1.0);
              gl_PointSize = asize * uPR * (uDist / -mv.z); gl_Position = projectionMatrix * mv; }`,
          fragmentShader: `varying float vA;
            void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
              gl_FragColor = vec4(0.95, 0.95, 0.95, vA * smoothstep(0.5, 0.15, d)); }`,
          transparent: true,
          depthWrite: false,
        }),
      ),
    );

    /* ---- a few stars ---- */
    const sr = rng(91);
    const SN = 900;
    const sPos = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) {
      const th = sr() * Math.PI * 2;
      const ph = 0.12 + sr() * 1.2;
      sPos[i * 3] = Math.cos(th) * Math.cos(ph) * 30;
      sPos[i * 3 + 1] = Math.sin(ph) * 30;
      sPos[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * 30;
    }
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
    scene.add(new THREE.Points(sGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, sizeAttenuation: false, transparent: true, opacity: 0.45, depthWrite: false })));

    /* ---- camera, drag, zoom ---- */
    let ry = -0.55;
    let rx = 0.36;
    let zoom = 1;
    let drag = false;
    let lx = 0;
    let ly = 0;
    let auto = true;
    let autoTimer = 0;
    const onDown = (e: PointerEvent) => {
      drag = true;
      auto = false;
      lx = e.clientX;
      ly = e.clientY;
      canvas.style.cursor = "grabbing";
    };
    const onUp = () => {
      if (!drag) return;
      drag = false;
      canvas.style.cursor = "grab";
      window.clearTimeout(autoTimer);
      autoTimer = window.setTimeout(() => (auto = true), 4000);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      ry += (e.clientX - lx) * 0.006;
      rx = Math.max(0.02, Math.min(1.1, rx + (e.clientY - ly) * 0.004));
      lx = e.clientX;
      ly = e.clientY;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom = Math.max(0.45, Math.min(2.2, zoom * (1 + e.deltaY * 0.001)));
    };
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointermove", onMove);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    const resize = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    let frame = 0;
    let last = performance.now();
    let frameCount = 0;
    let slowFrames = 0;
    let degraded = false;
    const fullRatio = Math.min(window.devicePixelRatio, 2);
    const applyQuality = () => {
      const ratio = lowPowerRef.current || degraded ? 1 : fullRatio;
      if (renderer.getPixelRatio() !== ratio) {
        renderer.setPixelRatio(ratio);
        uniforms.uPR.value = ratio;
        resize();
      }
    };
    let visible = true;
    const io = new IntersectionObserver(([entry]) => (visible = entry?.isIntersecting ?? true));
    io.observe(wrap);
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible || document.hidden || pausedRef.current) return;
      uniforms.uTime.value += dt;
      frameCount++;
      // adaptive quality: 120 slow frames out of the last stretch and the resolution steps down
      if (!degraded && !lowPowerRef.current) {
        slowFrames = dt > 0.025 ? slowFrames + 1 : Math.max(0, slowFrames - 0.5);
        if (slowFrames > 120) degraded = true;
      }
      applyQuality();
      if (auto) ry += dt * 0.072;
      windGroup.rotation.y = ry;
      uniforms.uWind.value.set(Math.cos(ry), 0, -Math.sin(ry));
      // the sand flows around the pyramids: give the shader their centres in the wind group's frame
      PYRAMIDS.slice(0, 3).forEach((p, k) => {
        const c = Math.cos(ry);
        const sn = Math.sin(ry);
        pyrUniform[k]!.set(p.x * c - p.z * sn, p.x * sn + p.z * c, p.hw, p.h);
      });
      uniforms.uSel.value = selRef.current;
      const statusColor = statusColors[selRef.current];
      if (statusColor) uniforms.uSelColor.value.copy(statusColor);
      const dist = 8.4 * zoom * (camera.aspect < 1 ? 1.6 : 1);
      uniforms.uDist.value = 6;
      const target = new THREE.Vector3(0.2, 0.3, -0.2);
      camera.position.set(target.x + Math.sin(ry) * Math.cos(rx) * dist, target.y + Math.sin(rx) * dist, target.z + Math.cos(ry) * Math.cos(rx) * dist);
      camera.lookAt(target);
      if (lowPowerRef.current && frameCount % 2 === 1) return; // 30 fps behind dimmed pages
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(autoTimer);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("wheel", onWheel);
      scene.traverse((o) => {
        if (o instanceof THREE.Points) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      renderer.dispose();
    };
    // Rebuild only when the bands change, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bandKey]);

  return (
    <div ref={wrapRef} className={className ?? "relative h-full w-full overflow-hidden bg-black"}>
      <canvas ref={canvasRef} className="block h-full w-full cursor-grab touch-none" aria-label="Three pyramids of light in a night desert, coloured by task status, with wind blowing sand across them" role="img" />
      {failed && <p className="absolute inset-0 flex items-center justify-center text-sm text-faint">This browser cannot draw the 3D scene (WebGL is off).</p>}
    </div>
  );
}

/** Task statuses as a legend: hovering a row lights its layer of the pyramids. */
export function SceneLegend({ bands, selected, onSelect }: { bands: SceneBand[]; selected: number; onSelect: (index: number) => void }) {
  const total = bands.reduce((s, b) => s + b.count, 0);
  return (
    <div className="text-xs text-white/85 select-none" onMouseLeave={() => onSelect(-1)}>
      <div className="mb-1.5 flex justify-between text-[10px] font-medium tracking-[0.12em] text-white/60">
        <span>TASKS</span>
        <span className="tabular">{total}</span>
      </div>
      {[...bands].reverse().map((b) => {
        const index = bands.indexOf(b);
        return (
          <a
            key={b.key}
            href={b.href}
            onMouseEnter={() => onSelect(index)}
            onFocus={() => onSelect(index)}
            onBlur={() => onSelect(-1)}
            className={`flex min-h-6 items-center gap-2 rounded-md px-1 transition-opacity duration-150 hover:bg-white/5 ${selected >= 0 && selected !== index ? "opacity-40" : ""}`}
          >
            <i className="size-2 shrink-0 rounded-full" style={{ background: b.color }} />
            {b.label}
            <span className="ml-auto text-white/70 tabular">{b.count}</span>
          </a>
        );
      })}
    </div>
  );
}

/** Finished tasks per day, as Whale's time histogram. */
export function SceneHistogram({ values, label }: { values: number[]; label: string }) {
  if (!values.length) return null;
  const max = Math.max(1, ...values);
  return (
    <div className="select-none" role="img" aria-label={label}>
      <div className="flex h-10 items-end gap-px">
        {values.map((v, i) => (
          <span key={i} className="flex-1 rounded-[1px] bg-white/55" style={{ height: `${v ? Math.max(8, (v / max) * 100) : 4}%`, opacity: v ? 1 : 0.3 }} />
        ))}
      </div>
      <p className="mt-1 text-right text-[10px] text-white/55">{label}</p>
    </div>
  );
}
