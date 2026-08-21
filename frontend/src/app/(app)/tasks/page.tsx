"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { useConfirm } from "@/components/ConfirmDialog";
import { Combobox } from "@/components/Combobox";
import { DatePicker } from "@/components/DatePicker";
import { TimePicker } from "@/components/TimePicker";
import { Modal } from "@/components/Modal";
import { MultiSelect } from "@/components/MultiSelect";
import { Reveal } from "@/components/Reveal";
import { Select } from "@/components/Select";
import { api, ApiError, unwrapList } from "@/lib/api";
import { assigneeSelectOptions } from "@/lib/assigneeOptions";
import { useAuth } from "@/lib/auth";
import {
  STATUS_BADGE,
  TASK_STATUS_LABEL,
  TASK_STATUS_OPTIONS,
  isProjectTerminal,
  isTaskApproved,
} from "@/lib/statusBadges";
import { useToast } from "@/lib/toast";

type Task = {
  id: number;
  title: string;
  description: string;
  project: number | null;
  project_name: string;
  client_name: string;
  assignee: number | null;
  assignee_name: string;
  assignee_ids?: number[];
  assignee_names?: { id: number; name: string; former?: boolean }[];
  client?: number | null;
  content_item: number | null;
  content_client_id: number | null;
  mini_project_id?: number | null;
  status: string;
  from_todo?: boolean;
  priority: "low" | "medium" | "high";
  due_date: string | null;
  due_time: string | null;
  completed_at: string | null;
  created_at: string;
};

type ClientOption = { id: number; name: string };
type Contact = { id: number; full_name: string; email: string; role: string };
type DateMode = "pending" | "today" | "all" | "custom";

const STATUS_OPTIONS = TASK_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const DATE_MODE_OPTIONS = [
  { value: "pending", label: "Pending (default)" },
  { value: "today", label: "Due today" },
  { value: "all", label: "All tasks" },
  { value: "custom", label: "Custom dates" },
];

const PRIORITY_BADGE: Record<string, string> = {
  low: "badge-muted",
  medium: "badge-warning",
  high: "badge-danger",
};

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

