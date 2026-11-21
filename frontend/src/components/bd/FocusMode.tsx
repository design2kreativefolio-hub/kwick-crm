"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { ContactBar } from "@/components/bd/ContactBar";
import { Avatar, SnoozeMenu } from "@/components/bd/DayParts";
import { LogSheet } from "@/components/bd/LogSheet";
import { ScoreBadge } from "@/components/bd/ScoreBadge";
import { reasonLine, type DayItem } from "@/components/bd/dayItem";
import { api, ApiError, formatApiError } from "@/lib/api";
import { OUTCOMES, SERVICES, SOURCE_LABEL, STAGE_LABEL, fmtMoney, fmtWhen, lateLabel, touchLine } from "@/lib/bd";
import { useToast } from "@/lib/toast";

const QUICK_OUTCOMES = OUTCOMES.filter((o) => ["connected", "interested", "callback", "no_answer", "not_interested"].includes(o.value));

const SERVICE_LABEL: Record<string, string> = Object.fromEntries(SERVICES.map((s) => [s.value, s.label]));

/**
 * "Work the list": one lead at a time, full screen, with the few things you actually do
 * (call/message, log what happened, done, snooze, skip). Keys: D done · S snooze to tomorrow ·
 * → / N skip · ← back · O open · Esc close.
 */
