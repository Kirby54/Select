"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useOverview } from "@/lib/queries";
import type { Overview } from "@/lib/types";
import { PyramidScene, type SceneBand } from "./pyramid-scene";

/** The five task statuses, stacked from the base (done) to the apex (blocked). */
export function taskBands(o: Overview | undefined, cid: string): SceneBand[] {
  const t = o?.tasks ?? { done: 0, todo: 0, in_progress: 0, awaiting_approval: 0, blocked: 0 };
  return [
    { key: "done", label: "Done", count: t.done, color: "#8b7cf6", href: `/c/${cid}/tasks` },
    { key: "todo", label: "To do", count: t.todo, color: "#2dd4bf", href: `/c/${cid}/tasks` },
    { key: "in_progress", label: "In progress", count: t.in_progress, color: "#4f8cf7", href: `/c/${cid}/tasks` },
    { key: "awaiting_approval", label: "Waiting for you", count: t.awaiting_approval, color: "#facc15", href: `/c/${cid}/approvals` },
    { key: "blocked", label: "Blocked", count: t.blocked, color: "#fb923c", href: `/c/${cid}/tasks` },
  ];
}

const SelectedBand = createContext<{ selected: number; setSelected: (i: number) => void }>({ selected: -1, setSelected: () => undefined });
export const useSelectedBand = () => useContext(SelectedBand);

/**
 * The pyramids behind every page of a company, so the glass panels always have something to show through.
 * Full strength on Home, dimmed elsewhere so dense pages stay easy to read; hidden on the org chart, which
 * draws its own 3D pyramid. Mounted once in the shell: it keeps running while you move between pages.
 */
export function SceneBackdrop({ cid, children }: { cid: string; children: ReactNode }) {
  const overview = useOverview(cid, 30);
  const pathname = usePathname();
  const [selected, setSelected] = useState(-1);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    queueMicrotask(() => setHost(document.body));
  }, []);
  const bands = useMemo(() => taskBands(overview.data, cid), [overview.data, cid]);
  const page = pathname.split("/")[3];
  const home = page === "overview" || page === undefined;
  const hidden = page === "organization";
  const value = useMemo(() => ({ selected, setSelected }), [selected]);
  return (
    <SelectedBand.Provider value={value}>
      {host && createPortal(
        <div
          className="fixed inset-0 z-0 transition-opacity duration-500"
          style={{ opacity: hidden ? 0 : home ? 1 : 0.32, pointerEvents: home ? "auto" : "none" }}
          aria-hidden={!home}
        >
          <PyramidScene bands={bands} selected={home ? selected : -1} paused={hidden} lowPower={!home} className="relative h-full w-full overflow-hidden bg-black" />
        </div>,
        host,
      )}
      {children}
    </SelectedBand.Provider>
  );
}
