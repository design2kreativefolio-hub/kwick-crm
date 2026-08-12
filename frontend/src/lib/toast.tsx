"use client";

import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastType = "success" | "error" | "info";
type ToastItem = { id: number; message: string; type: ToastType; onClick?: () => void };

type ToastContextValue = {
  showToast: (message: string, type?: ToastType, onClick?: () => void) => void;
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

  const showToast = useCallback((message: string, type: ToastType = "success", onClick?: () => void) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, type, onClick }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="kwick-toast-host" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => {
            const meta = TYPE_META[t.type];
            return (
              <motion.div
                key={t.id}
                layout
                className="kwick-toast"
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                onClick={() => {
                  if (t.onClick) {
                    t.onClick();
                    setToasts((prev) => prev.filter((x) => x.id !== t.id));
                  }
                }}
                style={{ cursor: t.onClick ? "pointer" : "default" }}
              >
                <i className={`bi ${meta.icon}`} style={{ color: meta.color, fontSize: 17 }} />
                <span className="kwick-toast__msg">{t.message}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
