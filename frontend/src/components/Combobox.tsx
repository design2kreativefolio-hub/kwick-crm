"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Z_POPOVER, placeFixedPanel } from "@/lib/placeFixedPanel";

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
  const [rect, setRect] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);

  useEffect(() => setMounted(true), []);

  const filtered = useMemo(() => {
    const q = (value || "").trim().toLowerCase();
    const pool = q ? options.filter((o) => typeof o === "string" && o.toLowerCase().includes(q)) : options.filter((o) => typeof o === "string");
    return pool.slice(0, 8);
  }, [value, options]);

  const reposition = () => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const estimated = filtered.length * 38 + 12;
    const measured = panelRef.current?.offsetHeight || 0;
    setRect(placeFixedPanel(r, { width: r.width, height: measured > 40 ? measured : estimated, minHeight: 80 }));
  };

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const id = requestAnimationFrame(() => reposition());
    return () => cancelAnimationFrame(id);
  }, [open, filtered.length]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideInput = containerRef.current?.contains(target);
      const insidePanel = panelRef.current?.contains(target);
      if (!insideInput && !insidePanel) setOpen(false);
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

  const panel = open && rect && filtered.length > 0 && (
    <motion.ul
      ref={panelRef}
      role="listbox"
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
        maxHeight: rect.maxHeight,
        overflowY: "auto",
        right: "auto",
        zIndex: Z_POPOVER,
      }}
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
