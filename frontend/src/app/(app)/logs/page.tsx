"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type LogEntry = {
  id: number;
  actor_name: string;
  action: string;
  created_at: string;
};

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function LogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== "superadmin") return;
    api<LogEntry[]>("/api/dashboard/logs")
      .then(setLogs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  if (user && user.role !== "superadmin") {
    return <p className="muted">Superadmin access required.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22 }}>Activity Logs</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Who added or edited tasks, clients, and projects — and when.
        </p>
      </div>

      <div className="card">
        <span className="card-title">
          <i className="bi bi-clock-history" style={{ color: "var(--gold)" }} />
          Recent Activity
        </span>
        {loading && <p className="muted">Loading…</p>}
        {!loading && logs.length === 0 && <p className="muted">No activity recorded yet.</p>}
        {!loading && logs.length > 0 && (
          <div className="table-wrap">
            <table className="kwick-table">
              <thead>
                <tr>
                  <th>Who</th>
                  <th>Action</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontWeight: 600, color: "var(--navy)" }}>{log.actor_name}</td>
                    <td className="muted">{log.action}</td>
                    <td className="muted">{formatTimestamp(log.created_at)}</td>
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
