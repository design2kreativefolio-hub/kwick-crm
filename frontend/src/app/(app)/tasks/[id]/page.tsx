"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BackLink } from "@/components/BackLink";
import { useConfirm } from "@/components/ConfirmDialog";
import { Select } from "@/components/Select";
import { api, ApiError, formatApiError } from "@/lib/api";
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
  content_client_id?: number | null;
  status: "todo" | "in_progress" | "completed" | "published";
  from_todo?: boolean;
  priority: "low" | "medium" | "high";
  due_date: string | null;
  due_time: string | null;
  completed_at: string | null;
  created_at: string;
};

type ContentItem = { id: number; client: number };

const STATUS_OPTIONS = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "published", label: "Published" },
];

const TODO_STATUS_OPTIONS = [
  { value: "todo", label: "To do" },
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
  published: "Published",
};

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
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    setNotFound(false);
    api<Task>(`/api/tasks/${id}`)
      .then((t) => {
        // Calendar-synced tasks live on the client calendar — no separate overview page.
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
              setTask(t);
              setLoading(false);
            });
          return;
        }
        setTask(t);
        setLoading(false);
      })
      .catch(() => {
        setNotFound(true);
        setLoading(false);
      });
  };

  useEffect(load, [id, router]);

  const isSynced = !!task?.content_item;

  const updateField = async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      const updated = await api<Task>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      if (updated.from_todo && updated.status === "completed") {
        showToast("Marked complete — removed from Tasks.");
        router.push("/tasks");
        return;
      }
      setTask(updated);
      showToast("Task updated.");
    } catch (err: any) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : err.message, "error");
    } finally {
      setBusy(false);
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
  if (notFound || !task) return <p className="muted">Task not found.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <BackLink href="/tasks" label="Back to Tasks" />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              textDecoration: task.status === "published" ? "line-through" : undefined,
              opacity: task.status === "published" ? 0.75 : 1,
            }}
          >
            {task.title}
          </h1>
          <span className={`badge ${PRIORITY_BADGE[task.priority]}`}>{task.priority}</span>
          <span className={`badge ${STATUS_BADGE[task.status]}`}>{STATUS_LABEL[task.status]}</span>
        </div>
      </div>

      <div className="staff-edit-grid" style={twoCol}>
        <div className="card">
          <span className="card-title">Details</span>
          {task.description ? (
            <p style={{ fontSize: 14, whiteSpace: "pre-line" }}>{task.description}</p>
          ) : (
            <p className="muted">No description.</p>
          )}
          <div style={fieldGrid}>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Client</label>
              <div className="input" style={readonlyInput}>{task.client_name || "—"}</div>
            </div>
            {isSuperadmin && (
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Assignee</label>
                <div className="input" style={readonlyInput}>{task.assignee_name || "—"}</div>
              </div>
            )}
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Due date</label>
              <div className="input" style={readonlyInput}>
                {task.status === "published" ? "—" : formatDue(task.due_date, task.due_time)}
              </div>
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Created</label>
              <div className="input" style={readonlyInput}>{formatDateTime(task.created_at)}</div>
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Priority</label>
              {isSynced ? (
                <div className="input" style={readonlyInput}>{task.priority}</div>
              ) : (
                <Select
                  value={task.priority}
                  onChange={(v) => updateField({ priority: v })}
                  options={PRIORITY_OPTIONS}
                  ariaLabel="Priority"
                />
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card">
            <span className="card-title">Status</span>
            <Select
              value={task.status}
              onChange={(v) => updateField({ status: v })}
              options={task.from_todo ? TODO_STATUS_OPTIONS : STATUS_OPTIONS}
              ariaLabel="Status"
            />
            {isSynced && task.content_client_id && (
              <Link
                href={`/projects/clients/${task.content_client_id}/calendar?item=${task.content_item}`}
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
          ) : (
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
          )}
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
