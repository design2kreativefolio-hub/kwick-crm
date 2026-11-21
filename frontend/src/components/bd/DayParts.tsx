"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ContactBar } from "@/components/bd/ContactBar";
import { ScoreBadge } from "@/components/bd/ScoreBadge";
import type { DayItem } from "@/components/bd/dayItem";
import { reasonLine } from "@/components/bd/dayItem";
import {
  KIND_ICON,
  SOURCE_LABEL,
  STAGE_LABEL,
  avatarTone,
  fmtMoney,
  fmtWhen,
  followUpPresets,
  initials,
  lateLabel,
  touchLine,
} from "@/lib/bd";

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const tone = avatarTone(name);
  return (
    <span
      className="bd-avatar"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/** Circular progress ("2 of 6 done today"). */
export function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, done / total) : 1;
  return (
    <div className="bd-ring" title={`${done} of ${total} done today`}>
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
        <motion.circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={pct >= 1 ? "var(--success)" : "var(--gold)"}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          transform="rotate(-90 32 32)"
        />
      </svg>
      <span className="bd-ring__n">{pct >= 1 && total > 0 ? <i className="bi bi-check-lg" /> : `${done}/${total}`}</span>
    </div>
  );
}

/** A short burst of confetti when the list is cleared. */
export function Confetti({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        id: i,
        left: 10 + Math.random() * 80,
        dx: (Math.random() - 0.5) * 220,
        delay: Math.random() * 0.25,
        size: 6 + Math.random() * 6,
        color: ["#3673fc", "#2ecc71", "#f5a623", "#e0387d", "#7c4fe0", "#0d9488"][i % 6],
        spin: Math.random() * 720 - 360,
      })),
    []
  );
  useEffect(() => {
    const t = setTimeout(onDone, reduce ? 0 : 2200);
    return () => clearTimeout(t);
  }, [onDone, reduce]);
  if (reduce) return null;
  return createPortal(
    <div className="bd-confetti" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          style={{ left: `${p.left}%`, width: p.size, height: p.size * 0.5, background: p.color }}
          initial={{ y: -20, x: 0, opacity: 1, rotate: 0 }}
          animate={{ y: window.innerHeight * 0.75, x: p.dx, opacity: 0, rotate: p.spin }}
          transition={{ duration: 1.7, delay: p.delay, ease: "easeIn" }}
        />
      ))}
    </div>,
    document.body
  );
}

