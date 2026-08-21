"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useConfirm } from "@/components/ConfirmDialog";
import { DatePicker } from "@/components/DatePicker";
import { MonthYearSelect } from "@/components/MonthYearSelect";
import { Modal } from "@/components/Modal";
import { MultiSelect } from "@/components/MultiSelect";
import { Select } from "@/components/Select";
import { api, ApiError, formatApiError } from "@/lib/api";
import { assigneeSelectOptions } from "@/lib/assigneeOptions";
import { useAuth } from "@/lib/auth";
import { isMeetingUrl } from "@/lib/meetingLinks";
import { useToast } from "@/lib/toast";
import { useShellFillHeight } from "@/lib/useShellFillHeight";

type AgendaItem = {
  source: string;
  id: number;
  title: string;
  date: string;
  done?: boolean;
  meta?: Record<string, any>;
};

type Contact = { id: number; full_name: string; email: string };
type ReminderDetail = {
  id: number;
  title: string;
  description: string;
  meeting_url: string;
  remind_at: string;
  recurrence: string;
  recurrence_end: string | null;
  assignee_ids: number[];
};
type View = "month" | "week" | "day";

const SOURCE_META: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  task: { color: "var(--cal-task)", bg: "var(--cal-task-bg)", label: "Task", icon: "bi-check2-square" },
  todo: { color: "var(--cal-todo)", bg: "var(--cal-todo-bg)", label: "To-Do", icon: "bi-list-check" },
  daily_tracker: { color: "var(--cal-todo)", bg: "var(--cal-todo-bg)", label: "Daily Tracker", icon: "bi-journal-text" },
  renewal: { color: "var(--cal-renewal)", bg: "var(--cal-renewal-bg)", label: "Renewal", icon: "bi-arrow-repeat" },
  manual: { color: "var(--cal-manual)", bg: "var(--cal-manual-bg)", label: "Reminder", icon: "bi-bell-fill" },
  project: { color: "var(--cal-project)", bg: "var(--cal-project-bg)", label: "Project Delivery", icon: "bi-folder-fill" },
  content_calendar: { color: "var(--cal-content)", bg: "var(--cal-content-bg)", label: "Content", icon: "bi-calendar2-heart" },
};
const DEFAULT_META = { color: "var(--gold)", bg: "var(--gold-soft)", label: "Item", icon: "bi-calendar-event" };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const RECURRENCE_OPTIONS = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

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
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

/** Navigate to the module that owns this agenda item (calendar-native reminders return null). */
function itemHref(item: AgendaItem): string | null {
  switch (item.source) {
    case "task":
      return `/tasks/${item.id}`;
    case "todo":
      return "/todo";
    case "project":
      return `/projects/${item.id}`;
    case "content_calendar":
      return item.meta?.client ? `/projects/clients/${item.meta.client}/calendar` : "/projects/clients";
    case "daily_tracker":
      return "/reports";
    case "renewal":
      return "/renewals";
    case "manual":
      return null;
    default:
      return null;
  }
}

const emptyReminder = {
  title: "",
  description: "",
  meeting_url: "",
  time: "09:00",
  recurrence: "none",
  recurrence_end: "",
  assignee_ids: [] as string[],
};

