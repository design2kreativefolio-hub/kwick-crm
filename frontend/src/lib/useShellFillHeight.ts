"use client";

import { RefObject, useLayoutEffect } from "react";

/**
 * Force the calendar root to fill from its current top edge down to the
 * bottom of the sidebar / viewport. Uses setProperty(..., "important") so
 * responsive CSS cannot override with `height: auto !important`.
 */
export function useShellFillHeight(ref: RefObject<HTMLElement | null>, bottomGap = 8) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const mobile = window.matchMedia("(max-width: 900px)").matches;
      if (mobile) {
        el.style.removeProperty("height");
        el.style.removeProperty("max-height");
        el.style.removeProperty("min-height");
        return;
      }
      const sidebar = document.querySelector(".app-sidebar") as HTMLElement | null;
      const top = el.getBoundingClientRect().top;
      // Prefer matching the sidebar's bottom edge exactly when available.
      const bottom = sidebar
        ? sidebar.getBoundingClientRect().bottom
        : window.innerHeight;
      const next = Math.max(280, Math.floor(bottom - top - bottomGap));
      el.style.setProperty("height", `${next}px`, "important");
      el.style.setProperty("max-height", `${next}px`, "important");
      el.style.setProperty("min-height", `${next}px`, "important");
    };

    update();
    window.addEventListener("resize", update);
    // Re-run after layout / fonts / sticky topbar settle.
    const t1 = window.setTimeout(update, 0);
    const t2 = window.setTimeout(update, 100);
    const t3 = window.setTimeout(update, 300);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(document.documentElement);
    const sidebar = document.querySelector(".app-sidebar");
    if (sidebar) ro?.observe(sidebar);

    return () => {
      window.removeEventListener("resize", update);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      ro?.disconnect();
    };
  }, [ref, bottomGap]);
}
