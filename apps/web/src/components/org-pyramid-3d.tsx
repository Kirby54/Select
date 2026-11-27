"use client";

/*
 * Team as a pyramid in 3D. The agent nobody manages sits at the apex, each level of reports lower down inside
 * a particle pyramid. Agents are lights you can drag anywhere in space ("Move"); in "Link" you drag from one
 * agent onto another to make the first report to the second. Positions are this browser's layout (saved
 * locally); reporting lines are the company's real organization, saved through the API, which refuses loops.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { AgentAvatar } from "@/components/domain";
import type { Agent } from "@/lib/types";

export const APEX_Y = 2.3;
const BASE_Y = -1.3;
const BASE_HW = 2.6;
export const LEVEL_GAP = 1.05;
const PALETTE = ["#fb923c", "#facc15", "#4f8cf7", "#2dd4bf", "#8b7cf6"]; // apex to base, as on Home
type Vec = [number, number, number];

/** Half-width of the pyramid at a height. */
const halfWidth = (y: number) => BASE_HW * Math.max(0, (APEX_Y - y) / (APEX_Y - BASE_Y));

function depthOf(agent: Agent, byId: Map<string, Agent>): number {
  let d = 0;
  let current = agent;
  const seen = new Set<string>();
  while (current.manager_id && byId.has(current.manager_id) && !seen.has(current.id)) {
    seen.add(current.id);
    current = byId.get(current.manager_id)!;
    d++;
  }
  return d;
}

