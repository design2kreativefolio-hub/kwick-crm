"use client";

import { useEffect, useState } from "react";

import { DatePicker } from "@/components/DatePicker";
import { Select } from "@/components/Select";
import { api, ApiError, unwrapList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

type Task = {
  id: number;
  title: string;
  description: string;
  project: number | null;
  project_name: string;
  assignee: number | null;
  assignee_name: string;
  status: "todo" | "in_progress" | "completed";
  priority: "low" | "medium" | "high";
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
};

type Project = { id: number; name: string };
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

const STATUS_BADGE: Record<string, string> = {
  todo: "badge-muted",
  in_progress: "badge-warning",
  completed: "badge-success",
};

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
  project: "",
  assignee: "",
  priority: "medium",
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
  const isManager = user?.role === "manager";

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
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
    const qs = params.toString();
    api<Task[] | { results: Task[] }>(`/api/tasks${qs ? `?${qs}` : ""}`)
      .then((d) => setTasks(unwrapList(d)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [statusFilter, priorityFilter, search]);

  useEffect(() => {
    api<Project[] | { results: Project[] }>("/api/projects")
      .then((d) => setProjects(unwrapList(d)))
      .catch(() => {});
    if (isManager) {
      api<Contact[]>("/api/messages/directory").then(setContacts).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager]);

  const addTask = async (e: React.FormEvent) => {
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
        project: form.project ? Number(form.project) : null,
      };
      if (isManager && form.assignee) body.assignee = Number(form.assignee);
      await api<Task>("/api/tasks", { method: "POST", body: JSON.stringify(body) });
      setForm(emptyForm);
      setShowForm(false);
      showToast("Task created.");
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
    if (!confirm(`Delete "${task.title}"?`)) return;
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

  const projectOptions = [{ value: "", label: "No project" }, ...projects.map((p) => ({ value: String(p.id), label: p.name }))];
  const assigneeOptions = contacts.map((c) => ({ value: String(c.id), label: c.full_name || c.email }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Tasks</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            {isManager
              ? "All tasks across the team."
              : "Your assigned tasks."}
          </p>
        </div>
        <button className="btn btn-accent" onClick={() => setShowForm((v) => !v)}>
          <i className="bi bi-plus-lg" /> Add Task
        </button>
      </div>

      {showForm && (
        <form className="card" onSubmit={addTask}>
          <span className="card-title">New Task</span>
          <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Title</label>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Description</label>
              <textarea
                className="input"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                style={{ resize: "vertical" }}
              />
            </div>
            <div style={fieldGrid}>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Project</label>
                <Select
                  value={form.project}
                  onChange={(v) => setForm((f) => ({ ...f, project: v }))}
                  options={projectOptions}
                  ariaLabel="Project"
                />
              </div>
              {isManager && (
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Assignee</label>
                  <Select
                    value={form.assignee}
                    onChange={(v) => setForm((f) => ({ ...f, assignee: v }))}
                    options={[{ value: "", label: "Unassigned" }, ...assigneeOptions]}
                    ariaLabel="Assignee"
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
            <button className="btn" style={{ width: "fit-content" }} disabled={creating}>
              {creating ? "Creating…" : "Create task"}
            </button>
          </div>
        </form>
      )}

      <div className="card">
        <span className="card-title">
          <i className="bi bi-list-task" style={{ color: "var(--gold)" }} />
          All Tasks
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
                  <th>Project</th>
                  {isManager && <th>Assignee</th>}
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Due date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600, color: "var(--navy)" }}>{t.title}</td>
                    <td>{t.project_name || "—"}</td>
                    {isManager && <td>{t.assignee_name || "—"}</td>}
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
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};
