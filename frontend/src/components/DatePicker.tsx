"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { CALENDAR_MONTHS, MonthYearSelect } from "@/components/MonthYearSelect";
import { Z_POPOVER, placeFixedPanel } from "@/lib/placeFixedPanel";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_SHORT = CALENDAR_MONTHS.map((m) => m.slice(0, 3).toLowerCase());

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
  return validYmd(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function validYmd(year: number, month: number, day: number): Date | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (year < 100) year += 2000;
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const d = new Date(year, month, day);
  if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return null;
  return d;
}

function formatDisplay(value: string | null | undefined) {
  const d = parseIso(value);
  if (!d) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Accept ISO, "Aug 10, 2026", "10 Aug 2026", 10/08/2026, 2026/08/10, etc. */
function parseTypedDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = parseIso(s);
  if (iso) return iso;

  const lower = s.toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ").trim();
  let monthIdx = -1;
  for (let i = 0; i < 12; i++) {
    const full = CALENDAR_MONTHS[i].toLowerCase();
    const short = MONTH_SHORT[i];
    if (lower.includes(full) || new RegExp(`\\b${short}\\b`).test(lower)) {
      monthIdx = i;
      break;
    }
  }
  const nums = (lower.match(/\d+/g) || []).map(Number);
  if (monthIdx >= 0 && nums.length >= 1) {
    const year = nums.find((n) => n > 31) ?? nums[nums.length - 1];
    const day = nums.find((n) => n <= 31 && n !== year) ?? nums[0];
    return validYmd(year, monthIdx, day);
  }

  const parts = s.split(/[./\-\s]+/).filter(Boolean);
  if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) {
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    const c = Number(parts[2]);
    if (a >= 1000) return validYmd(a, b - 1, c);
    const year = c;
    if (a > 12 && b <= 12) return validYmd(year, b - 1, a);
    if (b > 12 && a <= 12) return validYmd(year, a - 1, b);
    return validYmd(year, a - 1, b);
  }
  return null;
}

