"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useConfirm } from "@/components/ConfirmDialog";
import { Combobox } from "@/components/Combobox";
import { DatePicker } from "@/components/DatePicker";
import { Modal } from "@/components/Modal";
import { Reveal } from "@/components/Reveal";
import { Select } from "@/components/Select";
import { api, ApiError, unwrapList } from "@/lib/api";
import { assigneeSelectOptions } from "@/lib/assigneeOptions";
import { useAuth } from "@/lib/auth";
import { STATUS_BADGE } from "@/lib/statusBadges";
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
  content_item: number | null;
  content_client_id: number | null;
  status: "todo" | "in_progress" | "completed";
  priority: "low" | "medium" | "high";
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
};

type ClientOption = { id: number; name: string };
type Contact = { id: number; full_name: string; email: string; role: string };

const STATUS_OPTIONS = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];

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

const STATUS_LABEL: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  completed: "Completed",
};

const emptyForm = {
  title: "",
  description: "",
  client_name: "",
  assignee: "",
  priority: "medium",
  status: "todo",
  due_date: "",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
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
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    if (search.trim()) params.set("search", search.trim());
    if (isSuperadmin && tab === "mine" && user) params.set("assignee", String(user.id));
    const qs = params.toString();
    api<Task[] | { results: Task[] }>(`/api/tasks${qs ? `?${qs}` : ""}`)
      .then((d) => setTasks(unwrapList(d)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [statusFilter, priorityFilter, search, tab, isSuperadmin]);

  useEffect(() => {
    api<ClientOption[] | { results: ClientOption[] }>("/api/projects/clients")
      .then((d) => setClients(unwrapList(d)))
      .catch(() => {});
    if (isSuperadmin) {
      api<Contact[]>("/api/messages/directory").then(setContacts).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperadmin]);

  const openCreateForm = () => {
    setEditingTask(null);
    setForm({
      ...emptyForm,
      assignee: user?.id ? String(user.id) : "",
    });
    setError(null);
    setShowForm(true);
  };

  const openEditForm = (task: Task) => {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description || "",
      client_name: task.client_name || "",
      assignee: task.assignee ? String(task.assignee) : user?.id ? String(user.id) : "",
      priority: task.priority,
      status: task.status,
      due_date: task.due_date || "",
    });
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

  const saveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setError(null);
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description,
        priority: form.priority,
        due_date: form.due_date || null,
        client_name: form.client_name.trim(),
      };
      if (editingTask) body.status = form.status;
      const assigneeId = form.assignee || (user?.id ? String(user.id) : "");
      if (assigneeId) body.assignee = Number(assigneeId);
      else if (isSuperadmin) body.assignee = null;
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
    } catch (err: any) {
      setError(err instanceof ApiError ? JSON.stringify(err.data) : err.message);
    } finally {
      setCreating(false);
    }
  };

  const changeStatus = async (task: Task, status: string) => {
    setBusyId(task.id);
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: status as Task["status"] } : t)));
    try {
      await api(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      showToast("Task updated.");
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
  const showAssigneeColumn = isSuperadmin && tab === "all";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Reveal index={0}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Tasks</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            {isSuperadmin
              ? tab === "mine"
                ? "Your own tasks."
                : "All tasks across the team."
              : "Your assigned tasks."}
          </p>
        </div>
        <button className="btn btn-accent" onClick={openCreateForm}>
          <i className="bi bi-plus-lg" /> Add Task
        </button>
      </div>
      </Reveal>

      {isSuperadmin && (
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
      )}

      <Modal open={showForm} onClose={closeForm} wide>
        <form onSubmit={saveTask}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="card-title" style={{ margin: 0 }}>{editingTask ? "Edit Task" : "New Task"}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={closeForm} aria-label="Close">
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
            <div className={`kwick-form-wide__row ${isSuperadmin ? "kwick-form-wide__row--4" : "kwick-form-wide__row--3"}`}>
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
              {isSuperadmin && (
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Assign to</label>
                  <Select
                    value={form.assignee}
                    onChange={(v) => setForm((f) => ({ ...f, assignee: v }))}
                    options={assigneeOptions}
                    ariaLabel="Assign to"
                  />
                </div>
              )}
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
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Due date</label>
                <DatePicker
                  value={form.due_date}
                  onChange={(v) => setForm((f) => ({ ...f, due_date: v }))}
                  ariaLabel="Due date"
                />
              </div>
            </div>

            {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" disabled={creating}>
                {creating ? "Saving…" : editingTask ? "Save changes" : "Create task"}
              </button>
              <button type="button" className="btn btn-ghost" disabled={creating} onClick={closeForm}>
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
          {isSuperadmin && tab === "mine" ? "My Tasks" : "All Tasks"}
        </span>

        <div style={{ ...fieldGrid, marginTop: 14, marginBottom: 6 }}>
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
        {!loading && tasks.length === 0 && <p className="muted">No tasks yet.</p>}
        {!loading && tasks.length > 0 && (
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link
                        href={
                          t.content_item && t.content_client_id
                            ? `/projects/clients/${t.content_client_id}/calendar?item=${t.content_item}`
                            : `/tasks/${t.id}`
                        }
                        style={{ fontWeight: 600, color: "var(--navy)" }}
                        title={
                          t.content_item && t.content_client_id
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
                        {STATUS_LABEL[t.status] ?? t.status}
                      </span>
                    </td>
                    <td>{formatDate(t.due_date)}</td>
                    <td>
                      {t.content_item ? (
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
