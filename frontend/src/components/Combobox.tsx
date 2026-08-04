"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Free-text input with a custom-styled suggestions panel — for fields where
 * you can pick an existing value OR just type a new one (e.g. a project's
 * client name). A plain <input list="..."> + <datalist> looks right in the
 * markup but renders as the browser's own unstyleable native popup (same
 * reason Select.tsx exists instead of a real <select>) — this reuses the
 * exact same portal/positioning approach as Select so it matches the rest
 * of the app and never gets clipped or z-index-shadowed by a modal.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);

  useEffect(() => setMounted(true), []);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const pool = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return pool.slice(0, 8);
  }, [value, options]);

  const reposition = () => {
    const el = inputRef.current;
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
      const insideInput = containerRef.current?.contains(target);
      const insidePanel = panelRef.current?.contains(target);
      if (!insideInput && !insidePanel) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
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

  const panel = open && rect && filtered.length > 0 && (
    <motion.ul
      ref={panelRef}
      role="listbox"
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.14, ease: "easeOut" }}
      className="select-panel"
      style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width, right: "auto", zIndex: 1000 }}
    >
      {filtered.map((o) => (
        <li
          key={o}
          role="option"
          aria-selected={o === value}
          className="select-option"
          data-active={o === value}
          onClick={() => {
            onChange(o);
            setOpen(false);
          }}
        >
          <span>{o}</span>
        </li>
      ))}
    </motion.ul>
  );

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <input
        ref={inputRef}
        className="input"
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {mounted && createPortal(<AnimatePresence>{panel}</AnimatePresence>, document.body)}
    </div>
  );
}
