"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import { DEFAULT_SOURCE_META, NotificationEvent, SOURCE_META, timeAgo } from "@/lib/notifications";

type Filter = "all" | "unread";

export default function Page() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const load = () => {
    api<NotificationEvent[]>("/api/notifications")
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const unreadCount = useMemo(() => items.filter((n) => !n.read_at).length, [items]);
  const visible = useMemo(
    () => (filter === "unread" ? items.filter((n) => !n.read_at) : items),
    [items, filter]
  );

  const markRead = async (id: number) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    try {
      await api(`/api/notifications/${id}/read`, { method: "POST" });
    } catch {
      load();
    }
  };

  const markUnread = async (id: number) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: null } : n)));
    try {
      await api(`/api/notifications/${id}/unread`, { method: "POST" });
    } catch {
      load();
    }
  };

  const openReminder = (n: NotificationEvent) => {
    if (!n.read_at) markRead(n.id);
    const href = (SOURCE_META[n.source] ?? DEFAULT_SOURCE_META).href;
    if (href) router.push(href);
  };

  const markAllRead = async () => {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    try {
      await api("/api/notifications/read-all", { method: "POST" });
    } catch {
      load();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Reminders</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            {unreadCount > 0 ? `${unreadCount} unread reminder${unreadCount === 1 ? "" : "s"}` : "You're all caught up."}
          </p>
        </div>
        {unreadCount > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={markAllRead}>
            <i className="bi bi-check2-all" /> Mark all as read
          </button>
        )}
      </div>

      <div style={tabBar}>
        <button
          className={filter === "all" ? "btn btn-accent btn-sm" : "btn btn-ghost btn-sm"}
          onClick={() => setFilter("all")}
        >
          All
        </button>
        <button
          className={filter === "unread" ? "btn btn-accent btn-sm" : "btn btn-ghost btn-sm"}
          onClick={() => setFilter("unread")}
        >
          Unread {unreadCount > 0 && `(${unreadCount})`}
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading && <p className="muted" style={{ padding: 20, margin: 0 }}>Loading…</p>}
        {!loading && visible.length === 0 && (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <i className="bi bi-inbox-fill" style={{ fontSize: 30, color: "var(--text-muted)" }} />
            <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
              {filter === "unread" ? "No unread reminders." : "No reminders yet."}
            </p>
          </div>
        )}
        {!loading &&
          visible.map((n, i) => {
            const meta = SOURCE_META[n.source] ?? DEFAULT_SOURCE_META;
            const unread = !n.read_at;
            return (
              <div
                key={n.id}
                onClick={() => openReminder(n)}
                style={{
                  ...row,
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  background: unread ? "var(--gold-soft)" : "transparent",
                  cursor: meta.href ? "pointer" : "default",
                }}
              >
                <span style={{ ...iconWrap, background: meta.bg, color: meta.color }}>
                  <i className={`bi ${meta.icon}`} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: unread ? 700 : 600 }}>{n.title}</span>
                    {n.recurring && n.active && <span className="badge badge-warning">Pending action</span>}
                  </span>
                  {n.body && (
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                      {n.body}
                    </div>
                  )}
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                    {meta.label} · {timeAgo(n.created_at)}
                  </div>
                </span>
                {unread ? (
                  <button
                    className="icon-btn-anim"
                    style={markBtn}
                    title="Mark as read"
                    aria-label="Mark as read"
                    onClick={(e) => {
                      e.stopPropagation();
                      markRead(n.id);
                    }}
                  >
                    <i className="bi bi-check-circle-fill" style={{ color: "var(--success)", fontSize: 17 }} />
                  </button>
                ) : (
                  <button
                    className="icon-btn-anim"
                    style={markBtn}
                    title="Mark as unread"
                    aria-label="Mark as unread"
                    onClick={(e) => {
                      e.stopPropagation();
                      markUnread(n.id);
                    }}
                  >
                    <i className="bi bi-arrow-counterclockwise" style={{ color: "var(--text-muted)", fontSize: 16 }} />
                  </button>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

const tabBar: React.CSSProperties = {
  display: "flex",
  gap: 8,
};
const row: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 14,
  padding: "16px 20px",
};
const iconWrap: React.CSSProperties = {
  width: 38,
  height: 38,
  minWidth: 38,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  fontSize: 16,
};
const markBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  minWidth: 34,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "var(--bg)",
  border: "none",
};
