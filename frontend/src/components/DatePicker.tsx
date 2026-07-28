"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fromIso(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function formatDisplay(s: string) {
  return fromIso(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Custom calendar date picker — replaces the plain native date input. */
export function DatePicker({
  value,
  onChange,
  min,
  placeholder = "Select date",
  ariaLabel,
}: {
  /** ISO "YYYY-MM-DD", or "" for unset. */
  value: string;
  onChange: (value: string) => void;
  /** ISO "YYYY-MM-DD" — dates before this are disabled. */
  min?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => (value ? fromIso(value) : new Date()));
  const ref = useRef<HTMLDivElement>(null);

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

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const minDate = min ? fromIso(min) : null;
  const selected = value ? fromIso(value) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const pick = (day: number) => {
    const d = new Date(year, month, day);
    onChange(toIso(d));
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="select-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span style={{ color: value ? "var(--text)" : "var(--text-muted)" }}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <i className="bi bi-calendar3" style={{ fontSize: 14, color: "var(--text-muted)" }} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="select-panel"
            style={{ width: 260, padding: 12 }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <button
                type="button"
                className="icon-btn-anim"
                style={dpNavBtn}
                onClick={() => setViewMonth(new Date(year, month - 1, 1))}
                aria-label="Previous month"
              >
                <i className="bi bi-chevron-left" />
              </button>
              <strong style={{ fontSize: 13.5, color: "var(--navy)" }}>
                {viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </strong>
              <button
                type="button"
                className="icon-btn-anim"
                style={dpNavBtn}
                onClick={() => setViewMonth(new Date(year, month + 1, 1))}
                aria-label="Next month"
              >
                <i className="bi bi-chevron-right" />
              </button>
            </div>
            <div style={dpGrid}>
              {WEEKDAYS.map((w) => (
                <span key={w} style={dpWeekday}>{w}</span>
              ))}
              {cells.map((day, i) => {
                if (day === null) return <span key={`b${i}`} />;
                const cellDate = new Date(year, month, day);
                cellDate.setHours(0, 0, 0, 0);
                const disabled = !!minDate && cellDate < minDate;
                const isSelected =
                  !!selected &&
                  selected.getFullYear() === year &&
                  selected.getMonth() === month &&
                  selected.getDate() === day;
                const isToday = cellDate.getTime() === today.getTime();
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={disabled}
                    onClick={() => pick(day)}
                    style={dpDay(isSelected, isToday, disabled)}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const dpNavBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 6,
  display: "grid",
  placeItems: "center",
  fontSize: 12,
  color: "var(--navy)",
};
const dpGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 2,
};
const dpWeekday: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  color: "var(--text-muted)",
  textAlign: "center",
  padding: "4px 0",
};
function dpDay(selected: boolean, isToday: boolean, disabled: boolean): React.CSSProperties {
  return {
    width: 32,
    height: 32,
    border: "none",
    borderRadius: 8,
    fontSize: 12.5,
    display: "grid",
    placeItems: "center",
    background: selected ? "var(--navy)" : "transparent",
    color: disabled ? "var(--border)" : selected ? "#fff" : isToday ? "var(--gold)" : "var(--text)",
    fontWeight: selected || isToday ? 700 : 500,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
