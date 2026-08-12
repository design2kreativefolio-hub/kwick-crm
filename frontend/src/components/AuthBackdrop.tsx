"use client";

import { useReducedMotion } from "framer-motion";

import { EdithPlexus } from "@/components/EdithPlexus";

/** Subtle animated navy backdrop for auth screens (login / register / etc.). */
export function AuthBackdrop() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="auth-backdrop" aria-hidden>
      <div className="auth-backdrop__glow auth-backdrop__glow--a" />
      <div className="auth-backdrop__glow auth-backdrop__glow--b" />
      <EdithPlexus mode="intro" className="auth-backdrop__plexus" paused={!!reduceMotion} />
    </div>
  );
}
