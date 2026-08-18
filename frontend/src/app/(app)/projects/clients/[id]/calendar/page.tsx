"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { BackLink } from "@/components/BackLink";
import { useConfirm } from "@/components/ConfirmDialog";
import { DatePicker } from "@/components/DatePicker";
import { MonthYearSelect } from "@/components/MonthYearSelect";
import { TimePicker } from "@/components/TimePicker";
import { KpiCard } from "@/components/KpiCard";
import { Modal } from "@/components/Modal";
import { MultiSelect } from "@/components/MultiSelect";
import { Select } from "@/components/Select";
import { api, ApiError, formatApiError, unwrapList } from "@/lib/api";
import { assigneeSelectOptions } from "@/lib/assigneeOptions";
import { useAuth } from "@/lib/auth";
import { detectMeetingUrl } from "@/lib/meetingLinks";
import { STATUS_BADGE, STATUS_COLOR } from "@/lib/statusBadges";
import { useToast } from "@/lib/toast";
import { useShellFillHeight } from "@/lib/useShellFillHeight";

type Client = { id: number; client_id: string; name: string; poc_name: string; accent_color: string; logo_url: string };
type Contact = { id: number; full_name: string; email: string };
type ContentItem = {
  id: number;
  client: number;
  content_type: string;
  title: string;
  description: string;
  scheduled_date: string;
  deadline: string | null;
  deadline_time: string | null;
  status: string;
  assignees: number[];
  assignee_names: { id: number; name: string }[];
  my_task_id: number | null;
  attachment_url: string;
  attachment_urls: string[];
  created_by_name: string;
  created_at: string;
};

