"use client";

import { useMemo, useState } from "react";

import { DatePicker } from "@/components/DatePicker";
import { TimePicker } from "@/components/TimePicker";
import { followUpPresets, isoDate } from "@/lib/bd";

/**
 * "When?" — one-tap presets (in 1 hour / tomorrow / 3 days / next week), or a
 * custom date + time. Emits a Date (or null for "no follow-up").
 */
export function WhenPicker({
  value,
  onChange,
  allowNone = true,
  noneLabel = "No follow-up",
}: {
  value: Date | null;
  onChange: (d: Date | null) => void;
  allowNone?: boolean;
  noneLabel?: string;
}) {
  const presets = useMemo(followUpPresets, []);
  const [mode, setMode] = useState<string>(allowNone && !value ? "none" : value ? "custom" : "p0");
  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  }, []);
  const [date, setDate] = useState(isoDate(value ?? tomorrow));
  const [time, setTime] = useState(
    value ? `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}` : "10:00"
  );

  const emitCustom = (d: string, t: string) => {
    const parsed = new Date(`${d}T${t || "10:00"}:00`);
    onChange(Number.isNaN(parsed.getTime()) ? null : parsed);
  };

  const pick = (key: string) => {
    setMode(key);
    if (key === "none") onChange(null);
    else if (key === "custom") emitCustom(date, time);
    else onChange(presets[Number(key.slice(1))].at());
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="bd-chips">
        {allowNone && (
          <button type="button" className={`bd-chip${mode === "none" ? " is-on" : ""}`} onClick={() => pick("none")}>
            {noneLabel}
          </button>
        )}
        {presets.map((p, i) => (
          <button
            key={p.label}
            type="button"
            className={`bd-chip${mode === `p${i}` ? " is-on" : ""}`}
            onClick={() => pick(`p${i}`)}
          >
            {p.label}
          </button>
        ))}
        <button type="button" className={`bd-chip${mode === "custom" ? " is-on" : ""}`} onClick={() => pick("custom")}>
          <i className="bi bi-calendar-event" /> Pick date
        </button>
      </div>
      {mode === "custom" && (
        <div className="bd-grid2">
          <DatePicker
            value={date}
            onChange={(v) => {
              setDate(v);
              emitCustom(v, time);
            }}
            ariaLabel="Follow-up date"
          />
          <TimePicker
            value={time}
            onChange={(v) => {
              setTime(v);
              emitCustom(date, v);
            }}
            ariaLabel="Follow-up time"
          />
        </div>
      )}
    </div>
  );
}
