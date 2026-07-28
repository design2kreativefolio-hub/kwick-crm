"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export type SelectOption = { value: string; label: string };

/**
 * Custom dropdown replacing native <select> — the browser's own popup can't
 * be styled (that's the "basic" look), so this renders the whole thing
 * ourselves: button trigger + an animated floating panel of options.
 */
export function Select({
  value,
  onChange,
  options,
  compact = false,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Narrower, auto-width trigger — for inline controls like chart scope pickers. */
  compact?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", width: compact ? "auto" : "100%" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="select-trigger"
        style={compact ? { width: "auto", padding: "7px 12px", fontSize: 12.5 } : undefined}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected?.label ?? "Select…"}
        </span>
        <i
          className="bi bi-chevron-down"
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            transition: "transform 0.15s ease",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="select-panel"
          >
            {options.map((o) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                className="select-option"
                data-active={o.value === value}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <span>{o.label}</span>
                {o.value === value && <i className="bi bi-check-lg" />}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
