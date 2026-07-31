"use client";

import { useEffect, useState } from "react";

import { Reveal } from "@/components/Reveal";
import { Select } from "@/components/Select";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

type BoardStatus = "todo" | "doing" | "done";
const ORDER: BoardStatus[] = ["todo", "doing", "done"];

type Task = {
  id: number;
  title: string;
  description: string;
  project_name: string;
  assignee_name: string;
  priority: string;
  due_date: string | null;
  board_status: BoardStatus;
  board_order: number;
  created_at: string;
};

type Column = { label: string; tasks: Task[] };
type Board = Record<BoardStatus, Column>;

const COLUMN_META: Record<BoardStatus, { dot: string }> = {
  todo: { dot: "var(--danger)" },
  doing: { dot: "#7C4FE0" },
  done: { dot: "var(--success)" },
};

const PRIORITY_BADGE: Record<string, string> = {
  low: "badge-muted",
  medium: "badge-warning",
  high: "badge-danger",
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const emptyNewTask = { title: "", priority: "medium" };

export default function KanbanPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [dragTaskId, setDragTaskId] = useState<number | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<BoardStatus | null>(null);
  const [addingColumn, setAddingColumn] = useState<BoardStatus | null>(null);
  const [newTask, setNewTask] = useState(emptyNewTask);
  const [creating, setCreating] = useState(false);

  const load = () => {
    api<Board>("/api/kanban/board")
      .then(setBoard)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openAddTask = (key: BoardStatus) => {
    setAddingColumn(key);
    setNewTask(emptyNewTask);
  };
  const cancelAddTask = () => {
    setAddingColumn(null);
    setNewTask(emptyNewTask);
  };

  const createTask = async (key: BoardStatus) => {
    if (!newTask.title.trim() || !user) return;
    setCreating(true);
    try {
      const created = await api<Task>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: newTask.title.trim(),
          assignee: user.id,
          priority: newTask.priority,
          board_status: key,
          board_order: board?.[key].tasks.length ?? 0,
        }),
      });
      setBoard((prev) => (prev ? { ...prev, [key]: { ...prev[key], tasks: [...prev[key].tasks, created] } } : prev));
      showToast("Task added.");
      cancelAddTask();
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't add task." : err.message, "error");
    } finally {
      setCreating(false);
    }
  };

  const moveTask = async (taskId: number, toStatus: BoardStatus) => {
    if (!board) return;
    let moved: Task | undefined;
    for (const key of ORDER) {
      const found = board[key].tasks.find((t) => t.id === taskId);
      if (found) {
        moved = found;
        break;
      }
    }
    if (!moved || moved.board_status === toStatus) return;
    const newOrder = board[toStatus].tasks.length;

    setBoard((prev) => {
      if (!prev) return prev;
      const next: Board = { ...prev };
      for (const key of ORDER) {
        next[key] = { ...next[key], tasks: next[key].tasks.filter((t) => t.id !== taskId) };
      }
      next[toStatus] = {
        ...next[toStatus],
        tasks: [...next[toStatus].tasks, { ...moved!, board_status: toStatus, board_order: newOrder }],
      };
      return next;
    });

    try {
      await api(`/api/kanban/tasks/${taskId}/move`, {
        method: "PATCH",
        body: JSON.stringify({ board_status: toStatus, board_order: newOrder }),
      });
    } catch {
      showToast("Couldn't move task.", "error");
      load();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22 }}>Kanban</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Drag tasks between columns to update their status.
        </p>
      </div>

      {loading && <p className="muted">Loading…</p>}

      {!loading && board && (
        <div style={boardRow}>
          {ORDER.map((key, colIndex) => {
            const col = board[key];
            const meta = COLUMN_META[key];
            const isOver = dragOverColumn === key;
            return (
              <Reveal key={key} index={colIndex}>
                <div
                  style={{ ...column, background: isOver ? "var(--gold-soft)" : "var(--bg)" }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverColumn(key);
                  }}
                  onDragLeave={() => setDragOverColumn((c) => (c === key ? null : c))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverColumn(null);
                    if (dragTaskId != null) moveTask(dragTaskId, key);
                  }}
                >
                  <div style={columnHeader}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ ...dot, background: meta.dot }} />
                      <span style={{ fontWeight: 700, fontSize: 13.5 }}>{col.label}</span>
                    </span>
                    <span className="badge badge-muted">{col.tasks.length}</span>
                  </div>

                  <div style={cardList}>
                    {col.tasks.length === 0 && (
                      <p className="muted" style={{ fontSize: 12.5, textAlign: "center", padding: "12px 0" }}>
                        No tasks here.
                      </p>
                    )}
                    {col.tasks.map((t) => (
                      <div
                        key={t.id}
                        className="card"
                        draggable
                        onDragStart={() => setDragTaskId(t.id)}
                        onDragEnd={() => setDragTaskId(null)}
                        style={taskCard}
                      >
                        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: t.description ? 6 : 0 }}>
                          {t.title}
                        </div>
                        {t.description && (
                          <p
                            className="muted"
                            style={{
                              fontSize: 12,
                              margin: "0 0 10px",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {t.description}
                          </p>
                        )}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span className="muted" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5 }}>
                            <i className="bi bi-calendar3" /> {timeAgo(t.created_at)}
                          </span>
                          <span className={`badge ${PRIORITY_BADGE[t.priority] ?? "badge-muted"}`}>{t.priority}</span>
                        </div>
                        {(t.project_name || t.assignee_name) && (
                          <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                            {t.project_name && <span>{t.project_name}</span>}
                            {t.project_name && t.assignee_name && " · "}
                            {t.assignee_name && <span>{t.assignee_name}</span>}
                          </div>
                        )}
                      </div>
                    ))}

                    {addingColumn === key ? (
                      <div className="card" style={{ padding: 14 }}>
                        <input
                          className="input"
                          placeholder="Task title"
                          autoFocus
                          value={newTask.title}
                          onChange={(e) => setNewTask((f) => ({ ...f, title: e.target.value }))}
                          style={{ marginBottom: 10 }}
                        />
                        <div style={{ marginBottom: 12 }}>
                          <Select
                            value={newTask.priority}
                            onChange={(v) => setNewTask((f) => ({ ...f, priority: v }))}
                            options={[
                              { value: "low", label: "Low priority" },
                              { value: "medium", label: "Medium priority" },
                              { value: "high", label: "High priority" },
                            ]}
                            ariaLabel="Priority"
                          />
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            className="btn btn-sm"
                            onClick={() => createTask(key)}
                            disabled={creating || !newTask.title.trim()}
                          >
                            {creating ? "Adding…" : "Add"}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={cancelAddTask}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button style={addTaskBtn} onClick={() => openAddTask(key)}>
                        <i className="bi bi-plus-lg" /> Add task
                      </button>
                    )}
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
}

const boardRow: React.CSSProperties = {
  display: "flex",
  gap: 16,
  alignItems: "flex-start",
  overflowX: "auto",
  paddingBottom: 8,
};
const column: React.CSSProperties = {
  width: 280,
  minWidth: 280,
  borderRadius: "var(--radius)",
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  transition: "background 0.15s ease",
};
const columnHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};
const dot: React.CSSProperties = {
  width: 9,
  height: 9,
  borderRadius: "50%",
};
const cardList: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  minHeight: 40,
};
const taskCard: React.CSSProperties = {
  cursor: "grab",
  padding: 14,
};
const addTaskBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "10px 0",
  borderRadius: 10,
  border: "1.5px dashed var(--border)",
  background: "none",
  color: "var(--text-muted)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};
