"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { CALENDAR_MONTHS, MonthYearSelect } from "@/components/MonthYearSelect";
import { Z_POPOVER, placeFixedPanel } from "@/lib/placeFixedPanel";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toIso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDisplay(value: string | null | undefined) {
  const d = parseIso(value);
  if (!d) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function isInsideSelectPanel(target: EventTarget | null) {
  const el = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  return Boolean(el?.closest(".select-panel"));
}

function monthMatrix(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ day: number; inMonth: boolean; date: Date }> = [];
  for (let i = 0; i < startPad; i++) {
    const d = new Date(year, month, -startPad + i + 1);
    cells.push({ day: d.getDate(), inMonth: false, date: d });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, inMonth: true, date: new Date(year, month, day) });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    const d = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
    cells.push({ day: d.getDate(), inMonth: false, date: d });
  }
  return cells;
}

/**
 * Calendar date picker — panel is portaled to document.body with fixed
 * positioning (same approach as Select) so it doesn't flicker/clip when the
 * page scrolls or when ancestors use overflow/transform.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Select date",
  ariaLabel,
  disabled = false,
  min,
  max,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** ISO date (YYYY-MM-DD) — days before this are not selectable. */
  min?: string;
  /** ISO date (YYYY-MM-DD) — days after this are not selectable. */
  max?: string;
}) {
  const selected = parseIso(value);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const [view, setView] = useState(() => {
    const base = selected ?? new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const base = selected ?? new Date();
    setView({ year: base.getFullYear(), month: base.getMonth() });
  }, [open, selected]);

  const reposition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const panelW = Math.min(320, Math.max(r.width, 280));
    const measured = panelRef.current?.offsetHeight || 0;
    const height = measured > 80 ? measured : 360;
    setRect(placeFixedPanel(r, { width: panelW, height, minHeight: 240 }));
  };

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const id = requestAnimationFrame(() => reposition());
    return () => cancelAnimationFrame(id);
  }, [open, view.year, view.month]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = containerRef.current?.contains(target);
      const insidePanel = panelRef.current?.contains(target);
      // Month/year menus are portaled to document.body, so treat them as part of the picker.
      if (!insideTrigger && !insidePanel && !isInsideSelectPanel(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = (e: Event) => {
      const target = e.target as Node | null;
      if (panelRef.current && target && (target === panelRef.current || panelRef.current.contains(target))) {
        return;
      }
      if (isInsideSelectPanel(target)) return;
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

  const cells = useMemo(() => monthMatrix(view.year, view.month), [view.year, view.month]);
  const todayIso = toIso(new Date());
  const selectedIso = selected ? toIso(selected) : "";
  const minIso = min?.trim() || "";
  const maxIso = max?.trim() || "";
  const inRange = (iso: string) => {
    if (minIso && iso < minIso) return false;
    if (maxIso && iso > maxIso) return false;
    return true;
  };
  const todayAllowed = inRange(todayIso);

  const minYear = minIso ? Number(minIso.slice(0, 4)) : undefined;
  const maxYear = maxIso ? Number(maxIso.slice(0, 4)) : undefined;

  const panel = open && rect && (
    <motion.div
      ref={panelRef}
      role="dialog"
      aria-label="Choose date"
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.14, ease: "easeOut" }}
      className="select-panel date-picker-panel"
      style={{
        position: "fixed",
        top: rect.top,
        left: rect.left,
        width: rect.width,
        maxWidth: 320,
        maxHeight: rect.maxHeight,
        overflowY: "auto",
        zIndex: Z_POPOVER,
        padding: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <button
          type="button"
          className="btn btn-ghost"
          aria-label="Previous month"
          onClick={() =>
            setView((v) => {
              const m = v.month - 1;
              return m < 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: m };
            })
          }
          style={{ padding: "4px 8px" }}
        >
          <i className="bi bi-chevron-left" />
        </button>
        <MonthYearSelect
          month={view.month}
          year={view.year}
          yearFrom={minYear}
          yearTo={maxYear}
          onMonthChange={(month) => setView((v) => ({ ...v, month }))}
          onYearChange={(year) => setView((v) => ({ ...v, year }))}
        />
        <button
          type="button"
          className="btn btn-ghost"
          aria-label="Next month"
          onClick={() =>
            setView((v) => {
              const m = v.month + 1;
              return m > 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: m };
            })
          }
          style={{ padding: "4px 8px" }}
        >
          <i className="bi bi-chevron-right" />
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 4,
          marginBottom: 6,
          textAlign: "center",
          fontSize: 11,
          color: "var(--text-muted)",
          fontWeight: 600,
        }}
      >
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map((cell) => {
          const iso = toIso(cell.date);
          const isSelected = iso === selectedIso;
          const isToday = iso === todayIso;
          const allowed = inRange(iso);
          return (
            <button
              key={iso + String(cell.inMonth)}
              type="button"
              disabled={!allowed}
              onClick={() => {
                if (!allowed) return;
                onChange(iso);
                setOpen(false);
              }}
              style={{
                height: 34,
                borderRadius: 8,
                border: isSelected ? "1px solid var(--gold)" : "1px solid transparent",
                background: isSelected ? "var(--gold-soft)" : isToday ? "var(--panel-muted)" : "transparent",
                color: cell.inMonth ? "var(--text)" : "var(--text-muted)",
                opacity: !allowed ? 0.28 : cell.inMonth ? 1 : 0.45,
                fontWeight: isSelected || isToday ? 700 : 500,
                fontSize: 13,
                cursor: allowed ? "pointer" : "not-allowed",
              }}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            onChange("");
            setOpen(false);
          }}
          style={{ padding: "6px 10px", fontSize: 12.5 }}
        >
          Clear
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!todayAllowed}
          onClick={() => {
            if (!todayAllowed) return;
            onChange(todayIso);
            setOpen(false);
          }}
          style={{ padding: "6px 10px", fontSize: 12.5, opacity: todayAllowed ? 1 : 0.45 }}
        >
          Today
        </button>
      </div>
    </motion.div>
  );

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel || placeholder}
        className="select-trigger"
        style={{ opacity: disabled ? 0.6 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {formatDisplay(value) || <span style={{ color: "var(--text-muted)" }}>{placeholder}</span>}
        </span>
        <i className="bi bi-calendar3" style={{ fontSize: 14, color: "var(--text-muted)", flexShrink: 0 }} />
      </button>
      {mounted
        ? createPortal(<AnimatePresence>{panel}</AnimatePresence>, document.body)
        : null}
    </div>
  );
}

export { CALENDAR_MONTHS, toIso as datePickerToIso };
