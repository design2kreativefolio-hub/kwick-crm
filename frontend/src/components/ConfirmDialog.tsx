"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Z_CONFIRM } from "@/lib/placeFixedPanel";

type ConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When set, a third action: leave without saving. Resolves to `"discard"`. */
  discardLabel?: string;
  danger?: boolean;
};

/**
 * Custom-styled stand-in for window.confirm(). Call `confirm(message, opts)`
 * from any async handler and `await` it just like the browser dialog — but
 * render `{ConfirmDialog}` once in the component's JSX so it can actually
 * show up in the app's own UI instead of the browser's native prompt.
 *
 * Resolves `true` (confirm), `false` (cancel / click outside), or `"discard"`
 * when `discardLabel` is used.
 */
export function useConfirm() {
  const [state, setState] = useState<{ message: string; options: ConfirmOptions } | null>(null);
  const resolver = useRef<((value: boolean | "discard") => void) | null>(null);
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const confirm = useCallback((message: string, options: ConfirmOptions = {}) => {
    setState({ message, options });
    return new Promise<boolean | "discard">((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const respond = (value: boolean | "discard") => {
    resolver.current?.(value);
    resolver.current = null;
    setState(null);
  };

  const ConfirmDialog =
    mounted &&
    createPortal(
      <AnimatePresence>
        {state && (
          <motion.div
            style={overlay}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.15 }}
            onClick={() => respond(false)}
          >
            <motion.div
              className="card"
              style={card}
              onClick={(e) => e.stopPropagation()}
              initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
            >
              <span className="card-title" style={{ margin: 0 }}>{state.options.title || "Are you sure?"}</span>
              <p className="muted" style={{ marginTop: 12, marginBottom: 0, fontSize: 14, whiteSpace: "pre-line", color: "var(--text-muted)" }}>
                {state.message}
              </p>
              <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn"
                  style={state.options.danger ? { background: "var(--danger)" } : undefined}
                  onClick={() => respond(true)}
                  autoFocus
                >
                  {state.options.confirmLabel || "Confirm"}
                </button>
                {state.options.discardLabel && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ color: "var(--danger)" }}
                    onClick={() => respond("discard")}
                  >
                    {state.options.discardLabel}
                  </button>
                )}
                <button type="button" className="btn btn-ghost" onClick={() => respond(false)}>
                  {state.options.cancelLabel || "Cancel"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    );

  return { confirm, ConfirmDialog };
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(7, 11, 22, 0.55)",
  display: "grid",
  placeItems: "center",
  zIndex: Z_CONFIRM,
  padding: 16,
};

const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 400,
  height: "auto",
  maxHeight: "min(90vh, 420px)",
  overflowY: "auto",
  alignSelf: "center",
};
