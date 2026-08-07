"use client";

import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

/** Shared centered overlay/card shell — same look as useConfirm's dialog. */
export function Modal({
  open,
  onClose,
  children,
  maxWidth = 480,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
}) {
  // Only close when the press starts AND ends on the overlay itself — prevents
  // scroll/drag releases (and Select portal interactions) from dismissing.
  const overlayPress = useRef(false);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          style={overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => {
            overlayPress.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            if (overlayPress.current && e.target === e.currentTarget) onClose();
            overlayPress.current = false;
          }}
        >
          <motion.div
            className="card"
            style={{ ...card, maxWidth }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(16, 19, 63, 0.35)",
  display: "grid",
  placeItems: "center",
  zIndex: 60,
  padding: 16,
  overflowY: "auto",
};
const card: React.CSSProperties = {
  width: "100%",
  maxHeight: "90vh",
  overflowY: "auto",
};