export default function CalendarPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const rootRef = useRef<HTMLDivElement>(null);
  useShellFillHeight(rootRef);

  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [directory, setDirectory] = useState<Contact[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyReminder);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const reminderBaseline = useRef("");

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
      `/api/calendar/agenda?from=${toIso(rangeFrom)}&to=${toIso(rangeTo)}&scope=self`
    )
      .then((d) => setItems(d.items))
      .catch(() => {});
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [view, toIso(rangeFrom), toIso(rangeTo)]);

  useEffect(() => {
    api<Contact[]>("/api/messages/directory").then(setDirectory).catch(() => {});
  }, []);

  const assigneeOptions = useMemo(
    () => assigneeSelectOptions(user, directory),
    [user, directory]
  );

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
  const weekCount = Math.max(1, Math.ceil(monthDays.length / 7));

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
  const jumpToMonth = (year: number, month: number) => {
    setAnchor(new Date(year, month, 1));
    const maxDay = new Date(year, month + 1, 0).getDate();
    const day = Math.min(selectedDate.getDate(), maxDay);
    setSelectedDate(new Date(year, month, day));
  };

  const headerLabel =
    view === "day"
      ? selectedDate.toLocaleDateString(undefined, { weekday: "long", day: "numeric" })
      : view === "week"
      ? `${weekDays[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekDays[6].toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
      : null;

  const openCreateReminder = () => {
    setEditingId(null);
    const next = { ...emptyReminder };
    setForm(next);
    reminderBaseline.current = JSON.stringify(next);
    setFormError(null);
    setFormOpen(true);
  };

  const openEditReminder = async (item: AgendaItem) => {
    try {
      const rem = await api<ReminderDetail>(`/api/calendar/reminders/${item.id}`);
      const when = new Date(rem.remind_at);
      setEditingId(rem.id);
      const next = {
        title: rem.title || "",
        description: rem.description || "",
        meeting_url: rem.meeting_url || "",
        time: `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`,
        recurrence: rem.recurrence || "none",
        recurrence_end: rem.recurrence_end || "",
        assignee_ids: (rem.assignee_ids || []).map(String),
      };
      setForm(next);
      reminderBaseline.current = JSON.stringify(next);
      // Keep the selected day in sync with the reminder's date.
      setSelectedDate(new Date(when.getFullYear(), when.getMonth(), when.getDate()));
      setFormError(null);
      setFormOpen(true);
    } catch {
      showToast("Couldn't load reminder.", "error");
    }
  };

  const closeReminderForm = () => {
    if (saving) return;
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyReminder);
    setFormError(null);
  };

  const persistReminder = async () => {
    if (!form.title.trim()) {
      setFormError("Title is required.");
      return false;
    }
    setSaving(true);
    setFormError(null);
    try {
      const [hh, mm] = form.time.split(":").map(Number);
      const remindAt = new Date(selectedDate);
      remindAt.setHours(hh || 9, mm || 0, 0, 0);
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim(),
        meeting_url: form.meeting_url.trim(),
        remind_at: remindAt.toISOString(),
        recurrence: form.recurrence,
        assignee_ids: form.assignee_ids.map(Number),
        recurrence_end: form.recurrence !== "none" && form.recurrence_end ? form.recurrence_end : null,
      };
      if (editingId) {
        await api(`/api/calendar/reminders/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        showToast("Reminder updated.");
      } else {
        await api("/api/calendar/reminders", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showToast("Reminder created.");
      }
      setFormOpen(false);
      setEditingId(null);
      setForm(emptyReminder);
      load();
      return true;
    } catch (err: any) {
      setFormError(err instanceof ApiError ? formatApiError(err.data) : err.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const requestCloseReminder = async () => {
    if (saving) return;
    if (JSON.stringify(form) === reminderBaseline.current) {
      closeReminderForm();
      return;
    }
    const result = await confirm("Save your changes, or exit without saving?", {
      title: "Unsaved changes",
      confirmLabel: "Save",
      discardLabel: "Exit without saving",
      cancelLabel: "Keep editing",
    });
    if (result === true) await persistReminder();
    else if (result === "discard") closeReminderForm();
  };

  const saveReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    await persistReminder();
  };

  const deleteReminder = async (item: AgendaItem) => {
    const ok = await confirm(
      `Are you sure you want to delete "${item.title}"?\nThis reminder will be removed from the calendar and cannot be undone.`,
      {
        title: "Delete Reminder",
        danger: true,
        confirmLabel: "Delete",
      }
    );
    if (!ok) return;
    try {
      await api(`/api/calendar/reminders/${item.id}`, { method: "DELETE" });
      showToast("Reminder deleted.");
      if (editingId === item.id) {
        setFormOpen(false);
        setEditingId(null);
      }
      load();
    } catch {
      showToast("Couldn't delete reminder.", "error");
    }
  };

  const toggleDone = async (it: AgendaItem) => {
    try {
      if (it.source === "manual") {
        await api(`/api/calendar/reminders/${it.id}`, {
          method: "PATCH",
          body: JSON.stringify({ done: !it.done }),
        });
      } else if (it.source === "todo") {
        if (it.meta?.summary || it.id === 0) return;
        await api(`/api/todos/${it.id}`, {
          method: "PATCH",
          body: JSON.stringify({ done: !it.done }),
        });
      } else if (it.source === "task") {
        await api(`/api/tasks/${it.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: it.done ? "assigned" : "completed" }),
        });
      } else {
        return;
      }
      load();
    } catch {
      showToast("Couldn't update item.", "error");
    }
  };

  const openItem = (it: AgendaItem) => {
    if (it.source === "manual") {
      openEditReminder(it);
      return;
    }
    const href = itemHref(it);
    if (href) router.push(href);
  };

  return (
    <div
      ref={rootRef}
      className="kwick-personal-cal"
      style={pageRoot}
    >
      <div className="kwick-cal-layout cal-stack-mobile" style={layout}>
        <div className="card" style={calCard}>
          <div style={calHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <MonthYearSelect
                light
                month={view === "month" ? anchor.getMonth() : selectedDate.getMonth()}
                year={view === "month" ? anchor.getFullYear() : selectedDate.getFullYear()}
                onMonthChange={(month) =>
                  jumpToMonth(view === "month" ? anchor.getFullYear() : selectedDate.getFullYear(), month)
                }
                onYearChange={(year) =>
                  jumpToMonth(year, view === "month" ? anchor.getMonth() : selectedDate.getMonth())
                }
              />
              {headerLabel && <span style={{ fontSize: 14, fontWeight: 600, opacity: 0.92 }}>{headerLabel}</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {(["month", "week", "day"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={view === v ? "btn btn-accent btn-sm" : "btn btn-ghost btn-sm"}
                  style={{ textTransform: "capitalize", color: view === v ? undefined : "#fff" }}
                >
                  {v}
                </button>
              ))}
              <button className="icon-btn-anim" style={navBtn} onClick={goPrev} aria-label="Previous">
                <i className="bi bi-chevron-left" />
              </button>
              <button className="icon-btn-anim" style={navBtn} onClick={goToday} aria-label="Today">
                Today
              </button>
              <button className="icon-btn-anim" style={navBtn} onClick={goNext} aria-label="Next">
                <i className="bi bi-chevron-right" />
              </button>
            </div>
          </div>

          {view === "month" && (
            <div style={monthBody}>
              <div style={weekHeaderRow}>
                {WEEKDAYS.map((d) => (
                  <div key={d} style={weekHeaderCell}>{d.slice(0, 3)}</div>
                ))}
              </div>
              <div style={{ ...monthGrid, gridTemplateRows: `repeat(${weekCount}, 1fr)` }}>
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
                        boxShadow: isSelected ? "inset 0 0 0 2px var(--gold)" : undefined,
                      }}
                    >
                      <div style={dayCellTop}>
                        <span style={{ fontSize: 12.5, fontWeight: isToday || isSelected ? 700 : 500 }}>
                          {d.getDate()}
                        </span>
                        {dayItems.length > 0 && <span style={countBadge}>{dayItems.length}</span>}
                      </div>
                      {dayItems.length > 0 && (
                        <div style={dotRow} title={dayItems.map((it) => it.title).join(", ")}>
                          {dayItems.slice(0, 4).map((it) => {
                            const meta = SOURCE_META[it.source] ?? DEFAULT_META;
                            return (
                              <span
                                key={`${it.source}-${it.id}-${it.date}`}
                                style={{
                                  ...eventDot,
                                  background: meta.color,
                                  opacity: it.done ? 0.45 : 1,
                                }}
                              />
                            );
                          })}
                          {dayItems.length > 4 && (
                            <span className="muted" style={{ fontSize: 9, lineHeight: 1, marginLeft: 1 }}>
                              +{dayItems.length - 4}
                            </span>
                          )}
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
                      boxShadow: isSelected ? "inset 0 0 0 2px var(--gold)" : undefined,
                    }}
                  >
                    <div className="muted" style={{ fontSize: 11, fontWeight: 600 }}>
                      {WEEKDAYS[d.getDay()].slice(0, 3)}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: isToday ? 700 : 500, marginBottom: 8 }}>{d.getDate()}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 0, overflow: "auto" }}>
                      {dayItems.map((it) => {
                        const meta = SOURCE_META[it.source] ?? DEFAULT_META;
                        return (
                          <div
                            key={`${it.source}-${it.id}`}
                            style={{
                              ...weekItemChip,
                              textDecoration: it.done ? "line-through" : undefined,
                              opacity: it.done ? 0.65 : 1,
                              pointerEvents: "none",
                            }}
                          >
                            <span style={{ ...dayDot, background: meta.color }} />
                            <span style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {it.title}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {view === "day" && (
            <div style={dayBody}>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="btn btn-accent btn-sm" onClick={openCreateReminder}>
                  <i className="bi bi-plus-lg" /> Create Reminder
                </button>
              </div>
              {selectedItems.length === 0 && <p className="muted">Nothing scheduled for this day.</p>}
              {selectedItems.map((it) => (
                <AgendaCard
                  key={`${it.source}-${it.id}-${it.date}`}
                  item={it}
                  onToggleDone={() => toggleDone(it)}
                  onOpen={() => openItem(it)}
                  onEdit={it.source === "manual" ? () => openEditReminder(it) : undefined}
                  onDelete={it.source === "manual" ? () => deleteReminder(it) : undefined}
                />
              ))}
            </div>
          )}
        </div>

        {view !== "day" && (
          <div className="card" style={sidePanel}>
            <div style={{ marginBottom: 12, flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>
                {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </h2>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, overflowY: "auto", minHeight: 0 }}>
              {selectedItems.length === 0 && (
                <p className="muted" style={{ fontSize: 13 }}>Nothing scheduled. Create a reminder below.</p>
              )}
              {selectedItems.map((it) => (
                <AgendaCard
                  key={`${it.source}-${it.id}-${it.date}`}
                  item={it}
                  onToggleDone={() => toggleDone(it)}
                  onOpen={() => openItem(it)}
                  onEdit={it.source === "manual" ? () => openEditReminder(it) : undefined}
                  onDelete={it.source === "manual" ? () => deleteReminder(it) : undefined}
                  compact
                />
              ))}
            </div>

            <div style={sideFooter}>
              <button className="btn btn-accent" style={{ width: "100%" }} onClick={openCreateReminder}>
                <i className="bi bi-plus-lg" /> Create Reminder
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal open={formOpen} onClose={requestCloseReminder} maxWidth={520}>
        <form onSubmit={saveReminder}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="card-title" style={{ margin: 0 }}>
              <i className="bi bi-bell-fill" style={{ color: "var(--gold)", marginRight: 8 }} />
              {editingId ? "Edit Reminder" : "New Reminder"}
            </span>
            <button type="button" className="icon-btn-anim" style={closeBtn} onClick={requestCloseReminder} aria-label="Close">
              <i className="bi bi-x-lg" />
            </button>
          </div>
          <p className="muted" style={{ marginTop: 6, fontSize: 12.5 }}>
            For {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>

          <label className="field-label" style={{ marginTop: 14 }}>Title</label>
          <input
            className="input"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />

          <label className="field-label">Description</label>
          <textarea
            className="input"
            rows={3}
            style={{ resize: "vertical", fontFamily: "inherit" }}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />

          <label className="field-label">Meeting link</label>
          <input
            className="input"
            type="url"
            placeholder="Zoom, Google Meet, or Microsoft Teams link"
            value={form.meeting_url}
            onChange={(e) => setForm((f) => ({ ...f, meeting_url: e.target.value }))}
          />

          <div style={fieldGrid}>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Time</label>
              <input
                className="input"
                type="time"
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
              />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Repeat</label>
              <Select
                value={form.recurrence}
                onChange={(v) => setForm((f) => ({ ...f, recurrence: v }))}
                options={RECURRENCE_OPTIONS}
                ariaLabel="Recurrence"
              />
            </div>
          </div>

          {form.recurrence !== "none" && (
            <>
              <label className="field-label">Repeat until</label>
              <DatePicker
                value={form.recurrence_end}
                onChange={(v) => setForm((f) => ({ ...f, recurrence_end: v }))}
                ariaLabel="Recurrence end"
              />
            </>
          )}

          <label className="field-label">Add people</label>
          <MultiSelect
            values={form.assignee_ids}
            onChange={(vals) => setForm((f) => ({ ...f, assignee_ids: vals }))}
            options={assigneeOptions}
            placeholder="Select people…"
            ariaLabel="Assignees"
          />

          {formError && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{formError}</p>}

          <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
            <button className="btn btn-accent" disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Create Reminder"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={requestCloseReminder}>
              Cancel
            </button>
            {editingId && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ color: "var(--danger)", marginLeft: "auto" }}
                onClick={() =>
                  deleteReminder({
                    source: "manual",
                    id: editingId,
                    title: form.title || "this reminder",
                    date: toIso(selectedDate),
                  })
                }
                disabled={saving}
              >
                <i className="bi bi-trash-fill" /> Delete
              </button>
            )}
          </div>
        </form>
      </Modal>
      {ConfirmDialog}
    </div>
  );
}

function AgendaCard({
  item,
  onToggleDone,
  onOpen,
  onEdit,
  onDelete,
  compact = false,
}: {
  item: AgendaItem;
  onToggleDone: () => void;
  onOpen: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  compact?: boolean;
}) {
  const meta = SOURCE_META[item.source] ?? DEFAULT_META;
  const meetingUrl = item.meta?.meeting_url as string | undefined;
  const showJoin = isMeetingUrl(meetingUrl);
  const assignees: { id: number; name: string }[] = item.meta?.assignees || [];
  const canToggle =
    (item.source === "manual" || item.source === "todo" || item.source === "task") &&
    !(item.source === "todo" && (item.meta?.summary || item.id === 0));
  const timeLabel = item.meta?.time as string | undefined;
  const isManual = item.source === "manual";
  const href = itemHref(item);

  return (
    <div
      style={{
        ...agendaCard,
        opacity: item.done ? 0.72 : 1,
        padding: compact ? 12 : 14,
        cursor: href || isManual ? "pointer" : "default",
      }}
      onClick={onOpen}
      role={href || isManual ? "button" : undefined}
      tabIndex={href || isManual ? 0 : undefined}
      onKeyDown={(e) => {
        if ((href || isManual) && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ ...sourceIcon, background: meta.bg, color: meta.color }}>
          <i className={`bi ${meta.icon}`} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontWeight: 650,
                fontSize: compact ? 13.5 : 14.5,
                color: "var(--navy)",
                textDecoration: item.done ? "line-through" : undefined,
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {item.title}
            </span>
            {canToggle && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: "2px 8px", fontSize: 11 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleDone();
                }}
                title={item.done ? "Mark as not done" : "Mark done"}
              >
                <i className={`bi ${item.done ? "bi-arrow-counterclockwise" : "bi-check2"}`} />
              </button>
            )}
            {isManual && onEdit && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: "2px 8px", fontSize: 11 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                title="Edit reminder"
              >
                <i className="bi bi-pencil" />
              </button>
            )}
            {isManual && onDelete && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: "2px 8px", fontSize: 11, color: "var(--danger)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                title="Delete reminder"
              >
                <i className="bi bi-trash" />
              </button>
            )}
            {href && (
              <span className="muted" title="Open source page" style={{ fontSize: 12 }}>
                <i className="bi bi-box-arrow-up-right" />
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            {timeLabel && (
              <span className="muted" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <i className="bi bi-clock" style={{ fontSize: 11 }} /> {timeLabel}
              </span>
            )}
            <span className="muted" style={{ fontSize: 11.5 }}>{meta.label}</span>
            {item.meta?.recurrence && item.meta.recurrence !== "none" && (
              <span className="muted" style={{ fontSize: 11.5 }}>
                <i className="bi bi-arrow-repeat" /> {item.meta.recurrence}
              </span>
            )}
          </div>
          {item.meta?.description && !compact && (
            <p className="muted" style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.4 }}>
              {String(item.meta.description).slice(0, 140)}
            </p>
          )}
          {assignees.length > 0 && (
            <div style={{ display: "flex", marginTop: 8 }}>
              {assignees.slice(0, 5).map((a, i) => (
                <span
                  key={a.id}
                  title={a.name}
                  style={{
                    ...avatar,
                    marginLeft: i === 0 ? 0 : -6,
                    zIndex: 5 - i,
                  }}
                >
                  {initials(a.name)}
                </span>
              ))}
            </div>
          )}
          {showJoin && meetingUrl && (
            <a
              href={meetingUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm"
              style={joinBtn}
              onClick={(e) => e.stopPropagation()}
            >
              <i className="bi bi-camera-video-fill" /> Join Meeting
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

const pageRoot: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  minHeight: 0,
  overflow: "hidden",
};
const layout: React.CSSProperties = {
  // columns/gap come from .kwick-cal-layout CSS so height fill isn't fought by inline styles
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
};
const calCard: React.CSSProperties = {
  padding: 0,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  minHeight: 0,
  height: "100%",
};
const calHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 8,
  padding: "10px 14px",
  background: "linear-gradient(135deg, var(--brand-fill-soft) 0%, var(--brand-fill) 100%)",
  color: "var(--on-brand)",
  flexShrink: 0,
};
const navBtn: React.CSSProperties = {
  minWidth: 28,
  height: 28,
  padding: "0 8px",
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,0.15)",
  color: "#fff",
  border: "none",
  fontSize: 11.5,
  fontWeight: 600,
};
const monthBody: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};
const weekHeaderRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  borderBottom: "1px solid var(--border)",
  flexShrink: 0,
};
const weekHeaderCell: React.CSSProperties = {
  padding: "6px 4px",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-muted)",
  textAlign: "center",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const monthGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  overflow: "hidden",
};
const dayCell: React.CSSProperties = {
  minHeight: 0,
  minWidth: 0,
  padding: "6px 7px",
  borderRight: "1px solid var(--border)",
  borderBottom: "1px solid var(--border)",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  overflow: "hidden",
  transition: "background 0.15s ease",
};
const dayCellTop: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexShrink: 0,
};
const countBadge: React.CSSProperties = {
  minWidth: 16,
  height: 16,
  padding: "0 4px",
  borderRadius: 999,
  background: "var(--brand-fill)",
  color: "var(--on-brand)",
  fontSize: 9.5,
  fontWeight: 700,
  display: "grid",
  placeItems: "center",
};
const dotRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 4,
  marginTop: "auto",
  paddingBottom: 2,
};
const eventDot: React.CSSProperties = {
  width: 7,
  height: 7,
  minWidth: 7,
  borderRadius: "50%",
  display: "inline-block",
};
const dayDot: React.CSSProperties = {
  width: 7,
  height: 7,
  minWidth: 7,
  borderRadius: "50%",
};
const weekGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  overflow: "hidden",
};
const weekCell: React.CSSProperties = {
  padding: 8,
  borderRight: "1px solid var(--border)",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minHeight: 0,
  minWidth: 0,
  overflow: "hidden",
};
const weekItemChip: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
};
const dayBody: React.CSSProperties = {
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
};
const sidePanel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  padding: 14,
  minWidth: 0,
  minHeight: 0,
  height: "100%",
  overflow: "hidden",
};
const sideFooter: React.CSSProperties = {
  marginTop: 12,
  paddingTop: 12,
  borderTop: "1px solid var(--border)",
  flexShrink: 0,
};
const agendaCard: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  boxShadow: "var(--shadow)",
};
const sourceIcon: React.CSSProperties = {
  width: 34,
  height: 34,
  minWidth: 34,
  borderRadius: 10,
  display: "grid",
  placeItems: "center",
  fontSize: 14,
};
const avatar: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: "50%",
  background: "var(--brand-fill)",
  color: "var(--on-brand)",
  fontSize: 9,
  fontWeight: 700,
  display: "grid",
  placeItems: "center",
  border: "2px solid #fff",
};
const joinBtn: React.CSSProperties = {
  marginTop: 10,
  background: "#1E9E62",
  color: "#fff",
  border: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  textDecoration: "none",
};
const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
  marginTop: 4,
};
const closeBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "var(--bg)",
  border: "none",
  color: "var(--text-muted)",
};
