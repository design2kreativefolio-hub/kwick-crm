"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SelectOption = { value: string; label: string };

/**
 * Custom dropdown replacing native <select> — the browser's own popup can't
 * be styled (that's the "basic" look), so this renders the whole thing
 * ourselves: button trigger + an animated floating panel of options.
 *
 * The panel is rendered through a portal into document.body and positioned
 * with `fixed` coordinates computed from the trigger's own bounding box —
 * NOT as a CSS-absolute child of the trigger. A plain absolute child gets
 * silently clipped by any scrollable/overflow-hidden ancestor (e.g. a modal
 * with overflowY: auto) once the trigger sits near that ancestor's edge;
 * portaling to body escapes that entirely, the same fix real dropdown
 * libraries (Radix, Headless UI, etc.) use for this exact problem.
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
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => setMounted(true), []);

  const reposition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 6, left: r.left, width: r.width });
  };

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = containerRef.current?.contains(target);
      const insidePanel = panelRef.current?.contains(target);
      if (!insideTrigger && !insidePanel) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Scroll on ANY ancestor (capture: true catches non-bubbling scroll
    // events from nested scroll containers too, e.g. a modal body) closes
    // the panel rather than letting it drift away from its trigger.
    const onScroll = () => setOpen(false);
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
  }, []);

  const panel = open && rect && (
    <motion.ul
      ref={panelRef}
      role="listbox"
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.14, ease: "easeOut" }}
      className="select-panel"
      // z-index inline (not just the CSS class) since this is portaled to
      // document.body — it must out-rank every modal/overlay in the app
      // (currently up to z-index 50), not just whatever ambient value the
      // class happens to declare.
      style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width, right: "auto", zIndex: 1000 }}
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
      {mounted && createPortal(<AnimatePresence>{panel}</AnimatePresence>, document.body)}
    </div>
  );
}
