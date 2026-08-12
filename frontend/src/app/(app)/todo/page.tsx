"use client";

import { useEffect, useMemo, useState } from "react";

import { Reveal } from "@/components/Reveal";
import { api, ApiError, unwrapList } from "@/lib/api";
import { useToast } from "@/lib/toast";

type TodoItem = {
  id: number;
  text: string;
  done: boolean;
  done_at: string | null;
  created_at: string;
};

type Filter = "all" | "open" | "done";

export default function TodoPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const load = () => {
    api<TodoItem[] | { results: TodoItem[] }>("/api/todos")
      .then((d) => setItems(unwrapList(d)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCount = useMemo(() => items.filter((t) => !t.done).length, [items]);
  const doneCount = items.length - openCount;
  const visible = useMemo(() => {
    if (filter === "open") return items.filter((t) => !t.done);
    if (filter === "done") return items.filter((t) => t.done);
    return items;
  }, [items, filter]);

  const addTodo = async () => {
    if (!newText.trim()) return;
    setAdding(true);
    try {
      const created = await api<TodoItem>("/api/todos", {
        method: "POST",
        body: JSON.stringify({ text: newText.trim() }),
      });
      setItems((prev) => [...prev, created]);
      setNewText("");
      showToast("Todo added.");
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't add todo." : err.message, "error");
    } finally {
      setAdding(false);
    }
  };

  const toggle = async (item: TodoItem) => {
    setItems((prev) => prev.map((t) => (t.id === item.id ? { ...t, done: !t.done } : t)));
    try {
      await api(`/api/todos/${item.id}`, { method: "PATCH", body: JSON.stringify({ done: !item.done }) });
    } catch {
      load();
    }
  };

  const markAll = async () => {
    const targets = items.filter((t) => !t.done);
    if (targets.length === 0) return;
    setItems((prev) => prev.map((t) => ({ ...t, done: true })));
    try {
      await Promise.all(
        targets.map((t) => api(`/api/todos/${t.id}`, { method: "PATCH", body: JSON.stringify({ done: true }) }))
      );
      showToast("All todos marked complete.");
    } catch {
      load();
    }
  };

  const startEdit = (item: TodoItem) => {
    setEditingId(item.id);
    setEditText(item.text);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const saveEdit = async (id: number) => {
    const text = editText.trim();
    if (!text) return;
    setEditingId(null);
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, text } : t)));
    try {
      await api(`/api/todos/${id}`, { method: "PATCH", body: JSON.stringify({ text }) });
      showToast("Todo updated.");
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't update todo." : err.message, "error");
      load();
    }
  };

  const remove = async (id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    try {
      await api(`/api/todos/${id}`, { method: "DELETE" });
      showToast("Todo deleted.");
    } catch {
      load();
    }
  };

  return (
    <Reveal index={0}>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={layout}>
          <div style={sidebar}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>To-Do</div>
            {(
              [
                { key: "all", label: "All", count: items.length },
                { key: "open", label: "Incompleted", count: openCount },
                { key: "done", label: "Completed", count: doneCount },
              ] as { key: Filter; label: string; count: number }[]
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{ ...filterRow, background: filter === f.key ? "var(--gold-soft)" : "transparent" }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 500, color: filter === f.key ? "var(--gold)" : "var(--text)" }}>
                  {f.label}
                </span>
                <span
                  className="badge"
                  style={{
                    background: f.key === "open" && f.count > 0 ? "var(--danger-soft)" : f.key === "done" ? "var(--success-soft)" : "var(--gold-soft)",
                    color: f.key === "open" && f.count > 0 ? "var(--danger)" : f.key === "done" ? "#219150" : "var(--gold)",
                  }}
                >
                  {f.count}
                </span>
              </button>
            ))}
          </div>

          <div style={main}>
            <div style={mainHeader}>
              <button
                onClick={markAll}
                disabled={items.length === 0 || openCount === 0}
                style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: items.length === 0 || openCount === 0 ? "default" : "pointer", padding: 0 }}
              >
                <span style={{ ...tickBtn, ...(items.length > 0 && openCount === 0 ? tickBtnDone : {}) }}>
                  <i className="bi bi-check-lg" />
                </span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Mark All</span>
              </button>
              <span className="badge badge-success">{openCount} Tasks left</span>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
              <input
                className="input"
                placeholder="Add todo"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTodo()}
              />
              <button className="btn" onClick={addTodo} disabled={adding || !newText.trim()}>
                Add Todo
              </button>
            </div>

            {loading && <p className="muted">Loading…</p>}
            {!loading && visible.length === 0 && <p className="muted">Nothing here.</p>}

            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {visible.map((t) => (
                <li key={t.id} style={todoRow}>
                  <button
                    className="icon-btn-anim"
                    style={{ ...tickBtn, ...(t.done ? tickBtnDone : {}) }}
                    onClick={() => toggle(t)}
                    aria-label={t.done ? "Mark incomplete" : "Mark complete"}
                    title={t.done ? "Mark incomplete" : "Mark complete"}
                  >
                    <i className="bi bi-check-lg" />
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingId === t.id ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          className="input"
                          autoFocus
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(t.id);
                            if (e.key === "Escape") cancelEdit();
                          }}
                        />
                        <button className="btn btn-sm" onClick={() => saveEdit(t.id)} disabled={!editText.trim()}>
                          <i className="bi bi-check-lg" />
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>
                          <i className="bi bi-x-lg" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <div style={{ fontSize: 14, textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--text-muted)" : "var(--text)" }}>
                            {t.text}
                          </div>
                          <span className={`badge ${t.done ? "badge-success" : "badge-info"}`}>
                            {t.done ? "Completed" : "To do"}
                          </span>
                        </div>
                        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                          {new Date(t.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                      </>
                    )}
                  </div>
                  {editingId !== t.id && (
                    <>
                      <button className="icon-btn-anim" style={rowIconBtn} onClick={() => startEdit(t)} aria-label="Edit">
                        <i className="bi bi-pencil-fill" style={{ fontSize: 12.5 }} />
                      </button>
                      <button className="icon-btn-anim" style={rowIconBtn} onClick={() => remove(t.id)} aria-label="Delete">
                        <i className="bi bi-trash-fill" style={{ fontSize: 12.5, color: "var(--danger)" }} />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

const layout: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "220px 1fr",
  minHeight: 480,
};
const sidebar: React.CSSProperties = {
  borderRight: "1px solid var(--border)",
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};
const filterRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "9px 10px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
};
const main: React.CSSProperties = {
  padding: 24,
};
const mainHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 18,
};
const todoRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  padding: "12px 0",
  borderBottom: "1px solid var(--border)",
};
const rowIconBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "var(--panel-muted)",
  border: "1px solid var(--border)",
  color: "var(--text-muted)",
};
const tickBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  minWidth: 26,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "var(--panel-muted)",
  color: "var(--text-muted)",
  border: "1.5px solid var(--text-muted)",
  fontSize: 14,
  marginTop: 2,
};
const tickBtnDone: React.CSSProperties = {
  background: "var(--success-soft)",
  color: "var(--success)",
  borderColor: "var(--success)",
};