export function FocusMode({
  items,
  onClose,
  onDone,
  onSnooze,
  onOpen,
  onChanged,
}: {
  items: DayItem[];
  onClose: () => void;
  onDone: (item: DayItem) => void;
  onSnooze: (item: DayItem, at: Date) => void;
  onOpen: (item: DayItem) => void;
  onChanged: () => void;
}) {
  const reduce = useReducedMotion();
  const { showToast } = useToast();
  // Freeze the queue when we start so completing items doesn't reshuffle what you're looking at.
  const queue = useMemo(() => items, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const [handled, setHandled] = useState<Record<string, "done" | "snoozed" | "skipped">>({});
  const [logged, setLogged] = useState<Record<string, string>>({});
  const [logOpen, setLogOpen] = useState(false);
  const [dir, setDir] = useState(1);

  const total = queue.length;
  const finished = i >= total;
  const item = queue[i];

  const go = useCallback(
    (step: number) => {
      setDir(step);
      setI((n) => Math.max(0, Math.min(total, n + step)));
    },
    [total]
  );

  const done = useCallback(() => {
    if (!item) return;
    if (item.followId) onDone(item);
    setHandled((h) => ({ ...h, [item.key]: "done" }));
    go(1);
  }, [item, onDone, go]);

  const snooze = useCallback(
    (at: Date) => {
      if (!item) return;
      onSnooze(item, at);
      setHandled((h) => ({ ...h, [item.key]: "snoozed" }));
      go(1);
    },
    [item, onSnooze, go]
  );

  const skip = useCallback(() => {
    if (!item) return;
    setHandled((h) => (h[item.key] ? h : { ...h, [item.key]: "skipped" }));
    go(1);
  }, [item, go]);

  const logOutcome = async (value: string, label: string) => {
    if (!item) return;
    try {
      await api("/api/bd/activities", {
        method: "POST",
        body: JSON.stringify({ lead: item.leadId, kind: "call", direction: "out", outcome: value, body: "" }),
      });
      setLogged((l) => ({ ...l, [item.key]: label }));
      showToast(`Logged: ${label}`);
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't log that.", "error");
    }
  };

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (logOpen) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key.toLowerCase() === "n") skip();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key.toLowerCase() === "d" && item?.followId) done();
      else if (e.key.toLowerCase() === "s" && item) {
        const t = new Date();
        t.setDate(t.getDate() + 1);
        t.setHours(10, 0, 0, 0);
        snooze(t);
      } else if (e.key.toLowerCase() === "o" && item) onOpen(item);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [logOpen, onClose, skip, go, done, snooze, onOpen, item]);

  const counts = Object.values(handled).reduce(
    (a, v) => ({ ...a, [v]: (a[v] ?? 0) + 1 }),
    {} as Record<string, number>
  );

  const late = item?.dueAt && item.kind !== "meeting" ? lateLabel(item.dueAt) : "";

  return createPortal(
    <motion.div
      className="bd-focus"
      role="dialog"
      aria-modal="true"
      aria-label="Focus mode"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
    >
      <div className="bd-focus__stage">
        <div className="bd-focus__col">
          <div className="bd-focus__bar">
            <div className="bd-focus__progress" aria-hidden>
              <motion.span animate={{ width: `${total ? (Math.min(i, total) / total) * 100 : 100}%` }} transition={{ duration: 0.35 }} />
            </div>
            <div className="bd-focus__barrow">
              <span className="bd-focus__count">{finished ? "All done" : `${i + 1} of ${total}`}</span>
              <span className="bd-focus__keys">D done · S snooze · → skip · O open</span>
              <button type="button" className="bd-iconbtn" onClick={onClose} aria-label="Close focus mode" title="Close (Esc)">
                <i className="bi bi-x-lg" />
              </button>
            </div>
          </div>
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          {finished ? (
            <motion.div
              key="end"
              className="bd-focus__card bd-focus__end"
              initial={reduce ? false : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <div className="bd-focus__trophy">
                <i className="bi bi-trophy-fill" />
              </div>
              <h2>You worked through the list</h2>
              <p className="muted">
                {counts.done ?? 0} done · {counts.snoozed ?? 0} snoozed · {counts.skipped ?? 0} skipped
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <button type="button" className="btn" onClick={onClose}>
                  Back to My Day
                </button>
                {total > 0 && (
                  <button type="button" className="btn btn-ghost" onClick={() => setI(0)}>
                    Review again
                  </button>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={item.key}
              className="bd-focus__card"
              custom={dir}
              initial={reduce ? false : { opacity: 0, x: dir * 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? undefined : { opacity: 0, x: dir * -60 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <div className="bd-focus__who">
                <Avatar name={item.title} size={64} />
                <div style={{ minWidth: 0 }}>
                  <button type="button" className="bd-focus__title" onClick={() => onOpen(item)}>
                    {item.title}
                  </button>
                  <div className="muted" style={{ fontSize: 13.5 }}>
                    {[item.contact, item.stage && STAGE_LABEL[item.stage], item.source && (SOURCE_LABEL[item.source] ?? item.source)]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
              </div>

              <div className="bd-focus__why">
                <i className="bi bi-lightning-charge-fill" /> {reasonLine(item, late)}
                {item.dueAt && <span> · {fmtWhen(item.dueAt)}</span>}
              </div>

              <div className="bd-first__chips">
                {item.scoreLabel && item.score !== undefined && <ScoreBadge score={item.score} label={item.scoreLabel} />}
                {Number(item.value) > 0 && (
                  <span className="bd-chip-lite">
                    <i className="bi bi-cash-stack" /> {fmtMoney(item.value, item.currency)}
                  </span>
                )}
                <span className="bd-chip-lite">
                  <i className="bi bi-clock-history" /> {touchLine(item.lastTouch ?? null)}
                </span>
                {(item.services ?? []).slice(0, 3).map((s) => (
                  <span key={s} className="bd-chip-lite">
                    {SERVICE_LABEL[s] ?? s}
                  </span>
                ))}
              </div>

              {item.scoreReasons && item.scoreReasons.length > 0 && (
                <ul className="bd-focus__reasons">
                  {item.scoreReasons.slice(0, 4).map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}

              <ContactBar
                lead={{ id: item.leadId, phone: item.phone, whatsapp: item.whatsapp, email: item.email, contact_name: item.contact, company: item.company }}
                onLogged={onChanged}
              />

              <div className="bd-focus__outcomes">
                <span className="bd-focus__label">How did it go?</span>
                <div className="bd-chips bd-chips--scroll">
                  {QUICK_OUTCOMES.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className={`bd-chip${logged[item.key] === o.label ? " is-on" : ""}`}
                      onClick={() => logOutcome(o.value, o.label)}
                    >
                      {logged[item.key] === o.label && <i className="bi bi-check2" />} {o.label}
                    </button>
                  ))}
                  <button type="button" className="bd-chip" onClick={() => setLogOpen(true)}>
                    <i className="bi bi-journal-plus" /> More…
                  </button>
                </div>
              </div>

              <div className="bd-focus__actions">
                <button type="button" className="bd-pillbtn" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous">
                  <i className="bi bi-arrow-left" />
                </button>
                {item.followId && (
                  <button type="button" className="bd-pillbtn is-ok is-big" onClick={done}>
                    <i className="bi bi-check2-circle" /> <span>Done</span>
                  </button>
                )}
                <SnoozeMenu onPick={snooze} variant="button" up />
                <button type="button" className="bd-pillbtn is-big" onClick={skip}>
                  <span>Skip</span> <i className="bi bi-arrow-right" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </div>

      {item && logOpen && (
        <LogSheet
          open
          onClose={() => setLogOpen(false)}
          leadId={item.leadId}
          leadName={item.title}
          onSaved={() => {
            setLogOpen(false);
            setLogged((l) => ({ ...l, [item.key]: "Logged" }));
            onChanged();
          }}
        />
      )}
    </motion.div>,
    document.body
  );
}
