"use client";

import { useReducedMotion } from "framer-motion";

type Size = "xs" | "sm" | "md" | "lg";

/**
 * Iridescent EDITH orb — pearlescent swirl + soft halo (assistant mark).
 */
export function EdithOrb({
  size = "md",
  className = "",
  paused = false,
}: {
  size?: Size;
  className?: string;
  paused?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const still = paused || !!reduceMotion;

  return (
    <span
      className={`edith-orb edith-orb--${size}${still ? " is-still" : ""} ${className}`.trim()}
      aria-hidden
    >
      <span className="edith-orb__halo" />
      <span className="edith-orb__sphere">
        <span className="edith-orb__swirl" />
        <span className="edith-orb__shine" />
      </span>
    </span>
  );
}
