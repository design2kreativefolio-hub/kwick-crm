"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useRef, useState } from "react";

type ConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

/**
 * Custom-styled stand-in for window.confirm(). Call `confirm(message, opts)`
 * from any async handler and `await` it just like the browser dialog — but
 * render `{ConfirmDialog}` once in the component's JSX so it can actually
 * show up in the app's own UI instead of the browser's native prompt.
 */
export function useConfirm() {
  const [state, setState] = useState<{ message: string; options: ConfirmOptions } | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((message: string, options: ConfirmOptions = {}) => {
    setState({ message, options });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const respond = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setState(null);
  };

  const ConfirmDialog = (
    <AnimatePresence>
      {state && (
        <motion.div
          style={overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={() => respond(false)}
        >
          <motion.div
            className="card"
            style={card}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <span className="card-title" style={{ margin: 0 }}>{state.options.title || "Are you sure?"}</span>
            <p style={{ marginTop: 12, marginBottom: 0, fontSize: 14, whiteSpace: "pre-line", color: "var(--muted-text, #5b6178)" }}>
              {state.message}
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="btn"
                style={state.options.danger ? { background: "var(--danger)" } : undefined}
                onClick={() => respond(true)}
                autoFocus
              >
                {state.options.confirmLabel || "Confirm"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => respond(false)}>
                {state.options.cancelLabel || "Cancel"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return { confirm, ConfirmDialog };
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(16, 19, 63, 0.35)",
  display: "grid",
  placeItems: "center",
  zIndex: 60,
  padding: 16,
};

const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 400,
};
