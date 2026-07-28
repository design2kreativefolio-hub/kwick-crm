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

  const saveEdit = async (id: number) => {
    const text = editText.trim();
    setEditingId(null);
    if (!text) return;
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, text } : t)));
    try {
      await api(`/api/todos/${id}`, { method: "PATCH", body: JSON.stringify({ text }) });
    } catch {
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
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={items.length > 0 && openCount === 0} onChange={markAll} />
                <span style={{ fontSize: 13, fontWeight: 500 }}>Mark All</span>
              </label>
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
                  <input type="checkbox" checked={t.done} onChange={() => toggle(t)} style={{ marginTop: 3 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingId === t.id ? (
                      <input
                        className="input"
                        autoFocus
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onBlur={() => saveEdit(t.id)}
                        onKeyDown={(e) => e.key === "Enter" && saveEdit(t.id)}
                      />
                    ) : (
                      <>
                        <div style={{ fontSize: 14, textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--text-muted)" : "var(--text)" }}>
                          {t.text}
                        </div>
                        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                          {new Date(t.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                      </>
                    )}
                  </div>
                  <button className="icon-btn-anim" style={rowIconBtn} onClick={() => startEdit(t)} aria-label="Edit">
                    <i className="bi bi-pencil-fill" style={{ fontSize: 12.5 }} />
                  </button>
                  <button className="icon-btn-anim" style={rowIconBtn} onClick={() => remove(t.id)} aria-label="Delete">
                    <i className="bi bi-trash-fill" style={{ fontSize: 12.5, color: "var(--danger)" }} />
                  </button>
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
  background: "var(--bg)",
  border: "none",
};
