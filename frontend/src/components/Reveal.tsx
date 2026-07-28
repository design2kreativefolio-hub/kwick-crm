"use client";

import { motion } from "framer-motion";

// Staggered fade+slide-up for dashboard sections on load. `index` drives the
// delay so sections cascade in rather than popping at once.
export function Reveal({
  children,
  index = 0,
  style,
}: {
  children: React.ReactNode;
  index?: number;
  style?: React.CSSProperties;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.07, ease: "easeOut" }}
      style={style}
    >
      {children}
    </motion.div>
  );
}
