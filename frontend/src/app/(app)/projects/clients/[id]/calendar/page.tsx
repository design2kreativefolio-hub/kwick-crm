"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { BackLink } from "@/components/BackLink";
import { useConfirm } from "@/components/ConfirmDialog";
import { DatePicker } from "@/components/DatePicker";
import { KpiCard } from "@/components/KpiCard";
import { Modal } from "@/components/Modal";
import { MultiSelect } from "@/components/MultiSelect";
import { Select } from "@/components/Select";
import { api, ApiError, formatApiError, unwrapList } from "@/lib/api";
import { useToast } from "@/lib/toast";

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
  status: string;
  assignees: number[];
  assignee_names: { id: number; name: string }[];
  attachment_url: string;
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
];
const STATUS_COLOR: Record<string, string> = {
  planned: "#7C4FE0",
  in_progress: "#C9821B",
  done: "#1E9E62",
};
const DEFAULT_ACCENT = "#3673FC";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  status: "planned",
  assignees: [] as number[],
};

export default function ClientCalendarPage() {
  const params = useParams();
  const clientId = params.id as string;
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const [client, setClient] = useState<Client | null>(null);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [directory, setDirectory] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const [anchor, setAnchor] = useState(() => new Date());

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const assigneeOptions = useMemo(
    () => directory.map((c) => ({ value: String(c.id), label: c.full_name || c.email })),
    [directory]
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
      in_progress: items.filter((i) => i.status === "in_progress").length,
      planned: items.filter((i) => i.status === "planned").length,
    }),
    [items]
  );

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setAttachment(null);
    setError(null);
  };

  const closeModal = () => {
    setModalOpen(false);
    resetForm();
  };

  const openCreate = (date: Date) => {
    resetForm();
    setForm((f) => ({ ...f, scheduled_date: toIso(date) }));
    setModalOpen(true);
  };

  const openEdit = (item: ContentItem) => {
    setEditingId(item.id);
    setForm({
      content_type: item.content_type,
      title: item.title,
      description: item.description,
      scheduled_date: item.scheduled_date,
      deadline: item.deadline || "",
      status: item.status,
      assignees: item.assignees,
    });
    setAttachment(null);
    setError(null);
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.scheduled_date) {
      setError("Title and scheduled date are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("client", clientId);
      body.append("content_type", form.content_type);
      body.append("title", form.title.trim());
      body.append("description", form.description);
      body.append("scheduled_date", form.scheduled_date);
      if (form.deadline) body.append("deadline", form.deadline);
      body.append("status", form.status);
      form.assignees.forEach((a) => body.append("assignees", String(a)));
      if (attachment) body.append("attachment", attachment);

      if (editingId) {
        await api(`/api/projects/content-calendar/${editingId}`, { method: "PATCH", body });
        showToast("Content item updated.");
      } else {
        await api("/api/projects/content-calendar", { method: "POST", body });
        showToast("Content item added.");
      }
      closeModal();
      loadItems();
    } catch (err: any) {
      setError(err instanceof ApiError ? formatApiError(err.data) : err.message);
    } finally {
      setSaving(false);
    }
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
  const goToday = () => setAnchor(new Date());

  const today = new Date();
  const editingItem = editingId ? items.find((i) => i.id === editingId) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
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
              <h1 style={{ margin: 0, fontSize: 22 }}>{client?.name || "…"}</h1>
              {client && (
                <span className="badge badge-muted" style={{ fontFamily: "monospace" }}>
                  {client.client_id}
                </span>
              )}
            </div>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
              Social media content calendar{client?.poc_name ? ` · POC: ${client.poc_name}` : ""}
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        <KpiCard label="Total Items" value={counts.total} icon="bi-collection-fill" tone="blue" />
        <KpiCard label="Completed" value={counts.done} icon="bi-check-circle-fill" tone="mint" />
        <KpiCard label="In Progress" value={counts.in_progress} icon="bi-hourglass-split" tone="amber" />
        <KpiCard label="To Do" value={counts.planned} icon="bi-calendar-event" tone="purple" />
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ ...calHeader, background: `linear-gradient(135deg, ${accent} 0%, ${accent}cc 100%)` }}>
          <span style={{ fontSize: 17, fontWeight: 700 }}>
            {anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </span>
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
        <div style={weekHeaderRow}>
          {WEEKDAYS.map((d) => (
            <div key={d} style={weekHeaderCell}>{d}</div>
          ))}
        </div>
        {loading ? (
          <p className="muted" style={{ padding: 20 }}>Loading…</p>
        ) : (
          <div style={monthGrid}>
            {monthDays.map((d) => {
              const iso = toIso(d);
              const dayItems = itemsByDate[iso] ?? [];
              const inMonth = d.getMonth() === anchor.getMonth();
              const isToday = iso === toIso(today);
              return (
                <div
                  key={iso}
                  onClick={() => openCreate(d)}
                  style={{
                    ...dayCell,
                    opacity: inMonth ? 1 : 0.4,
                    background: isToday ? "var(--success-soft)" : "transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: isToday ? 700 : 500 }}>{d.getDate()}</span>
                    <button
                      type="button"
                      className="icon-btn-anim"
                      style={{ ...addDayBtn, background: `${accent}22`, color: accent }}
                      onClick={(e) => {
                        e.stopPropagation();
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
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(it);
                        }}
                        style={{
                          ...itemChip,
                          background: `${STATUS_COLOR[it.status] ?? "var(--gold)"}1f`,
                          color: STATUS_COLOR[it.status] ?? "var(--gold)",
                        }}
                        title={it.title}
                      >
                        {it.title}
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

      <Modal open={modalOpen} onClose={closeModal}>
        <form onSubmit={save}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="card-title" style={{ margin: 0 }}>
              {editingId ? "Edit Content Item" : "New Content Item"}
            </span>
            <button
              type="button"
              className="icon-btn-anim"
              style={closeBtn}
              onClick={closeModal}
              aria-label="Close"
            >
              <i className="bi bi-x-lg" />
            </button>
          </div>

          <label className="field-label" style={{ marginTop: 14 }}>Content type</label>
              <Select
                value={form.content_type}
                onChange={(v) => setForm((f) => ({ ...f, content_type: v }))}
                options={CONTENT_TYPES}
                ariaLabel="Content type"
              />

              <label className="field-label">Title</label>
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
                style={{ resize: "vertical" }}
                placeholder="Write content details"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />

              <div style={fieldGrid}>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Scheduled date</label>
                  <DatePicker
                    value={form.scheduled_date}
                    onChange={(v) => setForm((f) => ({ ...f, scheduled_date: v }))}
                    ariaLabel="Scheduled date"
                  />
                </div>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Deadline</label>
                  <DatePicker
                    value={form.deadline}
                    onChange={(v) => setForm((f) => ({ ...f, deadline: v }))}
                    ariaLabel="Deadline"
                  />
                </div>
              </div>

              <label className="field-label">Status</label>
              <Select
                value={form.status}
                onChange={(v) => setForm((f) => ({ ...f, status: v }))}
                options={STATUSES}
                ariaLabel="Status"
              />

              <label className="field-label">Assign people</label>
              <MultiSelect
                values={form.assignees.map(String)}
                onChange={(vals) => setForm((f) => ({ ...f, assignees: vals.map(Number) }))}
                options={assigneeOptions}
                placeholder="Select people…"
                ariaLabel="Assign people"
              />

              <label className="field-label">Attachment</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  ref={attachmentInputRef}
                  type="file"
                  hidden
                  onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => attachmentInputRef.current?.click()}
                >
                  <i className="bi bi-paperclip" /> Choose file
                </button>
                <span className="muted" style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {attachment
                    ? attachment.name
                    : editingItem?.attachment_url
                    ? "Current attachment kept"
                    : "No file chosen"}
                </span>
              </div>
              {editingItem?.attachment_url && !attachment && (
                <a
                  href={editingItem.attachment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="muted"
                  style={{ fontSize: 12, color: "var(--gold)", marginTop: 6, display: "inline-block" }}
                >
                  <i className="bi bi-download" /> View current attachment
                </a>
              )}

              {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>}

              <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
                <button className="btn" disabled={saving}>
                  {saving ? "Saving…" : editingId ? "Save changes" : "Add item"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={closeModal}>
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
  padding: "16px 20px",
  color: "#fff",
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
  gridTemplateColumns: "repeat(7, 1fr)",
};
const dayCell: React.CSSProperties = {
  minHeight: 84,
  padding: 6,
  borderRight: "1px solid var(--border)",
  borderBottom: "1px solid var(--border)",
  display: "flex",
  flexDirection: "column",
  cursor: "pointer",
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
