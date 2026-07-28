"use client";

import { motion } from "framer-motion";

// template.tsx re-mounts on every navigation within this route group (unlike
// layout.tsx, which persists) — that's what makes a per-page transition work.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
