"use client";

import { useCallback, useEffect, useState } from "react";

import { DonutCard, DonutSlice } from "@/components/DonutCard";
import { HeroBanner } from "@/components/HeroBanner";
import { KpiCard } from "@/components/KpiCard";
import { PerformanceChart } from "@/components/PerformanceChart";
import { Reveal } from "@/components/Reveal";
import { Segment, SegmentedBar } from "@/components/SegmentedBar";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type StatusCount = { status: string; label: string; count: number };

type Summary = {
  pending_tasks: number;
  completed_this_month: number;
  completed_last_month: number;
  ongoing_projects: number;
  task_status_breakdown: StatusCount[];
  company_total_tasks?: number;
  company_completed_this_month?: number;
  company_completed_last_month?: number;
  total_invoices?: number;
  pending_invoices?: number;
  invoices_this_month?: number;
  invoices_last_month?: number;
  company_ongoing_projects?: number;
  company_task_status_breakdown?: StatusCount[];
  project_status_breakdown?: StatusCount[];
};

type Reminder = {
  source: string;
  title: string;
  date: string;
  meta?: { priority?: "low" | "medium" | "high"; status?: string };
};

const SOURCE_ICON: Record<string, string> = {
  task: "bi-check2-square",
  daily_tracker: "bi-journal-check",
  renewal: "bi-arrow-repeat", 
  manual: "bi-bell-fill",
};

const STATUS_COLOR: Record<string, string> = {
  todo: "var(--chart-4)",
  in_progress: "var(--chart-2)",
  completed: "var(--chart-1)",
  ongoing: "var(--chart-2)",
  on_hold: "var(--chart-4)",
};

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function toSlices(breakdown: StatusCount[] | undefined) {
  return (breakdown ?? [])
    .filter((b) => b.count > 0)
    .map((b) => ({ label: b.label, value: b.count, color: STATUS_COLOR[b.status] ?? "var(--chart-3)" }));
}

function trendPct(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

// Highest task priority first, then soonest due date — surfaces what actually
// needs attention rather than a flat chronological list.
function sortByPriority(items: Reminder[]) {
  return [...items].sort((a, b) => {
    const pa = a.meta?.priority ? PRIORITY_RANK[a.meta.priority] : 1.5;
    const pb = b.meta?.priority ? PRIORITY_RANK[b.meta.priority] : 1.5;
    if (pa !== pb) return pa - pb;
    return a.date.localeCompare(b.date);
  });
}

export default function DashboardPage() {
  const { user } = useAuth();
  const isManager = user?.role === "manager";
  const [summary, setSummary] = useState<Summary | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  const load = useCallback(() => {
    api<Summary>("/api/dashboard/summary").then(setSummary).catch(() => {});
    api<{ items: Reminder[] }>("/api/dashboard/reminders")
      .then((d) => setReminders(sortByPriority(d.items)))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  const taskBreakdown = isManager ? summary?.company_task_status_breakdown : summary?.task_status_breakdown;
  const donutSlices: DonutSlice[] =
    isManager && summary?.project_status_breakdown
      ? toSlices(summary.project_status_breakdown)
      : toSlices(summary?.task_status_breakdown);

  const completed = isManager ? summary?.company_completed_this_month : summary?.completed_this_month;
  const completedPrev = isManager ? summary?.company_completed_last_month : summary?.completed_last_month;
  const completedTrend = summary ? trendPct(completed ?? 0, completedPrev ?? 0) : null;

  const invoicesTrend =
    isManager && summary
      ? trendPct(summary.invoices_this_month ?? 0, summary.invoices_last_month ?? 0)
      : null;

  const keyInsightSegments: Segment[] = (taskBreakdown ?? [])
    .filter((b) => b.count > 0)
    .map((b) => ({ label: b.label, value: b.count, color: STATUS_COLOR[b.status] ?? "var(--chart-3)" }));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 22, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <Reveal index={1}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 22, alignItems: "stretch" }}>
            <HeroBanner
              name={user?.full_name?.split(" ")[0] || "there"}
              subtitle={
                isManager
                  ? "Stay updated with the company's performance today. Get a quick snapshot of key statistics."
                  : "Stay updated with your workload today. Get a quick snapshot of your tasks."
              }
              ctaLabel="View Full Report"
              ctaHref="/reports"
            />
            <SegmentedBar
              title="Key Insights"
              subtitle="Completed this month"
              headline={String(completed ?? 0)}
              trend={completedTrend}
              segments={
                keyInsightSegments.length
                  ? keyInsightSegments
                  : [{ label: "No tasks yet", value: 1, color: "var(--border)" }]
              }
            />
          </div>
        </Reveal>

        <Reveal index={2}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 22 }}>
            <PerformanceChart
              canScopeCompany={isManager}
              headlineValue={completed ?? 0}
              previousValue={completedPrev ?? 0}
            />
            <DonutCard
              title={isManager ? "Projects by Status" : "My Tasks by Status"}
              slices={donutSlices.length ? donutSlices : [{ label: "No data yet", value: 1, color: "var(--border)" }]}
            />
          </div>
        </Reveal>

        <Reveal index={3}>
          <div style={grid}>
            <KpiCard label="Pending Tasks" value={summary?.pending_tasks ?? "—"} icon="bi-card-checklist" tone={0} />
            <KpiCard
              label="Completed This Month"
              value={completed ?? "—"}
              icon="bi-check-circle-fill"
              trend={completedTrend}
              tone={1}
            />
            {isManager ? (
              <KpiCard
                label="Invoices This Month"
                value={summary?.invoices_this_month ?? "—"}
                icon="bi-receipt-cutoff"
                trend={invoicesTrend}
                tone={0}
              />
            ) : (
              <KpiCard label="Ongoing Projects" value={summary?.ongoing_projects ?? "—"} icon="bi-kanban-fill" tone={0} />
            )}
          </div>
        </Reveal>
      </div>

      {/* Reminders — always on the right, sticky, priority-sorted */}
      <Reveal index={0} style={{ position: "sticky", top: 24 }}>
        <div className="card">
          <span className="card-title">Reminders</span>
          {reminders.length === 0 && <p className="muted">Nothing upcoming.</p>}
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {reminders.slice(0, 10).map((r, i) => (
              <li key={i} style={reminderRow}>
                <span style={reminderIcon}>
                  <i className={`bi ${SOURCE_ICON[r.source] ?? "bi-dot"}`} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{r.title}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {new Date(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </div>
                </span>
                {r.meta?.priority && (
                  <span
                    className={`badge ${
                      r.meta.priority === "high"
                        ? "badge-danger"
                        : r.meta.priority === "medium"
                          ? "badge-warning"
                          : "badge-muted"
                    }`}
                  >
                    {r.meta.priority}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </div>
  );
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
  gap: 16,
};
const reminderRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "11px 0",
  borderBottom: "1px solid var(--border)",
};
const reminderIcon: React.CSSProperties = {
  width: 34,
  height: 34,
  minWidth: 34,
  borderRadius: "50%",
  background: "var(--bg)",
  display: "grid",
  placeItems: "center",
  color: "var(--navy)",
  fontSize: 15,
};