/** Snooze presets in a small floating menu (positioned on screen so list clipping can't hide it). */
export function SnoozeMenu({
  onPick,
  label = "Snooze",
  variant = "icon",
  up = false,
}: {
  onPick: (at: Date) => void;
  label?: string;
  variant?: "icon" | "button";
  up?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const presets = useMemo(() => followUpPresets(), [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = 190;
    const h = presets.length * 42 + 16;
    const below = !up && r.bottom + h + 8 < window.innerHeight;
    setPos({
      top: below ? r.bottom + 6 : Math.max(8, r.top - h - 6),
      left: Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8),
    });
  }, [open, presets.length, up]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={variant === "icon" ? "bd-iconbtn" : "bd-pillbtn"}
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
      >
        <i className="bi bi-clock-history" />
        {variant === "button" && <span>{label}</span>}
      </button>
      {open &&
        createPortal(
          <>
            <div className="bd-menu-backdrop" onClick={() => setOpen(false)} />
            <div className="bd-menu" role="menu" style={{ top: pos?.top ?? -999, left: pos?.left ?? -999 }}>
              <div className="bd-menu__title">Remind me…</div>
              {presets.map((p) => (
                <button
                  key={p.label}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onPick(p.at());
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </>
  );
}

/** Large "what to do first" card. */
export function FirstUpCard({
  item,
  onDone,
  onSnooze,
  onOpen,
  onLogged,
}: {
  item: DayItem;
  onDone?: () => void;
  onSnooze?: (at: Date) => void;
  onOpen: () => void;
  onLogged: () => void;
}) {
  const late = item.dueAt ? lateLabel(item.dueAt) : "";
  return (
    <div className="bd-first">
      <div className="bd-first__top">
        <span className="bd-first__eyebrow">
          <i className="bi bi-lightning-charge-fill" /> Do this first
        </span>
      </div>
      <div className="bd-first__body">
        <Avatar name={item.title} size={56} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <button type="button" className="bd-first__title" onClick={onOpen}>
            {item.title}
          </button>
          <div className="bd-first__why">{reasonLine(item, late)}</div>
          <div className="bd-first__chips">
            {item.scoreLabel && item.score !== undefined && <ScoreBadge score={item.score} label={item.scoreLabel} />}
            {Number(item.value) > 0 && (
              <span className="bd-chip-lite">
                <i className="bi bi-cash-stack" /> {fmtMoney(item.value, item.currency)}
              </span>
            )}
            {item.source && <span className="bd-chip-lite">{SOURCE_LABEL[item.source] ?? item.source}</span>}
            <span className="bd-chip-lite">
              <i className="bi bi-clock-history" /> {touchLine(item.lastTouch ?? null)}
            </span>
          </div>
        </div>
      </div>
      <div className="bd-first__actions">
        <ContactBar
          lead={{ id: item.leadId, phone: item.phone, whatsapp: item.whatsapp, email: item.email, contact_name: item.contact, company: item.company }}
          onLogged={onLogged}
        />
        <div className="bd-first__more">
          {onDone && (
            <button type="button" className="bd-pillbtn is-ok" onClick={onDone}>
              <i className="bi bi-check2-circle" /> <span>Mark done</span>
            </button>
          )}
          {onSnooze && <SnoozeMenu onPick={onSnooze} variant="button" />}
          <button type="button" className="bd-pillbtn" onClick={onOpen}>
            <i className="bi bi-box-arrow-up-right" /> <span>Open lead</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** One animated row on My Day. */
export function DayRow({
  item,
  index,
  popping,
  showOwner,
  onOpen,
  onDone,
  onSnooze,
  onLog,
  onLogged,
}: {
  item: DayItem;
  index: number;
  popping: boolean;
  showOwner: boolean;
  onOpen: () => void;
  onDone?: () => void;
  onSnooze?: (at: Date) => void;
  onLog: () => void;
  onLogged: () => void;
}) {
  const reduce = useReducedMotion();
  const late = item.type === "follow_up" && item.kind !== "meeting" && item.dueAt ? lateLabel(item.dueAt) : "";
  const hot = item.scoreLabel === "hot";

  return (
    <motion.div
      layout={reduce ? false : "position"}
      className={`bd-row bd-day-row${hot ? " is-hot" : ""}${popping ? " is-popping" : ""}`}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, x: 60, transition: { duration: 0.22 } }}
      transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03, ease: [0.22, 1, 0.36, 1] }}
    >
      {onDone ? (
        <button className={`bd-check${popping ? " is-done" : ""}`} onClick={onDone} aria-label="Mark done" title="Mark done">
          <i className="bi bi-check-lg" />
        </button>
      ) : (
        <Avatar name={item.title} size={34} />
      )}

      <div className="bd-row__main" onClick={onOpen}>
        <div className="bd-day-row__head">
          <span className="bd-row__title">{item.title}</span>
          {item.scoreLabel && item.score !== undefined && <ScoreBadge score={item.score} label={item.scoreLabel} />}
        </div>
        <div className="bd-row__meta">
          {item.dueAt && (
            <span className={late ? "bd-late-pill" : "bd-when"}>
              <i className={`bi ${KIND_ICON[item.kind] ?? "bi-alarm"}`} /> {fmtWhen(item.dueAt)}
              {late && <b> - {late}</b>}
            </span>
          )}
          {item.type === "quiet_deal" && <span className="bd-late-pill"><i className="bi bi-hourglass-split" /> {item.quietDays} days quiet</span>}
          {item.type === "new_lead" && item.createdAt && (
            <span className="bd-when"><i className="bi bi-stars" /> New</span>
          )}
          {item.note && <span className="bd-note">{item.note}</span>}
          {Number(item.value) > 0 && <span className="bd-value">{fmtMoney(item.value, item.currency)}</span>}
        </div>
        <div className="bd-row__meta bd-row__meta--soft">
          <span>{touchLine(item.lastTouch ?? null)}</span>
          {item.stage && STAGE_LABEL[item.stage] && <span>{STAGE_LABEL[item.stage]}</span>}
          {item.source && <span>{SOURCE_LABEL[item.source] ?? item.source}</span>}
          {showOwner && <span>{item.ownerName}</span>}
        </div>
      </div>

      <div className="bd-day-actions">
        <ContactBar
          lead={{ id: item.leadId, phone: item.phone, whatsapp: item.whatsapp, email: item.email, contact_name: item.contact, company: item.company }}
          compact
          onLogged={onLogged}
        />
        <button className="bd-iconbtn" aria-label="Log activity" title="Log activity" onClick={onLog}>
          <i className="bi bi-journal-plus" />
        </button>
        {onSnooze && <SnoozeMenu onPick={onSnooze} />}
      </div>
    </motion.div>
  );
}
