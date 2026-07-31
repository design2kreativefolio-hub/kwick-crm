"use client";

import { useCallback, useEffect, useState } from "react";

import { KpiCard, KpiTone } from "@/components/KpiCard";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Summary = {
  open_proposals: number;
  overdue_invoices: number;
  active_projects: number;
  open_tasks: number;
  upcoming_renewals: number;
  pending_approvals: number;
};

const TILES: { key: keyof Summary; label: string; icon: string; tone: KpiTone }[] = [
  { key: "open_proposals", label: "Open Proposals", icon: "bi-file-earmark-text-fill", tone: "blue" },
  { key: "overdue_invoices", label: "Overdue Invoices", icon: "bi-exclamation-triangle-fill", tone: "amber" },
  { key: "active_projects", label: "Active Projects", icon: "bi-folder-fill", tone: "purple" },
  { key: "open_tasks", label: "Open Tasks", icon: "bi-check-square-fill", tone: "mint" },
  { key: "upcoming_renewals", label: "Upcoming Renewals", icon: "bi-calendar-check-fill", tone: "amber" },
  { key: "pending_approvals", label: "Pending Approvals", icon: "bi-person-plus-fill", tone: "blue" },
];

export default function ReportsPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api<Summary>("/api/reports/summary")
      .then(setSummary)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user?.role === "manager") load();
  }, [user, load]);

  if (user && user.role !== "manager") {
    return <p className="muted">Manager access required.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Reports</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Cross-module summary for managers.
          </p>
        </div>
        <button className="btn btn-ghost" onClick={load} disabled={loading}>
          <i className="bi bi-arrow-clockwise" /> {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {loading && !summary && <p className="muted">Loading…</p>}

      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          {TILES.map((t) => (
            <KpiCard key={t.key} label={t.label} value={summary[t.key]} icon={t.icon} tone={t.tone} />
          ))}
        </div>
      )}
    </div>
  );
}
