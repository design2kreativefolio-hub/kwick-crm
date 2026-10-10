"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";

type TrackerState = { running: boolean; started_at: string | null; today_seconds: number; server_now: string };

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatClock(total: number) {
  const s = Math.max(0, Math.floor(total));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Dashboard Time Tracker — play/stop, total for today, kept on the server so
 * it keeps running across reloads and devices. */
export function TimeTracker() {
  const { showToast } = useToast();
  const [state, setState] = useState<TrackerState | null>(null);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  const fetchedAt = useRef(Date.now());

  const apply = useCallback((s: TrackerState) => {
    fetchedAt.current = Date.now();
    setState(s);
  }, []);

  useEffect(() => {
    api<TrackerState>("/api/time-tracker").then(apply).catch(() => {});
  }, [apply]);

  useEffect(() => {
    if (!state?.running) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [state?.running]);

  const act = async (action: "start" | "stop") => {
    if (busy) return;
    setBusy(true);
    try {
      apply(await api<TrackerState>(`/api/time-tracker/${action}`, { method: "POST" }));
    } catch {
      showToast("Couldn't update the timer.", "error");
    } finally {
      setBusy(false);
    }
  };

  const running = !!state?.running;
  const seconds = state ? state.today_seconds + (running ? (Date.now() - fetchedAt.current) / 1000 : 0) : 0;

  return (
    <div className={`time-tracker${running ? " is-running" : ""}`} role="group" aria-label="Time tracker">
      <div className="time-tracker__rings" aria-hidden />
      <div className="time-tracker__body">
        <div className="time-tracker__top">
          <span className="time-tracker__title">Time Tracker</span>
          <span className="time-tracker__status">
            <i className="time-tracker__dot" />
            {running ? "Running" : "Paused"}
          </span>
        </div>
        <div className="time-tracker__clock" aria-live="off">
          {formatClock(seconds)}
        </div>
        <div className="time-tracker__sub">Total time today</div>
      </div>
      <div className="time-tracker__actions">
        <button
          type="button"
          className="time-tracker__btn time-tracker__btn--play"
          onClick={() => act("start")}
          disabled={busy || running || !state}
          aria-label="Start timer"
          title="Start"
        >
          <i className="bi bi-play-fill" />
        </button>
        <button
          type="button"
          className="time-tracker__btn time-tracker__btn--stop"
          onClick={() => act("stop")}
          disabled={busy || !running}
          aria-label="Stop timer"
          title="Stop"
        >
          <i className="bi bi-stop-fill" />
        </button>
      </div>
    </div>
  );
}
