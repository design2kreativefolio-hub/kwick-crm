"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type CalFilterValue = {
  /** Which kinds of work to show on the calendar. */
  kinds: { content: boolean; task: boolean; project: boolean };
  /** Content types to show (empty = all). */
  types: string[];
  /** Statuses to show (empty = all). */
  statuses: string[];
};

export const EMPTY_CAL_FILTER: CalFilterValue = {
  kinds: { content: true, task: true, project: true },
  types: [],
  statuses: [],
};

export function calFilterCount(f: CalFilterValue): number {
  const hiddenKinds = Object.values(f.kinds).filter((v) => !v).length;
  return hiddenKinds + (f.types.length ? 1 : 0) + (f.statuses.length ? 1 : 0);
}

const KINDS: { key: keyof CalFilterValue["kinds"]; label: string; icon: string }[] = [
  { key: "content", label: "Content posts", icon: "bi-images" },
  { key: "task", label: "Tasks", icon: "bi-check2-square" },
  { key: "project", label: "Mini-projects", icon: "bi-kanban" },
];

/**
 * Filter button + popover for the client calendar: show only content, only the other work
 * (tasks / mini-projects), one content type, or one status. The button's colours follow the
 * header it sits on so it stays readable on any client colour.
 */
export function ClientCalFilter({
  value,
  onChange,
  typeOptions,
  statusOptions,
  fg,
  soft,
}: {
  value: CalFilterValue;
  onChange: (v: CalFilterValue) => void;
  typeOptions: { value: string; label: string }[];
  statusOptions: { value: string; label: string }[];
  /** Text colour on the header (dark or white) and a translucent fill that suits it. */
  fg: string;
  soft: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const n = calFilterCount(value);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = Math.min(340, window.innerWidth - 16);
    setPos({ top: r.bottom + 8, left: Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("resize", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="cf-btn"
        style={{ background: soft, color: fg }}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <i className="bi bi-funnel-fill" /> Filter
        {n > 0 && <span className="cf-btn__n">{n}</span>}
      </button>

      {open &&
        createPortal(
          <>
            <div className="cf-backdrop" onClick={() => setOpen(false)} />
            <div className="cf-panel" role="dialog" aria-label="Filter calendar" style={{ top: pos?.top ?? -999, left: pos?.left ?? -999 }}>
              <div className="cf-head">
                <b>Filter calendar</b>
                {n > 0 && (
                  <button type="button" className="cf-reset" onClick={() => onChange(EMPTY_CAL_FILTER)}>
                    Reset
                  </button>
                )}
              </div>

              <div className="cf-label">Show</div>
              <div className="cf-chips">
                {KINDS.map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    className={`cf-chip${value.kinds[k.key] ? " is-on" : ""}`}
                    aria-pressed={value.kinds[k.key]}
                    onClick={() => onChange({ ...value, kinds: { ...value.kinds, [k.key]: !value.kinds[k.key] } })}
                  >
                    <i className={`bi ${k.icon}`} /> {k.label}
                  </button>
                ))}
              </div>
              <div className="cf-quick">
                <button
                  type="button"
                  onClick={() => onChange({ ...value, kinds: { content: false, task: true, project: true } })}
                >
                  Only other work
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...value, kinds: { content: true, task: false, project: false } })}
                >
                  Only content
                </button>
                <button type="button" onClick={() => onChange({ ...value, kinds: { content: true, task: true, project: true } })}>
                  Show all
                </button>
              </div>

              <div className="cf-label">Type of work {value.types.length === 0 && <span>· all</span>}</div>
              <div className="cf-chips">
                {typeOptions.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    className={`cf-chip${value.types.includes(t.value) ? " is-on" : ""}`}
                    aria-pressed={value.types.includes(t.value)}
                    onClick={() => onChange({ ...value, types: toggleIn(value.types, t.value) })}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="cf-label">Status {value.statuses.length === 0 && <span>· all</span>}</div>
              <div className="cf-chips">
                {statusOptions.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className={`cf-chip${value.statuses.includes(s.value) ? " is-on" : ""}`}
                    aria-pressed={value.statuses.includes(s.value)}
                    onClick={() => onChange({ ...value, statuses: toggleIn(value.statuses, s.value) })}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <button type="button" className="btn cf-done" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </>,
          document.body
        )}
    </>
  );
}
