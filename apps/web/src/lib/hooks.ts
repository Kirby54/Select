"use client";

import { useSyncExternalStore } from "react";

/**
 * Live media query. The server snapshot assumes a desktop window; the client corrects it on hydration.
 * Used where two layouts must not both be mounted (duplicate stateful controls, duplicate text).
 */
export function useMediaQuery(query: string, serverValue = true): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export const useIsDesktop = () => useMediaQuery("(min-width: 768px)");