function addDays(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

function addMonths(d: Date, delta: number) {
  const month = d.getMonth() + delta;
  const last = new Date(d.getFullYear(), month + 1, 0).getDate();
  return new Date(d.getFullYear(), month, Math.min(d.getDate(), last));
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
 *
 * The field is a real text input: type a date, or open the calendar and
 * move with arrow keys.
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
  min?: string;
  max?: string;
}) {
  const selected = parseIso(value);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const [rect, setRect] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const [view, setView] = useState(() => {
    const base = selected ?? new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });
  const [cursor, setCursor] = useState<Date>(() => selected ?? new Date());
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (focused) return;
    setDraft(formatDisplay(value));
  }, [value, focused]);

  useEffect(() => {
    if (!open) return;
    const base = selected ?? new Date();
    setView({ year: base.getFullYear(), month: base.getMonth() });
    setCursor(base);
    // Only snap the cursor when the panel opens, not on every selected change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
      if (!insideTrigger && !insidePanel && !isInsideSelectPanel(target)) setOpen(false);
    };
    const onScroll = (e: Event) => {
      const target = e.target as Node | null;
      if (panelRef.current && target && (target === panelRef.current || panelRef.current.contains(target))) {
        return;
      }
      if (isInsideSelectPanel(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClick, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onClick, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const cells = useMemo(() => monthMatrix(view.year, view.month), [view.year, view.month]);
  const todayIso = toIso(new Date());
  const selectedIso = selected ? toIso(selected) : "";
  const cursorIso = toIso(cursor);
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

  const commitDate = (d: Date | null, close = false) => {
    if (!d) {
      onChange("");
      setDraft("");
      if (close) setOpen(false);
      return;
    }
    const iso = toIso(d);
    if (!inRange(iso)) return;
    onChange(iso);
    setDraft(formatDisplay(iso));
    setCursor(d);
    setView({ year: d.getFullYear(), month: d.getMonth() });
    if (close) setOpen(false);
  };

  const commitDraft = (text: string, close = false) => {
    const trimmed = text.trim();
    if (!trimmed) {
      commitDate(null, close);
      return true;
    }
    const d = parseTypedDate(trimmed);
    if (!d) {
      setDraft(formatDisplay(value));
      return false;
    }
    commitDate(d, close);
    return true;
  };

  const moveCursor = (next: Date) => {
    setCursor(next);
    setView({ year: next.getFullYear(), month: next.getMonth() });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setDraft(formatDisplay(value));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (open) {
        commitDate(cursor, true);
      } else {
        commitDraft(draft, false);
      }
      return;
    }
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      moveCursor(addDays(cursor, -1));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      moveCursor(addDays(cursor, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveCursor(addDays(cursor, -7));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveCursor(addDays(cursor, 7));
    } else if (e.key === "PageUp") {
      e.preventDefault();
      moveCursor(addMonths(cursor, e.shiftKey ? -12 : -1));
    } else if (e.key === "PageDown") {
      e.preventDefault();
      moveCursor(addMonths(cursor, e.shiftKey ? 12 : 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      moveCursor(addDays(cursor, -cursor.getDay()));
    } else if (e.key === "End") {
      e.preventDefault();
      moveCursor(addDays(cursor, 6 - cursor.getDay()));
    }
  };

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
          tabIndex={-1}
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
          tabIndex={-1}
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
          const isCursor = iso === cursorIso;
          const isToday = iso === todayIso;
          const allowed = inRange(iso);
          return (
            <button
              key={iso + String(cell.inMonth)}
              type="button"
              tabIndex={-1}
              disabled={!allowed}
              onClick={() => {
                if (!allowed) return;
                commitDate(cell.date, true);
              }}
              style={{
                height: 34,
                borderRadius: 8,
                border: isSelected || isCursor ? "1px solid var(--gold)" : "1px solid transparent",
                background: isSelected ? "var(--gold-soft)" : isToday ? "var(--panel-muted)" : "transparent",
                boxShadow: isCursor && !isSelected ? "0 0 0 2px var(--gold-soft)" : undefined,
                color: cell.inMonth ? "var(--text)" : "var(--text-muted)",
                opacity: !allowed ? 0.28 : cell.inMonth ? 1 : 0.45,
                fontWeight: isSelected || isToday || isCursor ? 700 : 500,
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
          onClick={() => commitDate(null, true)}
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
            commitDate(new Date(), true);
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
      <div
        ref={triggerRef}
        className="select-trigger date-picker-trigger"
        aria-expanded={open}
        style={{ opacity: disabled ? 0.6 : 1, cursor: disabled ? "not-allowed" : undefined }}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          autoComplete="off"
          disabled={disabled}
          value={focused || open ? draft : formatDisplay(value)}
          placeholder={placeholder}
          aria-label={ariaLabel || placeholder}
          aria-haspopup="dialog"
          aria-expanded={open}
          onFocus={() => {
            setFocused(true);
            setDraft(formatDisplay(value) || value || "");
            setOpen(true);
          }}
          onBlur={(e) => {
            const next = e.relatedTarget as Node | null;
            if (panelRef.current?.contains(next) || containerRef.current?.contains(next)) return;
            setFocused(false);
            commitDraft(draft);
          }}
          onChange={(e) => {
            const t = e.target.value;
            setDraft(t);
            const d = parseTypedDate(t);
            if (d) {
              setCursor(d);
              setView({ year: d.getFullYear(), month: d.getMonth() });
              if (!open) setOpen(true);
            }
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          className="date-picker-cal-btn"
          aria-label="Open calendar"
          onClick={() => {
            if (disabled) return;
            const next = !open;
            setOpen(next);
            inputRef.current?.focus();
          }}
        >
          <i className="bi bi-calendar3" />
        </button>
      </div>
      {mounted
        ? createPortal(<AnimatePresence>{panel}</AnimatePresence>, document.body)
        : null}
    </div>
  );
}

export { CALENDAR_MONTHS, toIso as datePickerToIso };