/** Default place: the boss at the apex, each level on a ring inside the pyramid's cross-section. */
export function defaultLayout(agents: Agent[]): Record<string, Vec> {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const levels = new Map<number, Agent[]>();
  for (const a of agents) {
    const d = depthOf(a, byId);
    levels.set(d, [...(levels.get(d) ?? []), a]);
  }
  const out: Record<string, Vec> = {};
  for (const [d, list] of levels) {
    const y = Math.max(BASE_Y + 0.25, APEX_Y - 0.35 - d * LEVEL_GAP);
    const ring = list.length === 1 ? 0 : Math.min(halfWidth(y) * 0.72, 0.35 + list.length * 0.18);
    list.sort((p, q) => p.position - q.position).forEach((a, i) => {
      const angle = (i / list.length) * Math.PI * 2 + d * 0.6;
      out[a.id] = [Math.cos(angle) * ring, y, Math.sin(angle) * ring];
    });
  }
  return out;
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

export type OrgMode = "move" | "link";

export function OrgPyramid3D({ cid, agents, mode, selected, onSelect, canRelink, onLink, onHint }: {
  cid: string;
  agents: Agent[];
  mode: OrgMode;
  selected: string | null;
  onSelect: (id: string) => void;
  /** Whether this agent's reporting line may be changed by the current user. */
  canRelink: (agent: Agent) => boolean;
  /** Save "child reports to manager". The API refuses loops. */
  onLink: (childId: string, managerId: string) => void;
  onHint: (text: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRefs = useRef(new Map<string, HTMLButtonElement>());
  const storageKey = `select.org3d.${cid}`;
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  // Positions: saved layout where it exists, default place for agents not placed yet.
  const positions = useRef<Record<string, Vec>>({});
  const [layoutVersion, setLayoutVersion] = useState(0);
  useEffect(() => {
    let saved: Record<string, Vec> = {};
    try {
      saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as Record<string, Vec>;
    } catch (error) {
      // A damaged saved layout only costs the custom placement: fall back to the default pyramid.
      console.warn("Saved 3D layout unreadable, using the default", error);
    }
    const fallback = defaultLayout(agents);
    const next: Record<string, Vec> = {};
    for (const a of agents) next[a.id] = saved[a.id] ?? positions.current[a.id] ?? fallback[a.id] ?? [0, 0, 0];
    positions.current = next;
  }, [agents, storageKey, layoutVersion]);
  const save = useCallback(() => window.localStorage.setItem(storageKey, JSON.stringify(positions.current)), [storageKey]);

  // Live values the render loop reads without re-creating the scene.
  const live = useRef({ mode, selected, agents, byId, onSelect, onLink, onHint, canRelink });
  useEffect(() => {
    live.current = { mode, selected, agents, byId, onSelect, onLink, onHint, canRelink };
  });

  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const linkRef = useRef<{ from: string; x: number; y: number; over: string | null } | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch (error) {
      console.warn("WebGL unavailable, the 3D organization is not drawn", error);
      queueMicrotask(() => live.current.onHint("This browser cannot draw 3D (WebGL is off). Use the tree view."));
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    const uniforms = { uTime: { value: 0 }, uPR: { value: renderer.getPixelRatio() } };

    /* ---- the pyramid of particles: dense ridges, sparse faces, coloured from the base to the apex ---- */
    const r = rng(5);
    const apex = new THREE.Vector3(0, APEX_Y, 0);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => new THREE.Vector3(x! * BASE_HW, BASE_Y, z! * BASE_HW));
    const pts: number[] = [];
    const cols: number[] = [];
    const colorAt = (y: number) => {
      const t = Math.min(0.999, Math.max(0, (APEX_Y - y) / (APEX_Y - BASE_Y)));
      const i = Math.floor(t * (PALETTE.length - 1));
      return new THREE.Color(PALETTE[i]!).lerp(new THREE.Color(PALETTE[i + 1]!), t * (PALETTE.length - 1) - i);
    };
    const push = (v: THREE.Vector3, k = 1) => {
      pts.push(v.x, v.y, v.z);
      const c = colorAt(v.y);
      cols.push(c.r * k, c.g * k, c.b * k);
    };
    for (let i = 0; i < 9000; i++) {
      const f = Math.floor(r() * 4);
      const a = corners[f]!;
      const b = corners[(f + 1) % 4]!;
      const roll = r();
      if (roll < 0.35) push(a.clone().lerp(apex, Math.pow(r(), 0.9)).addScalar((r() - 0.5) * 0.02), 1);
      else if (roll < 0.5) push(a.clone().lerp(b, r()), 0.9);
      else {
        let u = r();
        let v = r();
        if (u + v > 1) { u = 1 - u; v = 1 - v; }
        push(a.clone().addScaledVector(b.clone().sub(a), u).addScaledVector(apex.clone().sub(a), v), 0.6);
      }
    }
    // floor of white sand
    for (let i = 0; i < 6000; i++) {
      const rad = Math.sqrt(r()) * 6;
      const th = r() * Math.PI * 2;
      pts.push(Math.cos(th) * rad, BASE_Y - 0.02 + (r() - 0.5) * 0.02, Math.sin(th) * rad);
      const k = 0.25 + r() * 0.35;
      cols.push(k, k, k);
    }
    const pyrGeo = new THREE.BufferGeometry();
    pyrGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    pyrGeo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    const dotMaterial = (size: number, opacity: number) =>
      new THREE.ShaderMaterial({
        uniforms: { ...uniforms, uSize: { value: size }, uOpacity: { value: opacity } },
        vertexShader: `attribute vec3 color; uniform float uPR; uniform float uSize; varying vec3 vC;
          void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = uSize * uPR * (6.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform float uOpacity; varying vec3 vC;
          void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
            gl_FragColor = vec4(vC, uOpacity * smoothstep(0.5, 0.15, d)); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
    scene.add(new THREE.Points(pyrGeo, dotMaterial(1.9, 0.9)));

    /* ---- agents: a glowing light each ---- */
    const nodeGeo = new THREE.BufferGeometry();
    const nodeMat = new THREE.ShaderMaterial({
      uniforms: { ...uniforms },
      vertexShader: `attribute vec3 color; attribute float asize; uniform float uPR; uniform float uTime; varying vec3 vC;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = asize * (1.0 + 0.06 * sin(uTime * 2.0 + position.x * 3.0)) * uPR * (6.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC;
        void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          float core = smoothstep(0.18, 0.0, d); float halo = smoothstep(0.5, 0.0, d) * 0.55;
          gl_FragColor = vec4(mix(vC, vec3(1.0), core * 0.8), core + halo); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const nodes = new THREE.Points(nodeGeo, nodeMat);
    scene.add(nodes);

    /* ---- reporting lines and the lights travelling up them ---- */
    const lineGeo = new THREE.BufferGeometry();
    const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(lines);
    const PULSES = 5;
    const pulseGeo = new THREE.BufferGeometry();
    scene.add(new THREE.Points(pulseGeo, dotMaterial(3.2, 0.95)));
    const previewGeo = new THREE.BufferGeometry();
    const preview = new THREE.Line(previewGeo, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.08, gapSize: 0.06, transparent: true, opacity: 0.85 }));
    scene.add(preview);

    /* ---- camera: drag the empty space to turn, wheel to zoom ---- */
    let ry = 0.6;
    let rx = 0.28;
    let zoom = 1;
    let orbit: { x: number; y: number } | null = null;
    let auto = true;
    let autoTimer = 0;
    const target = new THREE.Vector3(0, 0.45, 0);
    const size = { w: 1, h: 1 };
    const project = (v: Vec) => {
      const p = new THREE.Vector3(...v).project(camera);
      return { x: (p.x * 0.5 + 0.5) * size.w, y: (-p.y * 0.5 + 0.5) * size.h, behind: p.z > 1 };
    };
    const nearest = (x: number, y: number, except?: string) => {
      let best: string | null = null;
      let bd = 34;
      for (const a of live.current.agents) {
        if (a.id === except) continue;
        const pos = positions.current[a.id];
        if (!pos) continue;
        const s = project(pos);
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < bd) { bd = d; best = a.id; }
      }
      return best;
    };
    const local = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };

    // Dragging an agent: it moves on the plane facing the camera, through its current position.
    let dragging: { id: string; moved: boolean } | null = null;
    const ray = new THREE.Raycaster();
    const dragTo = (id: string, x: number, y: number) => {
      const pos = positions.current[id];
      if (!pos) return;
      const normal = new THREE.Vector3();
      camera.getWorldDirection(normal);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(...pos));
      ray.setFromCamera(new THREE.Vector2((x / size.w) * 2 - 1, -(y / size.h) * 2 + 1), camera);
      const hit = new THREE.Vector3();
      if (ray.ray.intersectPlane(plane, hit)) {
        positions.current[id] = [
          Math.max(-5, Math.min(5, hit.x)),
          Math.max(BASE_Y, Math.min(APEX_Y + 1.5, hit.y)),
          Math.max(-5, Math.min(5, hit.z)),
        ];
      }
    };

    const startOnAgent = (id: string, e: PointerEvent) => {
      auto = false;
      if (live.current.mode === "move") {
        dragging = { id, moved: false };
      } else {
        const agent = live.current.byId.get(id);
        if (agent && !live.current.canRelink(agent)) {
          live.current.onHint(agent.is_demo_agent ? "Demo agents keep their reporting line so the recorded week stays the same." : "Only owners and admins can change who reports to whom.");
          return;
        }
        const p = local(e);
        linkRef.current = { from: id, x: p.x, y: p.y, over: null };
        setLinkFrom(id);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    };
    const onCanvasDown = (e: PointerEvent) => {
      const p = local(e);
      const id = nearest(p.x, p.y);
      if (id) { startOnAgent(id, e); return; }
      orbit = { x: e.clientX, y: e.clientY };
      auto = false;
      canvas.style.cursor = "grabbing";
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (orbit) {
        ry += (e.clientX - orbit.x) * 0.006;
        rx = Math.max(-0.1, Math.min(1.2, rx + (e.clientY - orbit.y) * 0.004));
        orbit = { x: e.clientX, y: e.clientY };
      } else if (dragging) {
        dragging.moved = true;
        dragTo(dragging.id, p.x, p.y);
      } else if (linkRef.current) {
        linkRef.current = { ...linkRef.current, x: p.x, y: p.y, over: nearest(p.x, p.y, linkRef.current.from) };
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      canvas.style.cursor = "";
      if (dragging) {
        if (dragging.moved) save();
        else live.current.onSelect(dragging.id);
      }
      const link = linkRef.current;
      if (link) {
        if (link.over) live.current.onLink(link.from, link.over);
        else live.current.onSelect(link.from);
      }
      dragging = null;
      orbit = null;
      linkRef.current = null;
      setLinkFrom(null);
      window.clearTimeout(autoTimer);
      autoTimer = window.setTimeout(() => (auto = true), 5000);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom = Math.max(0.5, Math.min(2.2, zoom * (1 + e.deltaY * 0.001)));
    };
    canvas.addEventListener("pointerdown", onCanvasDown);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    // Labels start the same gestures as the lights they belong to.
    const onLabelDown = (e: Event) => {
      const id = (e.currentTarget as HTMLElement).dataset.agentId;
      if (id && (e as PointerEvent).button === 0) { e.preventDefault(); startOnAgent(id, e as PointerEvent); }
    };
    const attached = new Set<HTMLElement>();
    const attachLabels = () => {
      labelRefs.current.forEach((el) => {
        if (!attached.has(el)) { el.addEventListener("pointerdown", onLabelDown); attached.add(el); }
      });
    };

    const resize = () => {
      size.w = wrap.clientWidth;
      size.h = wrap.clientHeight;
      if (!size.w || !size.h) return;
      renderer.setSize(size.w, size.h, false);
      camera.aspect = size.w / size.h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (document.hidden) return;
      uniforms.uTime.value += dt;
      if (auto) ry += dt * 0.072; // Whale's pace
      const dist = 8.6 * zoom * (camera.aspect < 1 ? 2 : 1);
      camera.position.set(target.x + Math.sin(ry) * Math.cos(rx) * dist, target.y + Math.sin(rx) * dist, target.z + Math.cos(ry) * Math.cos(rx) * dist);
      camera.lookAt(target);
      camera.updateMatrixWorld();

      const { agents: list, byId: map, selected: sel } = live.current;
      // agents
      const np = new Float32Array(list.length * 3);
      const nc = new Float32Array(list.length * 3);
      const ns = new Float32Array(list.length);
      list.forEach((a, i) => {
        const pos = positions.current[a.id] ?? [0, 0, 0];
        np.set(pos, i * 3);
        const c = colorAt(pos[1]);
        nc.set([c.r, c.g, c.b], i * 3);
        ns[i] = a.id === sel || a.id === linkRef.current?.over ? 26 : 17;
      });
      nodeGeo.setAttribute("position", new THREE.BufferAttribute(np, 3));
      nodeGeo.setAttribute("color", new THREE.BufferAttribute(nc, 3));
      nodeGeo.setAttribute("asize", new THREE.BufferAttribute(ns, 1));
      // reporting lines: from each agent up to its manager
      const lp: number[] = [];
      const lc: number[] = [];
      const pp: number[] = [];
      const pc: number[] = [];
      for (const a of list) {
        const m = a.manager_id ? map.get(a.manager_id) : undefined;
        const p1 = positions.current[a.id];
        const p2 = m ? positions.current[m.id] : undefined;
        if (!p1 || !p2) continue;
        const lit = sel === a.id || sel === m!.id;
        const c1 = colorAt(p1[1]);
        const c2 = colorAt(p2[1]);
        const k = lit ? 1 : 0.55;
        lp.push(...p1, ...p2);
        lc.push(c1.r * k, c1.g * k, c1.b * k, c2.r * k, c2.g * k, c2.b * k);
        for (let j = 0; j < PULSES; j++) {
          const t = (uniforms.uTime.value * 0.22 + j / PULSES + a.id.charCodeAt(0) * 0.013) % 1;
          pp.push(p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t, p1[2] + (p2[2] - p1[2]) * t);
          const w = Math.sin(t * Math.PI);
          pc.push(w, w, w);
        }
      }
      lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
      lineGeo.setAttribute("color", new THREE.Float32BufferAttribute(lc, 3));
      pulseGeo.setAttribute("position", new THREE.Float32BufferAttribute(pp, 3));
      pulseGeo.setAttribute("color", new THREE.Float32BufferAttribute(pc, 3));
      // link being drawn: from the agent to the cursor (or to the agent under it)
      const link = linkRef.current;
      if (link && positions.current[link.from]) {
        const from = new THREE.Vector3(...positions.current[link.from]!);
        let to: THREE.Vector3;
        if (link.over && positions.current[link.over]) to = new THREE.Vector3(...positions.current[link.over]!);
        else {
          ray.setFromCamera(new THREE.Vector2((link.x / size.w) * 2 - 1, -(link.y / size.h) * 2 + 1), camera);
          const normal = new THREE.Vector3();
          camera.getWorldDirection(normal);
          to = new THREE.Vector3();
          ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal, from), to);
        }
        previewGeo.setFromPoints([from, to]);
        preview.computeLineDistances();
        preview.visible = true;
      } else preview.visible = false;

      // glass name tags follow their lights
      attachLabels();
      labelRefs.current.forEach((el, id) => {
        const pos = positions.current[id];
        if (!pos) return;
        const s = project(pos);
        el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -135%)`;
        el.style.visibility = s.behind ? "hidden" : "visible";
        el.style.zIndex = String(1000 - Math.round(new THREE.Vector3(...pos).distanceTo(camera.position) * 50));
      });
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(autoTimer);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onCanvasDown);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointermove", onMove);
      attached.forEach((el) => el.removeEventListener("pointerdown", onLabelDown));
      scene.traverse((o) => {
        if (o instanceof THREE.Points || o instanceof THREE.Line) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      renderer.dispose();
    };
  }, [save]);

  const resetLayout = () => {
    window.localStorage.removeItem(storageKey);
    positions.current = {};
    setLayoutVersion((v) => v + 1);
  };

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        className={mode === "link" ? "absolute inset-0 block h-full w-full cursor-crosshair touch-none" : "absolute inset-0 block h-full w-full cursor-grab touch-none"}
        role="img"
        aria-label="The team as a 3D pyramid: the manager at the top, reports below, lines from each agent up to its manager"
      />
      {agents.map((a) => {
        const isSel = a.id === selected;
        const isFrom = a.id === linkFrom;
        return (
          <button
            key={a.id}
            ref={(el) => {
              if (el) labelRefs.current.set(a.id, el);
              else labelRefs.current.delete(a.id);
            }}
            type="button"
            data-agent-id={a.id}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(a.id); } }}
            className={`glass absolute top-0 left-0 flex touch-none items-center gap-2 rounded-full! py-1 pr-3 pl-1 text-left whitespace-nowrap select-none ${mode === "link" ? "cursor-crosshair" : "cursor-grab"} ${isSel || isFrom ? "ring-2 ring-white/70" : ""} ${a.status !== "active" ? "opacity-60" : ""}`}
            style={{ visibility: "hidden" }}
            aria-label={`${a.name}, ${a.role}${a.manager_id && byId.get(a.manager_id) ? `, reports to ${byId.get(a.manager_id)!.name}` : ", top of the organization"}`}
          >
            <AgentAvatar name={a.name} role={a.role} size="xs" />
            <span className="flex flex-col leading-tight">
              <span className="text-xs font-semibold text-white">{a.name}</span>
              <span className="text-[10px] text-white/65">{a.role}</span>
            </span>
          </button>
        );
      })}
      <button type="button" onClick={resetLayout} className="glass glass-hover absolute right-4 bottom-4 z-[1100] rounded-full! px-3.5 py-1.5 text-xs text-white/85">
        Reset layout
      </button>
    </div>
  );
}
