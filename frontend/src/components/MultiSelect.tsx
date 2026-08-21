"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Z_POPOVER, placeFixedPanel } from "@/lib/placeFixedPanel";

export type MultiSelectOption = { value: string; label: string };

/**
 * Multi-select dropdown — same portaled floating-panel mechanics as Select,
 * but the trigger stays closed until clicked and each option toggles
 * independently via a checkbox instead of replacing the value.
 */
export function MultiSelect({
  values,
  onChange,
  options,
  placeholder = "Select…",
  ariaLabel,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const reposition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const estimated = Math.min(options.length * 38 + 12, 280);
    const measured = panelRef.current?.offsetHeight || 0;
    setRect(placeFixedPanel(r, { width: r.width, height: measured > 40 ? measured : estimated, minHeight: 80 }));
  };

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const id = requestAnimationFrame(() => reposition());
    return () => cancelAnimationFrame(id);
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = containerRef.current?.contains(target);
      const insidePanel = panelRef.current?.contains(target);
      if (!insideTrigger && !insidePanel) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = (e: Event) => {
      const target = e.target as Node | null;
      if (panelRef.current && target && (target === panelRef.current || panelRef.current.contains(target))) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", onClick, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onClick, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const toggle = (value: string) => {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  };

  const selectedLabels = options.filter((o) => values.includes(o.value)).map((o) => o.label);
  const triggerText =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length <= 3
      ? selectedLabels.join(", ")
      : `${selectedLabels.length} people selected`;

  const panel = open && rect && (
    <motion.div
      ref={panelRef}
      role="listbox"
      aria-multiselectable="true"
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.14, ease: "easeOut" }}
      className="select-panel"
      style={{
        position: "fixed",
        top: rect.top,
        left: rect.left,
        width: rect.width,
        right: "auto",
        zIndex: Z_POPOVER,
        maxHeight: rect.maxHeight,
        overflowY: "auto",
      }}
    >
      {options.length === 0 && (
        <div className="select-option muted" style={{ cursor: "default" }}>No options.</div>
      )}
      {options.map((o) => {
        const checked = values.includes(o.value);
        return (
          <label
            key={o.value}
            role="option"
            aria-selected={checked}
            className="select-option select-option--multi"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(o.value)}
            />
            <span>{o.label}</span>
          </label>
        );
      })}
    </motion.div>
  );

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="select-trigger"
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: selectedLabels.length ? undefined : "var(--text-muted)",
          }}
        >
          {triggerText}
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
      {mounted && createPortal(<AnimatePresence>{panel}</AnimatePresence>, document.body)}
    </div>
  );
}
