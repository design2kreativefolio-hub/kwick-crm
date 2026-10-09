"use client";

import { useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Route enter: soft rise + unblur. Keyed on pathname so every page switch
 * remounts the wrapper and replays the CSS page-enter animation. The cascade
 * on cards and table rows lives in globals.css.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <div
      key={pathname}
      className="page-transition"
      style={reduceMotion ? undefined : { animation: "page-enter 0.45s cubic-bezier(0.22, 1, 0.36, 1) both" }}
    >
      {children}
    </div>
  );
}
