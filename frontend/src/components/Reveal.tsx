"use client";

import { motion, useReducedMotion } from "framer-motion";

/** Soft cascade on dashboard sections — kept light so it doesn't fight route motion. */
export function Reveal({
  children,
  index = 0,
  style,
}: {
  children: React.ReactNode;
  index?: number;
  style?: React.CSSProperties;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { duration: 0.28, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }
      }
      style={style}
    >
      {children}
    </motion.div>
  );
}
