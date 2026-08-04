"use client";

import { useEffect, useMemo, useState } from "react";

import { Reveal } from "@/components/Reveal";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

type AgendaItem = {
  source: string;
  id: number;
  title: string;
  date: string;
  meta?: Record<string, any>;
};

type View = "month" | "week" | "day";

const SOURCE_META: Record<string, { color: string; label: string; href: string }> = {
  task: { color: "var(--blue-500)", label: "Task", href: "/tasks" },
  daily_tracker: { color: "var(--success)", label: "Daily Tracker", href: "/reports" },
  renewal: { color: "var(--danger)", label: "Renewal", href: "/renewals" },
  manual: { color: "var(--warning)", label: "Reminder", href: "" },
  project: { color: "#7C4FE0", label: "Project Delivery", href: "/projects" },
  content_calendar: { color: "#E0387D", label: "Content Calendar", href: "/projects/clients" },
};
const DEFAULT_META = { color: "var(--gold)", label: "Item", href: "" };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function sameDay(a: Date, b: Date) {
  return toIso(a) === toIso(b);
}
function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isSuperadmin = user?.role === "superadmin";

  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [reminderTitle, setReminderTitle] = useState("");
  const [addingReminder, setAddingReminder] = useState(false);

  const gridStart = useMemo(() => {
    const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    return startOfWeek(firstOfMonth);
  }, [anchor]);
  const gridEnd = useMemo(() => {
    const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const end = new Date(lastOfMonth);
    end.setDate(end.getDate() + (6 - end.getDay()));
    return end;
  }, [anchor]);

  const rangeFrom = view === "day" ? selectedDate : view === "week" ? startOfWeek(selectedDate) : gridStart;
  const rangeTo =
    view === "day"
      ? selectedDate
      : view === "week"
      ? new Date(startOfWeek(selectedDate).getTime() + 6 * 86400000)
      : gridEnd;

  const load = () => {
    api<{ items: AgendaItem[] }>(
      `/api/calendar/agenda?from=${toIso(rangeFrom)}&to=${toIso(rangeTo)}&scope=${isSuperadmin ? "all" : "self"}`
    )
      .then((d) => setItems(d.items))
      .catch(() => {});
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [view, toIso(rangeFrom), toIso(rangeTo)]);

  const itemsByDate = useMemo(() => {
    const map: Record<string, AgendaItem[]> = {};
    for (const it of items) {
      const key = it.date.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(it);
    }
    return map;
  }, [items]);

  const monthDays = useMemo(() => {
    const days: Date[] = [];
    const cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [gridStart, gridEnd]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate);
    return Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 86400000));
  }, [selectedDate]);

  const today = new Date();
  const selectedItems = itemsByDate[toIso(selectedDate)] ?? [];

  const goPrev = () => {
    if (view === "month") setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1));
    else if (view === "week") setSelectedDate(new Date(selectedDate.getTime() - 7 * 86400000));
    else setSelectedDate(new Date(selectedDate.getTime() - 86400000));
  };
  const goNext = () => {
    if (view === "month") setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1));
    else if (view === "week") setSelectedDate(new Date(selectedDate.getTime() + 7 * 86400000));
    else setSelectedDate(new Date(selectedDate.getTime() + 86400000));
  };
  const goToday = () => {
    const t = new Date();
    setAnchor(new Date(t.getFullYear(), t.getMonth(), 1));
    setSelectedDate(t);
  };

  const headerLabel =
    view === "day"
      ? selectedDate.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
      : view === "week"
      ? `${weekDays[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekDays[6].toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
      : anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const addReminder = async () => {
    if (!reminderTitle.trim()) return;
    setAddingReminder(true);
    try {
      const remindAt = new Date(selectedDate);
      remindAt.setHours(12, 0, 0, 0);
      await api("/api/calendar/reminders", {
        method: "POST",
        body: JSON.stringify({ title: reminderTitle.trim(), remind_at: remindAt.toISOString() }),
      });
      setReminderTitle("");
      showToast("Reminder added.");
      load();
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't add reminder." : err.message, "error");
    } finally {
      setAddingReminder(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Reveal index={0}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={calHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{headerLabel}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {(["month", "week", "day"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={view === v ? "btn btn-accent btn-sm" : "btn btn-ghost btn-sm"}
                  style={{ textTransform: "capitalize" }}
                >
                  {v}
                </button>
              ))}
              <button className="icon-btn-anim" style={navBtn} onClick={goPrev} aria-label="Previous">
                <i className="bi bi-chevron-left" />
              </button>
              <button className="icon-btn-anim" style={navBtn} onClick={goToday} aria-label="Today">
                <i className="bi bi-calendar-event" />
              </button>
              <button className="icon-btn-anim" style={navBtn} onClick={goNext} aria-label="Next">
                <i className="bi bi-chevron-right" />
              </button>
            </div>
          </div>

          {view === "month" && (
            <div>
              <div style={weekHeaderRow}>
                {WEEKDAYS.map((d) => (
                  <div key={d} style={weekHeaderCell}>{d}</div>
                ))}
              </div>
              <div style={monthGrid}>
                {monthDays.map((d) => {
                  const iso = toIso(d);
                  const dayItems = itemsByDate[iso] ?? [];
                  const inMonth = d.getMonth() === anchor.getMonth();
                  const isToday = sameDay(d, today);
                  const isSelected = sameDay(d, selectedDate);
                  return (
                    <div
                      key={iso}
                      onClick={() => setSelectedDate(d)}
                      style={{
                        ...dayCell,
                        background: isSelected ? "var(--gold-soft)" : isToday ? "var(--success-soft)" : "transparent",
                        opacity: inMonth ? 1 : 0.4,
                      }}
                    >
                      <div style={dayCellTop}>
                        {dayItems.length > 0 && <span style={countBadge}>{dayItems.length}</span>}
                        <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: isToday ? 700 : 500 }}>
                          {d.getDate()}
                        </span>
                      </div>
                      {dayItems.length > 0 && (
                        <div style={dotRow}>
                          {dayItems.slice(0, 4).map((it, i) => (
                            <span
                              key={i}
                              style={{ ...dayDot, background: (SOURCE_META[it.source] ?? DEFAULT_META).color }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {view === "week" && (
            <div style={weekGrid}>
              {weekDays.map((d) => {
                const iso = toIso(d);
                const dayItems = itemsByDate[iso] ?? [];
                const isToday = sameDay(d, today);
                const isSelected = sameDay(d, selectedDate);
                return (
                  <div
                    key={iso}
                    onClick={() => setSelectedDate(d)}
                    style={{
                      ...weekCell,
                      background: isSelected ? "var(--gold-soft)" : isToday ? "var(--success-soft)" : "transparent",
                    }}
                  >
                    <div className="muted" style={{ fontSize: 11, fontWeight: 600 }}>
                      {WEEKDAYS[d.getDay()].slice(0, 3)}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: isToday ? 700 : 500, marginBottom: 8 }}>{d.getDate()}</div>
                    {dayItems.slice(0, 4).map((it, i) => (
                      <div key={i} style={weekItemChip}>
                        <span style={{ ...dayDot, background: (SOURCE_META[it.source] ?? DEFAULT_META).color }} />
                        <span style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {it.title}
                        </span>
                      </div>
                    ))}
                    {dayItems.length > 4 && (
                      <span className="muted" style={{ fontSize: 10.5 }}>+{dayItems.length - 4} more</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {view === "day" && (
            <div style={{ padding: 20 }}>
              {selectedItems.length === 0 && <p className="muted">Nothing scheduled for this day.</p>}
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {selectedItems.map((it, i) => {
                  const meta = SOURCE_META[it.source] ?? DEFAULT_META;
                  return (
                    <li key={i} style={agendaRow}>
                      <span style={{ ...dayDot, background: meta.color }} />
                      <span style={{ flex: 1 }}>{it.title}</span>
                      <span className="muted" style={{ fontSize: 11.5 }}>{meta.label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </Reveal>

      {view !== "day" && (
        <Reveal index={1}>
          <div className="card">
            <span className="card-title">
              {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </span>
            {selectedItems.length === 0 && <p className="muted">Nothing scheduled for this day.</p>}
            {selectedItems.length > 0 && (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {selectedItems.map((it, i) => {
                  const meta = SOURCE_META[it.source] ?? DEFAULT_META;
                  return (
                    <li key={i} style={agendaRow}>
                      <span style={{ ...dayDot, background: meta.color }} />
                      <span style={{ flex: 1 }}>{it.title}</span>
                      <span className="muted" style={{ fontSize: 11.5 }}>{meta.label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <input
                className="input"
                placeholder="Add a reminder for this day…"
                value={reminderTitle}
                onChange={(e) => setReminderTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addReminder()}
              />
              <button className="btn btn-sm" onClick={addReminder} disabled={addingReminder || !reminderTitle.trim()}>
                <i className="bi bi-plus-lg" /> Add
              </button>
            </div>
          </div>
        </Reveal>
      )}
    </div>
  );
}

const calHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 12,
  padding: "18px 22px",
  background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-soft) 100%)",
  color: "#fff",
};
const navBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,0.15)",
  color: "#fff",
  border: "none",
};
const weekHeaderRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  borderBottom: "1px solid var(--border)",
};
const weekHeaderCell: React.CSSProperties = {
  padding: "10px 8px",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-muted)",
  textAlign: "center",
};
const monthGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
};
const dayCell: React.CSSProperties = {
  minHeight: 92,
  padding: 8,
  borderRight: "1px solid var(--border)",
  borderBottom: "1px solid var(--border)",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};
const dayCellTop: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
};
const countBadge: React.CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: "50%",
  background: "var(--navy)",
  color: "#fff",
  fontSize: 10,
  fontWeight: 700,
  display: "grid",
  placeItems: "center",
};
const dotRow: React.CSSProperties = {
  display: "flex",
  gap: 4,
  flexWrap: "wrap",
};
const dayDot: React.CSSProperties = {
  width: 7,
  height: 7,
  minWidth: 7,
  borderRadius: "50%",
};
const weekGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  minHeight: 260,
};
const weekCell: React.CSSProperties = {
  padding: 10,
  borderRight: "1px solid var(--border)",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};
const weekItemChip: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 0",
};
const agendaRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 0",
  borderBottom: "1px solid var(--border)",
  fontSize: 13.5,
};