const CONTENT_TYPES = [
  { value: "static_post", label: "Static Post" },
  { value: "reel", label: "Reel" },
  { value: "story", label: "Story" },
  { value: "video", label: "Video" },
  { value: "carousel", label: "Carousel" },
  { value: "other", label: "Other" },
];
// Labels match the Tasks page's Status wording exactly (To do / In progress /
// Completed) — this content item is mirrored onto a real Task for each
// assignee, so the same state should read identically in both places.
const STATUSES = [
  { value: "planned", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Completed" },
  { value: "published", label: "Published" },
];
const DEFAULT_ACCENT = "#3673FC";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatCreatedAt(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

const emptyForm = {
  content_type: "static_post",
  title: "",
  description: "",
  scheduled_date: "",
  deadline: "",
  deadline_time: "",
  status: "planned",
  assignees: [] as number[],
};

function snapshotContentForm(f: typeof emptyForm, files: File[]) {
  return JSON.stringify({
    ...f,
    assignees: [...f.assignees].sort((a, b) => a - b),
    files: files.map((x) => `${x.name}:${x.size}`),
  });
}

export default function ClientCalendarPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const focusItemId = Number(searchParams.get("item") || "") || null;
  const clientId = params.id as string;
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const rootRef = useRef<HTMLDivElement>(null);
  useShellFillHeight(rootRef);

  const [client, setClient] = useState<Client | null>(null);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [directory, setDirectory] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const deepLinkedItemRef = useRef<number | null>(null);

  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formBaseline = useRef("");

  const accent = client?.accent_color || DEFAULT_ACCENT;

  const loadItems = () => {
    setLoading(true);
    api<ContentItem[] | { results: ContentItem[] }>(`/api/projects/content-calendar?client=${clientId}`)
      .then((d) => setItems(unwrapList(d)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api<Client>(`/api/projects/clients/${clientId}`).then(setClient).catch(() => {});
    loadItems();
    api<Contact[]>("/api/messages/directory").then(setDirectory).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // Deep-link from Tasks: land on the day for ?item= and open details once.
  useEffect(() => {
    if (!focusItemId || loading || !items.length) return;
    if (deepLinkedItemRef.current === focusItemId) return;
    const item = items.find((it) => it.id === focusItemId);
    if (!item) return;
    deepLinkedItemRef.current = focusItemId;
    const dayIso = item.deadline || item.scheduled_date;
    const [y, m, d] = dayIso.split("-").map(Number);
    const day = new Date(y, m - 1, d);
    setSelectedDate(day);
    setAnchor(new Date(y, m - 1, 1));
    setEditingId(item.id);
    setForm({
      content_type: item.content_type,
      title: item.title,
      description: item.description,
      scheduled_date: dayIso,
      deadline: dayIso,
      deadline_time: item.deadline_time || "",
      status: item.status,
      assignees: item.assignees,
    });
    setAttachments([]);
    formBaseline.current = snapshotContentForm(
      {
        content_type: item.content_type,
        title: item.title,
        description: item.description,
        scheduled_date: dayIso,
        deadline: dayIso,
        deadline_time: item.deadline_time || "",
        status: item.status,
        assignees: item.assignees,
      },
      []
    );
    setError(null);
    setModalOpen(true);
  }, [focusItemId, loading, items]);

  const assigneeOptions = useMemo(
    () => assigneeSelectOptions(user, directory),
    [user, directory]
  );

  const gridStart = useMemo(
    () => startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1)),
    [anchor]
  );
  const gridEnd = useMemo(() => {
    const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const end = new Date(lastOfMonth);
    end.setDate(end.getDate() + (6 - end.getDay()));
    return end;
  }, [anchor]);
  const monthDays = useMemo(() => {
    const days: Date[] = [];
    const cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [gridStart, gridEnd]);

  const itemsByDate = useMemo(() => {
    const map: Record<string, ContentItem[]> = {};
    for (const it of items) {
      if (!map[it.scheduled_date]) map[it.scheduled_date] = [];
      map[it.scheduled_date].push(it);
    }
    return map;
  }, [items]);

  const counts = useMemo(
    () => ({
      total: items.length,
      done: items.filter((i) => i.status === "done").length,
      published: items.filter((i) => i.status === "published").length,
      in_progress: items.filter((i) => i.status === "in_progress").length,
      planned: items.filter((i) => i.status === "planned").length,
    }),
    [items]
  );

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setAttachments([]);
    setError(null);
  };

  const closeModal = () => {
    setModalOpen(false);
    resetForm();
  };

  const openCreate = (date: Date) => {
    resetForm();
    const day = toIso(date);
    const next = {
      ...emptyForm,
      scheduled_date: day,
      deadline: day,
      deadline_time: "",
      assignees: user?.id ? [user.id] : [],
    };
    setForm(next);
    formBaseline.current = snapshotContentForm(next, []);
    setModalOpen(true);
  };

  const openEdit = (item: ContentItem) => {
    setEditingId(item.id);
    const day = item.deadline || item.scheduled_date;
    const next = {
      content_type: item.content_type,
      title: item.title,
      description: item.description,
      scheduled_date: day,
      deadline: day,
      deadline_time: item.deadline_time || "",
      status: item.status,
      assignees: item.assignees,
    };
    setForm(next);
    formBaseline.current = snapshotContentForm(next, []);
    setAttachments([]);
    setError(null);
    setModalOpen(true);
  };

  const persistContent = async () => {
    if (!form.title.trim() || !form.deadline) {
      setError("Title and deadline are required.");
      return false;
    }
    setSaving(true);
    setError(null);
    try {
      const day = form.deadline;
      const body = new FormData();
      body.append("client", clientId);
      body.append("content_type", form.content_type);
      body.append("title", form.title.trim());
      body.append("description", form.description);
      body.append("scheduled_date", day);
      body.append("deadline", day);
      if (form.deadline_time) body.append("deadline_time", form.deadline_time);
      else body.append("deadline_time", "");
      body.append("status", form.status);
      form.assignees.forEach((a) => body.append("assignees", String(a)));
      attachments.forEach((f) => body.append("attachments", f));

      if (editingId) {
        await api(`/api/projects/content-calendar/${editingId}`, { method: "PATCH", body });
        showToast("Content item updated.");
      } else {
        await api("/api/projects/content-calendar", { method: "POST", body });
        showToast("Content item added.");
      }
      closeModal();
      loadItems();
      return true;
    } catch (err: any) {
      setError(err instanceof ApiError ? formatApiError(err.data) : err.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const requestCloseModal = async () => {
    if (saving) return;
    if (snapshotContentForm(form, attachments) === formBaseline.current) {
      closeModal();
      return;
    }
    const result = await confirm("Save your changes, or exit without saving?", {
      title: "Unsaved changes",
      confirmLabel: "Save",
      discardLabel: "Exit without saving",
      cancelLabel: "Keep editing",
    });
    if (result === true) await persistContent();
    else if (result === "discard") closeModal();
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    await persistContent();
  };

  const remove = async () => {
    if (!editingId) return;
    const name = form.title.trim() || "this content item";
    const ok = await confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`, {
      title: "Delete Content Item",
      danger: true,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setSaving(true);
    try {
      await api(`/api/projects/content-calendar/${editingId}`, { method: "DELETE" });
      showToast("Content item deleted.");
      closeModal();
      loadItems();
    } catch {
      showToast("Couldn't delete item.", "error");
    } finally {
      setSaving(false);
    }
  };

  const goPrev = () => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1));
  const goNext = () => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1));
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

  const today = new Date();
  const editingItem = editingId ? items.find((i) => i.id === editingId) : null;
  const selectedItems = itemsByDate[toIso(selectedDate)] ?? [];

  const detectMeeting = (text: string) => detectMeetingUrl(text);

  const markDone = async (item: ContentItem) => {
    try {
      await api(`/api/projects/content-calendar/${item.id}`, {
        method: "PATCH",
        body: (() => {
          const body = new FormData();
          body.append("status", item.status === "done" ? "planned" : "done");
          return body;
        })(),
      });
      loadItems();
    } catch {
      showToast("Couldn't update status.", "error");
    }
  };

  const statusLabel = (s: string) => STATUSES.find((x) => x.value === s)?.label || s;

  return (
    <div
      ref={rootRef}
      className="kwick-client-cal"
    >
      <div style={{ flexShrink: 0 }}>
        <BackLink href="/projects/clients" label="Back to Clients" />
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
          <span style={{ ...logoCircle, background: `${accent}22`, color: accent }}>
            {client?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={client.logo_url} alt="" style={logoImg} />
            ) : (
              client?.name?.[0]?.toUpperCase() || "…"
            )}
          </span>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: 20 }}>{client?.name || "…"}</h1>
              {client && (
                <span className="badge badge-muted" style={{ fontFamily: "monospace" }}>
                  {client.client_id}
                </span>
              )}
            </div>
            {client?.poc_name ? (
              <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
                POC: {client.poc_name}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className="client-cal-kpis"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: 8 }}
      >
        <KpiCard label="Total Items" value={counts.total} icon="bi-collection-fill" tone="blue" />
        <KpiCard label="Completed" value={counts.done} icon="bi-check-circle-fill" tone="mint" />
        <KpiCard label="Published" value={counts.published} icon="bi-broadcast" tone="blue" />
        <KpiCard label="In Progress" value={counts.in_progress} icon="bi-hourglass-split" tone="amber" />
        <KpiCard label="To Do" value={counts.planned} icon="bi-calendar-event" tone="purple" />
      </div>

      <div className="kwick-cal-layout cal-stack-mobile">
        <div className="card client-cal-board" style={{ padding: 0, overflow: "hidden", minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ ...calHeader, background: `linear-gradient(135deg, ${accent} 0%, ${accent}cc 100%)` }}>
            <MonthYearSelect
              light
              month={anchor.getMonth()}
              year={anchor.getFullYear()}
              onMonthChange={(month) => jumpToMonth(anchor.getFullYear(), month)}
              onYearChange={(year) => jumpToMonth(year, anchor.getMonth())}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="icon-btn-anim" style={navBtn} onClick={goPrev} aria-label="Previous month">
                <i className="bi bi-chevron-left" />
              </button>
              <button className="icon-btn-anim" style={navBtn} onClick={goToday} aria-label="This month">
                <i className="bi bi-calendar-event" />
              </button>
              <button className="icon-btn-anim" style={navBtn} onClick={goNext} aria-label="Next month">
                <i className="bi bi-chevron-right" />
              </button>
            </div>
          </div>
          <div className="client-cal-weekdays" style={weekHeaderRow}>
            {WEEKDAYS.map((d) => (
              <div key={d} className="client-cal-weekday" style={weekHeaderCell}>
                <span className="client-cal-weekday-full">{d}</span>
                <span className="client-cal-weekday-short">{d.charAt(0)}</span>
              </div>
            ))}
          </div>
          {loading ? (
            <p className="muted" style={{ padding: 20 }}>Loading…</p>
          ) : (
            <div
              className="client-cal-month"
              style={{
                ...monthGrid,
                flex: 1,
                minHeight: 0,
                gridTemplateRows: `repeat(${Math.ceil(monthDays.length / 7)}, minmax(0, 1fr))`,
              }}
            >
              {monthDays.map((d) => {
                const iso = toIso(d);
                const dayItems = itemsByDate[iso] ?? [];
                const inMonth = d.getMonth() === anchor.getMonth();
                const isToday = iso === toIso(today);
                const isSelected = iso === toIso(selectedDate);
                return (
                  <div
                    key={iso}
                    className="client-cal-day"
                    onClick={() => setSelectedDate(d)}
                    style={{
                      ...dayCell,
                      opacity: inMonth ? 1 : 0.4,
                      background: isSelected ? `${accent}14` : isToday ? "var(--success-soft)" : "transparent",
                      boxShadow: isSelected ? `inset 0 0 0 2px ${accent}` : undefined,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, fontWeight: isToday || isSelected ? 700 : 500 }}>{d.getDate()}</span>
                      <button
                        type="button"
                        className="icon-btn-anim client-cal-add"
                        style={{ ...addDayBtn, background: `${accent}22`, color: accent }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDate(d);
                          openCreate(d);
                        }}
                        aria-label="Add content item"
                        title="Add content item"
                      >
                        <i className="bi bi-plus-lg" style={{ fontSize: 10.5 }} />
                      </button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
                      {dayItems.slice(0, 3).map((it) => (
                        <button
                          key={it.id}
                          type="button"
                          className="client-cal-chip"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDate(d);
                            openEdit(it);
                          }}
                          style={{
                            ...itemChip,
                            background: `${STATUS_COLOR[it.status] ?? "var(--gold)"}1f`,
                            color: STATUS_COLOR[it.status] ?? "var(--gold)",
                            textDecoration: it.status === "published" ? "line-through" : undefined,
                            opacity: it.status === "published" ? 0.65 : 1,
                            border: "none",
                            width: "100%",
                            textAlign: "left",
                            cursor: "pointer",
                          }}
                          title={it.title}
                        >
                          <span className="client-cal-chip-title">{it.title}</span>
                        </button>
                      ))}
                      {dayItems.length > 3 && (
                        <span className="muted" style={{ fontSize: 10 }}>+{dayItems.length - 3} more</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card" style={sidePanel}>
          <div style={{ marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--navy)" }}>
                {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, overflowY: "auto", minHeight: 0 }}>
            {selectedItems.length === 0 && (
              <p className="muted" style={{ fontSize: 13 }}>No content on this day.</p>
            )}
            {selectedItems.map((it) => {
              const color = STATUS_COLOR[it.status] ?? accent;
              const meeting = detectMeeting(it.description || "");
              const finished = it.status === "published";
              const completed = it.status === "done";
              return (
                <div
                  key={it.id}
                  style={{
                    ...contentCard,
                    opacity: finished ? 0.72 : 1,
                  }}
                >
                  <div style={{ display: "flex", gap: 10 }}>
                    <span style={{ ...typeIcon, background: `${color}18`, color }}>
                      <i className="bi bi-image" />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => openEdit(it)}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            textAlign: "left",
                            fontWeight: 650,
                            fontSize: 13.5,
                            color: "var(--navy)",
                            cursor: "pointer",
                            textDecoration: finished ? "line-through" : undefined,
                            flex: 1,
                          }}
                          title="Edit content"
                        >
                          {it.title}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ padding: "2px 8px", fontSize: 11 }}
                          onClick={() => markDone(it)}
                          title={completed ? "Mark as to do" : "Mark completed"}
                        >
                          <i className={`bi ${completed ? "bi-arrow-counterclockwise" : "bi-check2"}`} />
                        </button>
                      </div>
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span>
                          {CONTENT_TYPES.find((c) => c.value === it.content_type)?.label || it.content_type}
                        </span>
                        <span className={`badge ${STATUS_BADGE[it.status] ?? "badge-muted"}`}>
                          {statusLabel(it.status)}
                        </span>
                      </div>
                      {(it.created_at || it.created_by_name) && (
                        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                          <i className="bi bi-clock" style={{ marginRight: 4 }} />
                          Created {formatCreatedAt(it.created_at) || "—"}
                          {it.created_by_name ? ` · ${it.created_by_name}` : ""}
                        </div>
                      )}
                      {it.assignee_names?.length > 0 && (
                        <div style={{ display: "flex", marginTop: 8 }}>
                          {it.assignee_names.slice(0, 5).map((a, i) => (
                            <span
                              key={a.id}
                              title={a.name}
                              style={{
                                ...avatar,
                                marginLeft: i === 0 ? 0 : -6,
                                zIndex: 5 - i,
                              }}
                            >
                              {a.name
                                .split(/\s+/)
                                .slice(0, 2)
                                .map((p) => p[0]?.toUpperCase() || "")
                                .join("")}
                            </span>
                          ))}
                        </div>
                      )}
                      {meeting && (
                        <a
                          href={meeting}
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
            })}
          </div>

          <div style={sideFooter}>
            <button className="btn" style={{ width: "100%", background: accent, borderColor: accent }} onClick={() => openCreate(selectedDate)}>
              <i className="bi bi-plus-lg" /> Add Content
            </button>
          </div>
        </div>
      </div>

      <Modal open={modalOpen} onClose={requestCloseModal} wide>
        <form onSubmit={save}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="card-title" style={{ margin: 0 }}>
              {editingId ? "Edit Content Item" : "New Content Item"}
            </span>
            <button
              type="button"
              className="icon-btn-anim"
              style={closeBtn}
              onClick={requestCloseModal}
              aria-label="Close"
            >
              <i className="bi bi-x-lg" />
            </button>
          </div>
          {editingId && (() => {
            const existing = items.find((i) => i.id === editingId);
            if (!existing?.created_at && !existing?.created_by_name) return null;
            return (
              <p className="muted" style={{ fontSize: 12.5, margin: "8px 0 0" }}>
                <i className="bi bi-clock" style={{ marginRight: 6 }} />
                Created {formatCreatedAt(existing.created_at) || "—"}
                {existing.created_by_name ? ` by ${existing.created_by_name}` : ""}
              </p>
            );
          })()}

          <div className="kwick-form-wide" style={{ marginTop: 14 }}>
            <div className="kwick-form-wide__row kwick-form-wide__row--2">
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Content type</label>
                <Select
                  value={form.content_type}
                  onChange={(v) => setForm((f) => ({ ...f, content_type: v }))}
                  options={CONTENT_TYPES}
                  ariaLabel="Content type"
                />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Status</label>
                <Select
                  value={form.status}
                  onChange={(v) => setForm((f) => ({ ...f, status: v }))}
                  options={STATUSES}
                  ariaLabel="Status"
                />
              </div>
            </div>

            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Assign people</label>
              <MultiSelect
                values={form.assignees.map(String)}
                onChange={(vals) => setForm((f) => ({ ...f, assignees: vals.map(Number) }))}
                options={assigneeOptions}
                placeholder="Select one or more people…"
                ariaLabel="Assign people"
              />
              {form.assignees.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {form.assignees.map((id) => {
                    const label = assigneeOptions.find((o) => o.value === String(id))?.label || `User ${id}`;
                    return (
                      <span key={id} className="badge badge-muted" style={{ fontSize: 12 }}>
                        {label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Title</label>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>

            <div className="kwick-form-wide__desc">
              <label className="field-label" style={{ marginTop: 0 }}>Description</label>
              <textarea
                className="input"
                rows={6}
                style={{ resize: "vertical" }}
                placeholder="Write content details"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="kwick-form-wide__row kwick-form-wide__row--3">
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Deadline</label>
                <DatePicker
                  value={form.deadline}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      deadline: v,
                      scheduled_date: v,
                      deadline_time: v ? f.deadline_time : "",
                    }))
                  }
                  ariaLabel="Deadline"
                />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Deadline time</label>
                <TimePicker
                  value={form.deadline_time}
                  onChange={(v) => setForm((f) => ({ ...f, deadline_time: v }))}
                  ariaLabel="Deadline time"
                  disabled={!form.deadline}
                />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Attachments</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    multiple
                    hidden
                    onChange={(e) => {
                      const picked = Array.from(e.target.files || []);
                      e.target.value = "";
                      if (!picked.length) return;
                      setAttachments((prev) => [...prev, ...picked].slice(0, 5));
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => attachmentInputRef.current?.click()}
                    disabled={attachments.length >= 5}
                  >
                    <i className="bi bi-paperclip" /> Choose files
                  </button>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    Up to 5{attachments.length ? ` · ${attachments.length} selected` : ""}
                  </span>
                </div>
              </div>
            </div>

              {attachments.length > 0 && (
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  {attachments.map((f, idx) => (
                    <li key={`${f.name}-${idx}`} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                      <i className="bi bi-file-earmark" style={{ color: "var(--gold)" }} />
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: "2px 8px", color: "var(--danger)" }}
                        onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label="Remove file"
                      >
                        <i className="bi bi-x-lg" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {(() => {
                const existing = editingItem?.attachment_urls?.length
                  ? editingItem.attachment_urls
                  : editingItem?.attachment_url
                  ? [editingItem.attachment_url]
                  : [];
                if (!existing.length || attachments.length > 0) return null;
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className="muted" style={{ fontSize: 12 }}>Attachments</span>
                    {existing.map((url, i) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="muted"
                        style={{ fontSize: 12, color: "var(--gold)" }}
                      >
                        <i className="bi bi-download" /> Attachment {i + 1}
                      </a>
                    ))}
                  </div>
                );
              })()}

              {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className="btn" disabled={saving}>
                  {saving ? "Saving…" : editingId ? "Save changes" : "Add item"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={requestCloseModal}>
                  Cancel
                </button>
                {editingId && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ color: "var(--danger)", marginLeft: "auto" }}
                    onClick={remove}
                    disabled={saving}
                  >
                    <i className="bi bi-trash-fill" /> Delete
                  </button>
                )}
          </div>
          </div>
        </form>
      </Modal>
      {ConfirmDialog}
    </div>
  );
}

const calHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 12,
  padding: "14px 16px",
  color: "#fff",
  flexShrink: 0,
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
  marginTop: 14,
  paddingTop: 14,
  borderTop: "1px solid var(--border)",
};
const contentCard: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: 12,
  boxShadow: "var(--shadow)",
};
const typeIcon: React.CSSProperties = {
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
const navBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,0.2)",
  color: "#fff",
  border: "none",
};
const weekHeaderRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  borderBottom: "1px solid var(--border)",
};
const weekHeaderCell: React.CSSProperties = {
  padding: "8px 6px",
  fontSize: 11.5,
  fontWeight: 600,
  color: "var(--text-muted)",
  textAlign: "center",
};
const monthGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
};
const dayCell: React.CSSProperties = {
  minHeight: 0,
  minWidth: 0,
  padding: 6,
  borderRight: "1px solid var(--border)",
  borderBottom: "1px solid var(--border)",
  display: "flex",
  flexDirection: "column",
  cursor: "pointer",
  overflow: "hidden",
};
const addDayBtn: React.CSSProperties = {
  width: 18,
  height: 18,
  minWidth: 18,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  border: "none",
};
const itemChip: React.CSSProperties = {
  border: "none",
  borderRadius: 6,
  padding: "3px 6px",
  fontSize: 10.5,
  fontWeight: 500,
  textAlign: "left",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  cursor: "pointer",
};
const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};
const logoCircle: React.CSSProperties = {
  width: 44,
  height: 44,
  minWidth: 44,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  fontSize: 17,
  overflow: "hidden",
  flexShrink: 0,
};
const logoImg: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
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
