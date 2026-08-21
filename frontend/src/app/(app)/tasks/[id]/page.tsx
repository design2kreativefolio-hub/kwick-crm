"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { BackLink } from "@/components/BackLink";
import { Combobox } from "@/components/Combobox";
import { useConfirm } from "@/components/ConfirmDialog";
import { DatePicker } from "@/components/DatePicker";
import { MultiSelect } from "@/components/MultiSelect";
import { Select } from "@/components/Select";
import { TimePicker } from "@/components/TimePicker";
import { api, ApiError, formatApiError, unwrapList } from "@/lib/api";
import { assigneeSelectOptions } from "@/lib/assigneeOptions";
import { useAuth } from "@/lib/auth";
import { STATUS_BADGE, TASK_STATUS_LABEL, TASK_STATUS_OPTIONS, isTaskApproved } from "@/lib/statusBadges";
import { useToast } from "@/lib/toast";

type Task = {
  id: number;
  title: string;
  description: string;
  project: number | null;
  project_name: string;
  client_name: string;
  client?: number | null;
  assignee: number | null;
  assignee_name: string;
  assignee_ids?: number[];
  assignee_names?: { id: number; name: string }[];
  content_item: number | null;
  content_client_id?: number | null;
  status: string;
  from_todo?: boolean;
  priority: "low" | "medium" | "high";
  due_date: string | null;
  due_time: string | null;
  completed_at: string | null;
  created_at: string;
};

type TaskUpdate = {
  id: number;
  author: number;
  author_name: string;
  body: string;
  created_at: string;
};

type ContentItem = { id: number; client: number };
type ClientOption = { id: number; name: string };
type Contact = { id: number; full_name: string; email: string; role: string };

type EditForm = {
  title: string;
  description: string;
  client_name: string;
  assignee_ids: string[];
  due_date: string;
  due_time: string;
  priority: string;
};

const STATUS_OPTIONS = TASK_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];
const PRIORITY_BADGE: Record<string, string> = {
  low: "badge-muted",
  medium: "badge-warning",
  high: "badge-danger",
};

function formFromTask(task: Task): EditForm {
  const ids = task.assignee_ids?.length
    ? task.assignee_ids
    : task.assignee
      ? [task.assignee]
      : [];
  return {
    title: task.title,
    description: task.description || "",
    client_name: task.client_name || "",
    assignee_ids: ids.map(String),
    due_date: task.due_date || "",
    due_time: task.due_time || "",
    priority: task.priority,
  };
}

