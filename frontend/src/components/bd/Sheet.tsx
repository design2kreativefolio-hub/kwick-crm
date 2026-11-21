"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Bottom sheet on phones, centred dialog from 720px up. Built for one-handed
 * use in the field — the log/schedule flows must be completable in a few taps.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const reduce = useReducedMotion();
  const pressedOverlay = useRef(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="bd-sheet-overlay"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? undefined : { opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.15 }}
          onMouseDown={(e) => {
            pressedOverlay.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            if (pressedOverlay.current && e.target === e.currentTarget) onClose();
            pressedOverlay.current = false;
          }}
        >
          <motion.div
            className={`bd-sheet${wide ? " bd-sheet--wide" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={reduce ? false : { y: 48, opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? undefined : { y: 48, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="bd-sheet__grab" />
            <div className="bd-sheet__head">
              <h3>{title}</h3>
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
                <i className="bi bi-x-lg" />
              </button>
            </div>
            <div className="bd-sheet__body">
              {children}
              {footer && <div className="bd-sheet__foot">{footer}</div>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
