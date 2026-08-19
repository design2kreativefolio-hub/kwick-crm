"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Z_POPOVER, placeFixedPanel } from "@/lib/placeFixedPanel";

export type SelectOption = { value: string; label: string };

const OPTION_ROW_HEIGHT = 38;
const PANEL_PADDING = 12;

type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Narrower, auto-width trigger — for inline controls like chart scope pickers. */
  compact?: boolean;
  ariaLabel?: string;
  /** Max rows visible before the panel scrolls (e.g. 6 for month/year pickers). */
  maxVisibleOptions?: number;
  /** Light trigger for colored calendar headers. */
  variant?: "default" | "light";
  /** Minimum trigger/panel width in px. */
  minPanelWidth?: number;
};

/**
 * Custom dropdown replacing native <select> — portaled to document.body so
 * options are never clipped by overflow-hidden ancestors (modals, cards, etc.).
 */
export function Select({
  value,
  onChange,
  options,
  compact = false,
  ariaLabel,
  maxVisibleOptions,
  variant = "default",
  minPanelWidth = 148,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const selected = options.find((o) => o.value === value);

  const panelMaxHeight = useMemo(() => {
    if (!maxVisibleOptions) return undefined;
    const rows = Math.min(options.length, maxVisibleOptions);
    return rows * OPTION_ROW_HEIGHT + PANEL_PADDING;
  }, [maxVisibleOptions, options.length]);

  useEffect(() => setMounted(true), []);

  const reposition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const minWidth = Math.max(r.width, minPanelWidth);
    const visibleRows = maxVisibleOptions ? Math.min(options.length, maxVisibleOptions) : options.length;
    const estimatedHeight = visibleRows * OPTION_ROW_HEIGHT + PANEL_PADDING;
    const measured = panelRef.current?.offsetHeight || 0;
    setRect(
      placeFixedPanel(r, {
        width: minWidth,
        height: measured > 40 ? measured : estimatedHeight,
        minHeight: 80,
      })
    );
  };

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const id = requestAnimationFrame(() => reposition());
    return () => cancelAnimationFrame(id);
  }, [open, options.length, maxVisibleOptions]);

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
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const panel = open && rect && (
    <motion.ul
      ref={panelRef}
      role="listbox"
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.14, ease: "easeOut" }}
      className="select-panel"
      onWheel={(e) => e.stopPropagation()}
      onScroll={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: rect.top,
        left: rect.left,
        minWidth: rect.width,
        width: "max-content",
        maxWidth: 320,
        maxHeight: panelMaxHeight ? Math.min(panelMaxHeight, rect.maxHeight) : rect.maxHeight,
        overflowY: "auto",
        right: "auto",
        zIndex: Z_POPOVER,
        padding: 6,
      }}
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
  );

  return (
    <div ref={containerRef} style={{ position: "relative", width: compact ? "auto" : "100%" }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`select-trigger${variant === "light" ? " select-trigger--light" : ""}`}
        style={compact ? { width: "auto", minWidth: minPanelWidth, padding: "7px 12px", fontSize: 12.5 } : undefined}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected?.label ?? "Select…"}
        </span>
        <i
          className="bi bi-chevron-down"
          style={{
            fontSize: 11,
            color: variant === "light" ? "rgba(255,255,255,0.85)" : "var(--text-muted)",
            transition: "transform 0.15s ease",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </button>
      {mounted && createPortal(<AnimatePresence>{panel}</AnimatePresence>, document.body)}
    </div>
  );
}
