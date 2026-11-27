"use client";

import { useEffect, type RefObject } from "react";

/**
 * The lens used by `.glass` (backdrop-filter: url(#liquid-lens)): smooth low-frequency noise displaces what is
 * behind the glass by a few pixels, so the scene seems to bend through it like Apple's Liquid Glass.
 * Browsers that cannot use an SVG filter as a backdrop keep the plain blur declared before it.
 */
export function LiquidLensFilter() {
  return (
    <svg aria-hidden width="0" height="0" className="pointer-events-none absolute" focusable="false">
      <filter id="liquid-lens" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="11" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="3" result="soft" />
        <feDisplacementMap in="SourceGraphic" in2="soft" scale="34" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

/**
 * Lets the mouse light the glass: for every `.glass` inside `root`, sets --mx / --my to the pointer position
 * relative to that panel (once per frame), which the CSS uses to light the rim nearest the cursor.
 */
export function useGlassSpotlight(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    let frame = 0;
    let x = -9999;
    let y = -9999;
    const paint = () => {
      frame = 0;
      const el = root.current;
      if (!el) return;
      el.querySelectorAll<HTMLElement>(".glass").forEach((panel) => {
        const r = panel.getBoundingClientRect();
        panel.style.setProperty("--mx", `${x - r.left}px`);
        panel.style.setProperty("--my", `${y - r.top}px`);
      });
    };
    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const onLeave = () => {
      x = -9999;
      y = -9999;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [root]);
}
