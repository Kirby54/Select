"use client";

import { useEffect, useState } from "react";

import { cx } from "../ui/primitives";
import { BrandMark } from "./logo";

/** The few window calls the title bar needs, from Tauri's global API (`withGlobalTauri`). */
interface TauriWindow {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
}
declare global {
  interface Window {
    __TAURI__?: { window?: { getCurrentWindow(): TauriWindow } };
  }
}

/**
 * Built-in title bar, drawn only inside the Select desktop window (which has no Windows frame), as in Whale.
 * In a normal browser nothing is rendered and the layout is unchanged.
 */
export function DesktopTitlebar() {
  const [win, setWin] = useState<TauriWindow | null>(null);

  useEffect(() => {
    const current = window.__TAURI__?.window?.getCurrentWindow();
    if (!current) return;
    document.body.classList.add("desktop");
    queueMicrotask(() => setWin(current));
    return () => document.body.classList.remove("desktop");
  }, []);

  if (!win) return null;
  const button = "grid h-full w-[46px] place-items-center text-muted transition-colors hover:bg-white/10 hover:text-white";
  return (
    <div data-tauri-drag-region className="fixed inset-x-0 top-0 z-[90] flex h-8 items-stretch justify-between border-b border-line-soft bg-black select-none">
      <div data-tauri-drag-region className="flex flex-1 items-center gap-2 pl-3 text-xs text-faint">
        <BrandMark className="pointer-events-none size-[15px]" />
        <span data-tauri-drag-region>Select</span>
      </div>
      <div className="flex">
        <button type="button" className={button} aria-label="Minimize" title="Minimize" onClick={() => void win.minimize()}>
          <svg viewBox="0 0 10 10" className="size-2.5 fill-none stroke-current" aria-hidden><path d="M1 5h8" /></svg>
        </button>
        <button type="button" className={button} aria-label="Maximize" title="Maximize" onClick={() => void win.toggleMaximize()}>
          <svg viewBox="0 0 10 10" className="size-2.5 fill-none stroke-current" aria-hidden><rect x="1.5" y="1.5" width="7" height="7" /></svg>
        </button>
        <button type="button" className={cx(button, "hover:bg-window-close")} aria-label="Close" title="Close" onClick={() => void win.close()}>
          <svg viewBox="0 0 10 10" className="size-2.5 fill-none stroke-current" aria-hidden><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" /></svg>
        </button>
      </div>
    </div>
  );
}