const emptyForm = {
  title: "",
  description: "",
  client_name: "",
  assignee_ids: [] as string[],
  priority: "medium",
  status: "assigned",
  due_date: "",
  due_time: "",
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

export default function TasksPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const isSuperadmin = user?.role === "superadmin";

  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<"all" | "mine">("all");
  const [dateMode, setDateMode] = useState<DateMode>("pending");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const formBaseline = useRef("");

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    if (search.trim()) params.set("search", search.trim());
    if (tab === "mine") params.set("mine", "1");
    const qs = params.toString();
    api<Task[] | { results: Task[] }>(`/api/tasks${qs ? `?${qs}` : ""}`)
      .then((d) =>
        setTasks(unwrapList(d).filter((t) => !(t.from_todo && t.status === "completed"))),
      )
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [statusFilter, priorityFilter, search, tab, isSuperadmin]);

  const visibleTasks = useMemo(() => {
    const today = todayIso();
    let list = tasks.slice();

    if (dateMode === "pending") {
      list = list.filter((t) => !isProjectTerminal(t.status));
    } else if (dateMode === "today") {
      list = list.filter((t) => t.due_date === today);
    } else if (dateMode === "custom") {
      if (dueFrom) list = list.filter((t) => t.due_date && t.due_date >= dueFrom);
      if (dueTo) list = list.filter((t) => t.due_date && t.due_date <= dueTo);
    }

    list.sort((a, b) => {
      const ad = a.due_date || "9999-99-99";
      const bd = b.due_date || "9999-99-99";
      if (ad !== bd) return ad.localeCompare(bd);
      const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
      if (pr !== 0) return pr;
      return a.title.localeCompare(b.title);
    });
    return list;
  }, [tasks, dateMode, dueFrom, dueTo]);

  useEffect(() => {
    api<ClientOption[] | { results: ClientOption[] }>("/api/projects/clients")
      .then((d) => setClients(unwrapList(d)))
      .catch(() => {});
    api<Contact[]>("/api/messages/directory").then(setContacts).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreateForm = () => {
    setEditingTask(null);
    const next = {
      ...emptyForm,
      assignee_ids: user?.id ? [String(user.id)] : [],
    };
    setForm(next);
    formBaseline.current = JSON.stringify(next);
    setError(null);
    setShowForm(true);
  };

  const openEditForm = (task: Task) => {
    setEditingTask(task);
    const next = {
      title: task.title,
      description: task.description || "",
      client_name: task.client_name || "",
      assignee_ids: (task.assignee_ids?.length
        ? task.assignee_ids
        : task.assignee
          ? [task.assignee]
          : user?.id
            ? [user.id]
            : []
      ).map(String),
      priority: task.priority,
      status: task.status,
      due_date: task.due_date || "",
      due_time: task.due_time || "",
    };
    setForm(next);
    formBaseline.current = JSON.stringify(next);
    setError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    if (creating) return;
    setShowForm(false);
    setEditingTask(null);
    setForm(emptyForm);
    setError(null);
  };

  const formIsDirty = () => JSON.stringify(form) !== formBaseline.current;

  const persistTask = async () => {
    if (!form.title.trim()) {
      setError("Title is required.");
      return false;
    }
    setError(null);
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description,
        priority: form.priority,
        due_date: form.due_date || null,
        due_time: form.due_time || null,
        client_name: form.client_name.trim(),
      };
      if (editingTask) body.status = form.status;
      const assigneeIds = form.assignee_ids.map(Number).filter(Boolean);
      body.assignee_ids = assigneeIds.length ? assigneeIds : user?.id ? [user.id] : [];
      const matched = clients.find(
        (c) => c.name.toLowerCase() === form.client_name.trim().toLowerCase(),
      );
      body.client = matched ? matched.id : null;
      await api<Task>(editingTask ? `/api/tasks/${editingTask.id}` : "/api/tasks", {
        method: editingTask ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      const wasEditing = !!editingTask;
      setForm(emptyForm);
      setShowForm(false);
      setEditingTask(null);
      showToast(wasEditing ? "Task updated." : "Task created.");
      load();
      return true;
    } catch (err: any) {
      setError(err instanceof ApiError ? JSON.stringify(err.data) : err.message);
      return false;
    } finally {
      setCreating(false);
    }
  };

  const requestCloseForm = async () => {
    if (creating) return;
    if (!formIsDirty()) {
      closeForm();
      return;
    }
    const result = await confirm("Save your changes, or exit without saving?", {
      title: "Unsaved changes",
      confirmLabel: "Save",
      discardLabel: "Exit without saving",
      cancelLabel: "Keep editing",
    });
    if (result === true) await persistTask();
    else if (result === "discard") closeForm();
  };

  const saveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    await persistTask();
  };

  const changeStatus = async (task: Task, status: string) => {
    setBusyId(task.id);
    const hide = Boolean(task.from_todo && status === "completed");
    setTasks((prev) =>
      hide
        ? prev.filter((t) => t.id !== task.id)
        : prev.map((t) => (t.id === task.id ? { ...t, status: status as Task["status"] } : t)),
    );
    try {
      await api(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      showToast(hide ? "Marked complete — removed from Tasks." : "Task updated.");
      load();
    } catch {
      showToast("Couldn't update task.", "error");
      load();
    } finally {
      setBusyId(null);
    }
  };

  const deleteTask = async (task: Task) => {
    if (
      !(await confirm(`Are you sure you want to delete "${task.title}"? This cannot be undone.`, {
        title: "Delete Task",
        danger: true,
        confirmLabel: "Delete",
      }))
    )
      return;
    setBusyId(task.id);
    try {
      await api(`/api/tasks/${task.id}`, { method: "DELETE" });
      showToast("Task deleted.");
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch {
      showToast("Couldn't delete task.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const clientOptions = clients.map((c) => c.name);
  const assigneeOptions = assigneeSelectOptions(user, contacts);
  const showAssigneeColumn = true;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Reveal index={0}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Tasks</h1>
        </div>
        <button className="btn btn-accent" onClick={openCreateForm}>
          <i className="bi bi-plus-lg" /> Add Task
        </button>
      </div>
      </Reveal>

      <Reveal index={1}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className={tab === "all" ? "btn btn-accent btn-sm" : "btn btn-ghost btn-sm"}
            onClick={() => setTab("all")}
          >
            All Tasks
          </button>
          <button
            className={tab === "mine" ? "btn btn-accent btn-sm" : "btn btn-ghost btn-sm"}
            onClick={() => setTab("mine")}
          >
            My Tasks
          </button>
        </div>
      </Reveal>

      <Modal open={showForm} onClose={requestCloseForm} wide>
        <form onSubmit={saveTask}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="card-title" style={{ margin: 0 }}>{editingTask ? "Edit Task" : "New Task"}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={requestCloseForm} aria-label="Close">
              <i className="bi bi-x-lg" />
            </button>
          </div>
          <div className="kwick-form-wide" style={{ marginTop: 14 }}>
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
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                style={{ resize: "vertical" }}
              />
            </div>
            <div className={`kwick-form-wide__row ${editingTask ? "kwick-form-wide__row--4" : "kwick-form-wide__row--3"}`}>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Client</label>
                <Combobox
                  value={form.client_name}
                  onChange={(v) => setForm((f) => ({ ...f, client_name: v }))}
                  options={clientOptions}
                  placeholder="Select or type a client…"
                  ariaLabel="Client"
                />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Assign to</label>
                <MultiSelect
                  values={form.assignee_ids}
                  onChange={(v) => setForm((f) => ({ ...f, assignee_ids: v }))}
                  options={assigneeOptions}
                  placeholder="Select people…"
                  ariaLabel="Assign to"
                />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Priority</label>
                <Select
                  value={form.priority}
                  onChange={(v) => setForm((f) => ({ ...f, priority: v }))}
                  options={PRIORITY_OPTIONS}
                  ariaLabel="Priority"
                />
              </div>
              {editingTask && (
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Status</label>
                  <Select
                    value={form.status}
                    onChange={(v) => setForm((f) => ({ ...f, status: v }))}
                    options={STATUS_OPTIONS}
                    ariaLabel="Status"
                  />
                </div>
              )}
            </div>

            <div className="kwick-form-wide__row kwick-form-wide__row--2">
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Due date</label>
                <DatePicker
                  value={form.due_date}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      due_date: v,
                      due_time: v ? f.due_time : "",
                    }))
                  }
                  ariaLabel="Due date"
                />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Due time</label>
                <TimePicker
                  value={form.due_time}
                  onChange={(v) => setForm((f) => ({ ...f, due_time: v }))}
                  ariaLabel="Due time"
                  disabled={!form.due_date}
                />
              </div>
            </div>

            {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" disabled={creating}>
                {creating ? "Saving…" : editingTask ? "Save changes" : "Create task"}
              </button>
              <button type="button" className="btn btn-ghost" disabled={creating} onClick={requestCloseForm}>
                Cancel
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <Reveal index={2}>
      <div className="card">
        <span className="card-title">
          <i className="bi bi-list-task" style={{ color: "var(--gold)" }} />
          {tab === "mine" ? "My Tasks" : "All Tasks"}
        </span>

        <div style={{ ...fieldGrid, marginTop: 14, marginBottom: 6 }}>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Date</label>
            <Select
              value={dateMode}
              onChange={(v) => setDateMode(v as DateMode)}
              options={DATE_MODE_OPTIONS}
              ariaLabel="Filter by date"
            />
          </div>
          {dateMode === "custom" && (
            <>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>From</label>
                <DatePicker value={dueFrom} onChange={setDueFrom} ariaLabel="Due from" />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>To</label>
                <DatePicker value={dueTo} onChange={setDueTo} ariaLabel="Due to" />
              </div>
            </>
          )}
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Status</label>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              options={[{ value: "", label: "All statuses" }, ...STATUS_OPTIONS]}
              ariaLabel="Filter by status"
            />
          </div>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Priority</label>
            <Select
              value={priorityFilter}
              onChange={setPriorityFilter}
              options={[{ value: "", label: "All priorities" }, ...PRIORITY_OPTIONS]}
              ariaLabel="Filter by priority"
            />
          </div>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Search</label>
            <input
              className="input"
              placeholder="Search title or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading && <p className="muted">Loading…</p>}
        {!loading && visibleTasks.length === 0 && (
          <p className="muted">
            {dateMode === "pending"
              ? "No pending tasks."
              : dateMode === "today"
                ? "Nothing due today."
                : "No tasks match these filters."}
          </p>
        )}
        {!loading && visibleTasks.length > 0 && (
          <div className="table-wrap">
            <table className="kwick-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Client</th>
                  {showAssigneeColumn && <th>Assignee</th>}
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Due date</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleTasks.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link
                        href={
                          t.mini_project_id
                            ? `/projects/${t.mini_project_id}`
                            : t.content_item && t.content_client_id
                              ? `/projects/clients/${t.content_client_id}/calendar?item=${t.content_item}`
                              : `/tasks/${t.id}`
                        }
                        style={{
                          fontWeight: 600,
                          color: "var(--navy)",
                          textDecoration: isTaskApproved(t.status) ? "line-through" : undefined,
                          opacity: isTaskApproved(t.status) ? 0.7 : 1,
                        }}
                        title={
                          t.mini_project_id
                            ? "Open mini-project"
                            : t.content_item && t.content_client_id
                              ? "Open on client calendar"
                              : undefined
                        }
                      >
                        {t.title}
                      </Link>
                    </td>
                    <td>{t.client_name || "—"}</td>
                    {showAssigneeColumn && <td>{t.assignee_name || "—"}</td>}
                    <td>
                      <span className={`badge ${PRIORITY_BADGE[t.priority] ?? "badge-muted"}`}>{t.priority}</span>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[t.status] ?? "badge-muted"}`}>
                        {TASK_STATUS_LABEL[t.status] ?? t.status}
                      </span>
                    </td>
                    <td>{isTaskApproved(t.status) ? "—" : formatDue(t.due_date, t.due_time)}</td>
                    <td className="muted" style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>
                      {formatDateTime(t.created_at)}
                    </td>
                    <td>
                      {t.mini_project_id ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Link
                            href={`/projects/${t.mini_project_id}`}
                            className="muted"
                            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, whiteSpace: "nowrap" }}
                            title="Open mini-project"
                          >
                            <i className="bi bi-kanban-fill" style={{ color: "var(--gold)" }} />
                            Mini-project
                          </Link>
                          <div style={{ width: 150 }}>
                            <Select
                              value={t.status}
                              onChange={(v) => changeStatus(t, v)}
                              options={STATUS_OPTIONS}
                              compact
                              ariaLabel={`Change status for ${t.title}`}
                            />
                          </div>
                        </div>
                      ) : t.content_item ? (
                        t.content_client_id ? (
                          <Link
                            href={`/projects/clients/${t.content_client_id}/calendar?item=${t.content_item}`}
                            className="muted"
                            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}
                            title="Open client content calendar"
                          >
                            <i className="bi bi-calendar3-fill" style={{ color: "var(--gold)" }} />
                            {isSuperadmin ? t.assignee_name || "Calendar" : "From client calendar"}
                          </Link>
                        ) : (
                          <span
                            className="muted"
                            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}
                            title="From a client content calendar assignment — edit or remove it from that calendar."
                          >
                            <i className="bi bi-calendar3-fill" style={{ color: "var(--gold)" }} />
                            {isSuperadmin ? t.assignee_name || "—" : "From client calendar"}
                          </span>
                        )
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={busyId === t.id}
                            onClick={() => openEditForm(t)}
                            title={`Edit ${t.title}`}
                            aria-label={`Edit ${t.title}`}
                          >
                            <i className="bi bi-pencil-fill" />
                          </button>
                          <div style={{ width: 150 }}>
                            <Select
                              value={t.status}
                              onChange={(v) => changeStatus(t, v)}
                              options={STATUS_OPTIONS}
                              compact
                              ariaLabel={`Change status for ${t.title}`}
                            />
                          </div>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: "var(--danger)" }}
                            disabled={busyId === t.id}
                            onClick={() => deleteTask(t)}
                          >
                            <i className="bi bi-trash-fill" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </Reveal>
      {ConfirmDialog}
    </div>
  );
}

const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};
