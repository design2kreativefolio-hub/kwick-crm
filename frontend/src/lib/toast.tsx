"use client";

import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastType = "success" | "error" | "info";
type ToastItem = { id: number; message: string; type: ToastType };

type ToastContextValue = {
  showToast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const TYPE_META: Record<ToastType, { icon: string; color: string }> = {
  success: { icon: "bi-check-circle-fill", color: "var(--success)" },
  error: { icon: "bi-x-circle-fill", color: "var(--danger)" },
  info: { icon: "bi-info-circle-fill", color: "var(--gold)" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={host}>
        <AnimatePresence>
          {toasts.map((t) => {
            const meta = TYPE_META[t.type];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                style={toastStyle}
              >
                <i className={`bi ${meta.icon}`} style={{ color: meta.color, fontSize: 17 }} />
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{t.message}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

const host: React.CSSProperties = {
  position: "fixed",
  bottom: 24,
  right: 24,
  zIndex: 1000,
  display: "flex",
  flexDirection: "column-reverse",
  gap: 10,
  pointerEvents: "none",
};
const toastStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  background: "var(--surface)",
  border: "1px solid var(--border)",
  boxShadow: "var(--shadow)",
  borderRadius: 12,
  padding: "12px 18px",
  minWidth: 240,
  maxWidth: 360,
  pointerEvents: "auto",
};
