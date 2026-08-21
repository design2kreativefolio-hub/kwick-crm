"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Z_MODAL } from "@/lib/placeFixedPanel";

/** Shared centered overlay/card shell — blurred backdrop, focus animation. */
export function Modal({
  open,
  onClose,
  children,
  maxWidth = 480,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
  /** Wider horizontal form layout (project / task / content). */
  wide?: boolean;
}) {
  // Only close when the press starts AND ends on the overlay itself — prevents
  // scroll/drag releases (and Select portal interactions) from dismissing.
  const overlayPress = useRef(false);
  const reduceMotion = useReducedMotion();
  const duration = reduceMotion ? 0 : 0.22;
  const resolvedMax = wide ? Math.max(maxWidth, 920) : maxWidth;
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="kwick-modal-overlay"
          style={{ ...overlay }}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
          onMouseDown={(e) => {
            overlayPress.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            if (overlayPress.current && e.target === e.currentTarget) onClose();
            overlayPress.current = false;
          }}
        >
          <motion.div
            className={`card kwick-modal-card${wide ? " kwick-modal-card--wide" : ""}`}
            style={{ ...card, maxWidth: resolvedMax }}
            onClick={(e) => e.stopPropagation()}
            initial={reduceMotion ? false : { opacity: 0, y: 28, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 18, scale: 0.96 }}
            transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(5, 8, 18, 0.62)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  display: "grid",
  placeItems: "center",
  zIndex: Z_MODAL,
  padding: 16,
  overflowY: "auto",
};
const card: React.CSSProperties = {
  width: "100%",
  height: "auto",
  maxHeight: "90vh",
  overflowY: "auto",
  alignSelf: "center",
  boxShadow: "0 24px 64px rgba(0, 0, 0, 0.35)",
};