function formatDue(date: string | null, time?: string | null) {
  if (!date) return "—";
  const [y, m, d] = date.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  if (!time) return label;
  const [hh, mm] = time.split(":");
  const t = new Date();
  t.setHours(Number(hh), Number(mm), 0, 0);
  return `${label}, ${t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TaskDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const isSuperadmin = user?.role === "superadmin";

  const [task, setTask] = useState<Task | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const formBaseline = useRef("");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [updates, setUpdates] = useState<TaskUpdate[]>([]);
  const [updateText, setUpdateText] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);

  const applyTask = (t: Task) => {
    setTask(t);
    const next = formFromTask(t);
    setForm(next);
    formBaseline.current = JSON.stringify(next);
  };

  const loadUpdates = () => {
    api<TaskUpdate[]>(`/api/tasks/${id}/updates`)
      .then(setUpdates)
      .catch(() => setUpdates([]));
  };

  const load = () => {
    setLoading(true);
    setNotFound(false);
    api<Task>(`/api/tasks/${id}`)
      .then((t) => {
        if (t.content_item && t.content_client_id) {
          router.replace(
            `/projects/clients/${t.content_client_id}/calendar?item=${t.content_item}`
          );
          return;
        }
        if (t.content_item) {
          api<ContentItem>(`/api/projects/content-calendar/${t.content_item}`)
            .then((ci) => {
              router.replace(`/projects/clients/${ci.client}/calendar?item=${t.content_item}`);
            })
            .catch(() => {
              applyTask(t);
              setLoading(false);
              loadUpdates();
            });
          return;
        }
        applyTask(t);
        setLoading(false);
        loadUpdates();
      })
      .catch(() => {
        setNotFound(true);
        setLoading(false);
      });
  };

  useEffect(load, [id, router]);

  useEffect(() => {
    api<ClientOption[] | { results: ClientOption[] }>("/api/projects/clients")
      .then((d) => setClients(unwrapList(d)))
      .catch(() => {});
    api<Contact[]>("/api/messages/directory").then(setContacts).catch(() => {});
  }, []);

  const isSynced = !!task?.content_item;
  const assigneeIds = task?.assignee_ids?.length
    ? task.assignee_ids
    : task?.assignee
      ? [task.assignee]
      : [];
  const isAssignee = !!user && assigneeIds.includes(user.id);
  const canEdit = !isSynced && (isSuperadmin || isAssignee);
  const dirty = !!form && JSON.stringify(form) !== formBaseline.current;

  const assigneeOptions = useMemo(() => assigneeSelectOptions(user, contacts), [user, contacts]);
  const clientOptions = useMemo(() => clients.map((c) => c.name), [clients]);

  const updateField = async (payload: Record<string, unknown>) => {
    if (!canEdit) return;
    setBusy(true);
    try {
      const updated = await api<Task>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setTask(updated);
      showToast("Task updated.");
    } catch (err: any) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const saveDetails = async () => {
    if (!form || !canEdit) return;
    if (!form.title.trim()) {
      showToast("Title is required.", "error");
      return;
    }
    setSaving(true);
    try {
      const assigneeIdsPayload = form.assignee_ids.map(Number).filter(Boolean);
      const matched = clients.find(
        (c) => c.name.toLowerCase() === form.client_name.trim().toLowerCase(),
      );
      const updated = await api<Task>(`/api/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description,
          client_name: form.client_name.trim(),
          client: matched ? matched.id : null,
          assignee_ids: assigneeIdsPayload.length ? assigneeIdsPayload : user?.id ? [user.id] : [],
          due_date: form.due_date || null,
          due_time: form.due_date ? form.due_time || null : null,
          priority: form.priority,
        }),
      });
      applyTask(updated);
      showToast("Task updated.");
    } catch (err: any) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const postUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateText.trim() || !isAssignee) return;
    setPosting(true);
    try {
      const created = await api<TaskUpdate>(`/api/tasks/${id}/updates`, {
        method: "POST",
        body: JSON.stringify({ body: updateText.trim() }),
      });
      setUpdates((prev) => [created, ...prev]);
      setUpdateText("");
      showToast("Update posted.");
    } catch (err: any) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't post update.", "error");
    } finally {
      setPosting(false);
    }
  };

  const removeUpdate = async (entry: TaskUpdate) => {
    const ok = await confirm("Delete this update?", { title: "Delete update", danger: true, confirmLabel: "Delete" });
    if (!ok) return;
    try {
      await api(`/api/tasks/${id}/updates/${entry.id}`, { method: "DELETE" });
      setUpdates((prev) => prev.filter((u) => u.id !== entry.id));
    } catch {
      showToast("Couldn't delete update.", "error");
    }
  };

  const remove = async () => {
    if (!task) return;
    const ok = await confirm(`Are you sure you want to delete "${task.title}"? This cannot be undone.`, {
      title: "Delete Task",
      danger: true,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/tasks/${id}`, { method: "DELETE" });
      showToast("Task deleted.");
      router.push("/tasks");
    } catch (err: any) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't delete task.", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="muted">Loading…</p>;
  if (notFound || !task || !form) return <p className="muted">Task not found.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <BackLink href="/tasks" label="Back to Tasks" />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          {canEdit ? (
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm((f) => (f ? { ...f, title: e.target.value } : f))}
              aria-label="Task name"
              style={{
                fontSize: 22,
                fontWeight: 700,
                padding: "6px 10px",
                flex: 1,
                minWidth: 220,
                textDecoration: isTaskApproved(task.status) ? "line-through" : undefined,
                opacity: isTaskApproved(task.status) ? 0.75 : 1,
              }}
            />
          ) : (
            <h1
              style={{
                margin: 0,
                fontSize: 22,
                textDecoration: isTaskApproved(task.status) ? "line-through" : undefined,
                opacity: isTaskApproved(task.status) ? 0.75 : 1,
              }}
            >
              {task.title}
            </h1>
          )}
          <span className={`badge ${PRIORITY_BADGE[task.priority]}`}>{task.priority}</span>
          <span className={`badge ${STATUS_BADGE[task.status]}`}>{TASK_STATUS_LABEL[task.status] ?? task.status}</span>
        </div>
      </div>

      <div className="staff-edit-grid" style={twoCol}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card">
            <span className="card-title">Details</span>
            {canEdit ? (
              <>
                <label className="field-label" style={{ marginTop: 0 }}>Description</label>
                <textarea
                  className="input"
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm((f) => (f ? { ...f, description: e.target.value } : f))}
                  style={{ resize: "vertical" }}
                />
              </>
            ) : task.description ? (
              <p style={{ fontSize: 14, whiteSpace: "pre-line" }}>{task.description}</p>
            ) : (
              <p className="muted">No description.</p>
            )}
            <div style={fieldGrid}>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Client</label>
                {canEdit ? (
                  <Combobox
                    value={form.client_name}
                    onChange={(v) => setForm((f) => (f ? { ...f, client_name: v } : f))}
                    options={clientOptions}
                    placeholder="Select or type a client…"
                    ariaLabel="Client"
                  />
                ) : (
                  <div className="input" style={readonlyInput}>{task.client_name || "—"}</div>
                )}
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Assignees</label>
                {canEdit ? (
                  <MultiSelect
                    values={form.assignee_ids}
                    onChange={(v) => setForm((f) => (f ? { ...f, assignee_ids: v } : f))}
                    options={assigneeOptions}
                    placeholder="Select people…"
                    ariaLabel="Assignees"
                  />
                ) : (
                  <div className="input" style={readonlyInput}>{task.assignee_name || "—"}</div>
                )}
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Due date</label>
                {canEdit && !isTaskApproved(task.status) ? (
                  <DatePicker
                    value={form.due_date}
                    onChange={(v) =>
                      setForm((f) => (f ? { ...f, due_date: v, due_time: v ? f.due_time : "" } : f))
                    }
                    ariaLabel="Due date"
                  />
                ) : (
                  <div className="input" style={readonlyInput}>
                    {isTaskApproved(task.status) ? "—" : formatDue(task.due_date, task.due_time)}
                  </div>
                )}
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Due time</label>
                {canEdit && !isTaskApproved(task.status) ? (
                  <TimePicker
                    value={form.due_time}
                    onChange={(v) => setForm((f) => (f ? { ...f, due_time: v } : f))}
                    ariaLabel="Due time"
                    disabled={!form.due_date}
                  />
                ) : (
                  <div className="input" style={readonlyInput}>
                    {isTaskApproved(task.status) || !task.due_time
                      ? "—"
                      : formatDue(task.due_date, task.due_time).split(", ").slice(1).join(", ") || "—"}
                  </div>
                )}
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Created</label>
                <div className="input" style={readonlyInput}>{formatDateTime(task.created_at)}</div>
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Priority</label>
                {canEdit ? (
                  <Select
                    value={form.priority}
                    onChange={(v) => setForm((f) => (f ? { ...f, priority: v } : f))}
                    options={PRIORITY_OPTIONS}
                    ariaLabel="Priority"
                  />
                ) : (
                  <div className="input" style={readonlyInput}>{task.priority}</div>
                )}
              </div>
            </div>
            {canEdit && (
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="btn btn-accent" disabled={saving || !dirty} onClick={saveDetails}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
                {dirty && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={saving}
                    onClick={() => {
                      const next = formFromTask(task);
                      setForm(next);
                      formBaseline.current = JSON.stringify(next);
                    }}
                  >
                    Discard
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="card">
            <span className="card-title">Daily updates</span>
            {isAssignee ? (
              <form onSubmit={postUpdate} style={{ marginBottom: 16 }}>
                <textarea
                  className="input"
                  rows={3}
                  value={updateText}
                  onChange={(e) => setUpdateText(e.target.value)}
                  placeholder="What did you work on today?"
                  style={{ resize: "vertical" }}
                />
                <button className="btn btn-accent btn-sm" style={{ marginTop: 8 }} disabled={posting || !updateText.trim()}>
                  {posting ? "Posting…" : "Post update"}
                </button>
              </form>
            ) : (
              <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                Only people assigned to this task can add updates.
              </p>
            )}
            {updates.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No updates yet.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {updates.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    borderTop: "1px solid var(--border)",
                    paddingTop: 12,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                    <strong style={{ fontSize: 13 }}>{entry.author_name || "Unknown"}</strong>
                    <span className="muted" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 8 }}>
                      {formatDateTime(entry.created_at)}
                      {user?.id === entry.author && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ padding: "0 6px", color: "var(--danger)" }}
                          onClick={() => removeUpdate(entry)}
                          title="Delete update"
                        >
                          <i className="bi bi-trash" />
                        </button>
                      )}
                    </span>
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 14, whiteSpace: "pre-line" }}>{entry.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card">
            <span className="card-title">Status</span>
            {canEdit ? (
              <Select
                value={task.status}
                onChange={(v) => updateField({ status: v })}
                options={STATUS_OPTIONS}
                ariaLabel="Status"
              />
            ) : (
              <div className="input" style={readonlyInput}>{TASK_STATUS_LABEL[task.status] ?? task.status}</div>
            )}
            {isSynced && task.content_client_id && (
              <Link
                href={`/projects/clients/${task.content_client_id}/calendar?item=${task.content_item}`}
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 10 }}
              >
                <i className="bi bi-arrow-right" /> View in client calendar
              </Link>
            )}
            {task.client && !isSynced && (
              <Link
                href={`/projects/clients/${task.client}/calendar`}
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 10 }}
              >
                <i className="bi bi-arrow-right" /> View in client calendar
              </Link>
            )}
          </div>

          {isSynced ? (
            <div className="card">
              <span className="card-title">Delete</span>
              <p className="muted" style={{ fontSize: 12.5 }}>
                Delete this from the client calendar instead.
              </p>
            </div>
          ) : canEdit ? (
            <div className="card">
              <span className="card-title">Danger zone</span>
              <button
                className="btn btn-ghost"
                style={{ color: "var(--danger)" }}
                disabled={busy}
                onClick={remove}
              >
                <i className="bi bi-trash-fill" /> Delete task
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {ConfirmDialog}
    </div>
  );
}

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr",
  gap: 20,
  alignItems: "start",
};
const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
  marginTop: 14,
};
const readonlyInput: React.CSSProperties = {
  background: "var(--bg)",
  color: "var(--text)",
};
