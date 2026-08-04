"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { DonutCard, DonutSlice } from "@/components/DonutCard";
import { HeroBanner } from "@/components/HeroBanner";
import { KpiCard } from "@/components/KpiCard";
import { PerformanceChart } from "@/components/PerformanceChart";
import { Reveal } from "@/components/Reveal";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DEFAULT_SOURCE_META, NotificationEvent, SOURCE_META, timeAgo } from "@/lib/notifications";

type StatusCount = { status: string; label: string; count: number };

type Task = {
  id: number;
  title: string;
  assignee_name: string;
  status: string;
  priority: string;
  due_date: string | null;
};

const TASK_STATUS_BADGE: Record<string, string> = {
  todo: "badge-muted",
  in_progress: "badge-warning",
  completed: "badge-success",
};
const TASK_PRIORITY_BADGE: Record<string, string> = {
  low: "badge-muted",
  medium: "badge-warning",
  high: "badge-danger",
};

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

const STATUS_COLOR: Record<string, string> = {
  todo: "var(--chart-4)",
  in_progress: "var(--chart-2)",
  completed: "var(--chart-1)",
  ongoing: "var(--chart-2)",
  on_hold: "var(--chart-4)",
};

function toSlices(breakdown: StatusCount[] | undefined) {
  return (breakdown ?? [])
    .filter((b) => b.count > 0)
    .map((b) => ({ label: b.label, value: b.count, color: STATUS_COLOR[b.status] ?? "var(--chart-3)" }));
}

function trendPct(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

// Unread first, then most recent — surfaces what actually needs attention.
function sortNotifications(items: NotificationEvent[]) {
  return [...items].sort((a, b) => {
    const ua = a.read_at ? 1 : 0;
    const ub = b.read_at ? 1 : 0;
    if (ua !== ub) return ua - ub;
    // Top-priority, time-sensitive reminders — staff renewal nags and
    // project delivery dates — surface above everything else once unread
    // status is equal.
    const rank = (s: string) => (s === "staff_renewal" || s === "project" ? 0 : 1);
    const pa = rank(a.source);
    const pb = rank(b.source);
    if (pa !== pb) return pa - pb;
    return b.created_at.localeCompare(a.created_at);
  });
}

function relativeDate(iso: string) {
  const target = new Date(iso);
  const today = new Date();
  const days = Math.round((target.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days <= 7) return `In ${days}d`;
  return target.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isSuperadmin = user?.role === "superadmin";
  const [summary, setSummary] = useState<Summary | null>(null);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [sparkline, setSparkline] = useState<number[]>([]);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);

  const load = useCallback(() => {
    api<Summary>("/api/dashboard/summary").then(setSummary).catch(() => {});
    api<NotificationEvent[]>("/api/notifications")
      .then((items) => setNotifications(sortNotifications(items)))
      .catch(() => {});
    api<{ series: { completed: number }[] }>(
      `/api/dashboard/performance?granularity=daily&scope=${isSuperadmin ? "company" : "self"}`
    )
      .then((d) => setSparkline(d.series.slice(-14).map((p) => p.completed)))
      .catch(() => {});
    // Managers see every employee's tasks relevant to today (due today or
    // added today), not just "most recently created" — so they can tell
    // who's doing what today without opening each person's board.
    if (isSuperadmin) {
      api<Task[]>("/api/dashboard/today-tasks").then(setRecentTasks).catch(() => {});
    } else {
      api<{ results: Task[] } | Task[]>("/api/tasks?page_size=5")
        .then((d) => setRecentTasks(Array.isArray(d) ? d : d.results))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperadmin]);

  useEffect(load, [load]);

  const donutSlices: DonutSlice[] =
    isSuperadmin && summary?.project_status_breakdown
      ? toSlices(summary.project_status_breakdown)
      : toSlices(summary?.task_status_breakdown);

  const completed = isSuperadmin ? summary?.company_completed_this_month : summary?.completed_this_month;
  const completedPrev = isSuperadmin ? summary?.company_completed_last_month : summary?.completed_last_month;
  const completedTrend = summary ? trendPct(completed ?? 0, completedPrev ?? 0) : null;

  const invoicesTrend =
    isSuperadmin && summary
      ? trendPct(summary.invoices_this_month ?? 0, summary.invoices_last_month ?? 0)
      : null;

  const pendingNotifications = notifications.filter((n) => !n.read_at);

  return (
    <div className="dashboard-grid" style={{ display: "grid", gap: 22, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <Reveal index={0}>
          <div className="dashboard-hero-row" style={heroRow}>
            <HeroBanner
              compact
              name={user?.full_name?.split(" ")[0] || "there"}
              subtitle={
                isSuperadmin
                  ? "Stay updated with the company's performance today."
                  : "Stay updated with your workload today."
              }
              ctaLabel="View Full Report"
              ctaHref="/reports"
            />
            <KpiCard
              label="Pending Tasks"
              value={summary?.pending_tasks ?? "—"}
              icon="bi-card-checklist"
              tone="amber"
            />
            <KpiCard
              label="Completed This Month"
              value={completed ?? "—"}
              icon="bi-check-circle-fill"
              trend={completedTrend}
              tone="mint"
              sparkline={sparkline}
            />
            {isSuperadmin ? (
              <KpiCard
                label="Invoices This Month"
                value={summary?.invoices_this_month ?? "—"}
                icon="bi-receipt-cutoff"
                trend={invoicesTrend}
                tone="blue"
              />
            ) : (
              <KpiCard
                label="Ongoing Projects"
                value={summary?.ongoing_projects ?? "—"}
                icon="bi-kanban-fill"
                tone="purple"
              />
            )}
          </div>
        </Reveal>

        <Reveal index={1}>
          <div className="dashboard-charts-row" style={{ display: "grid", gap: 22 }}>
            <PerformanceChart
              canScopeCompany={isSuperadmin}
              headlineValue={completed ?? 0}
              previousValue={completedPrev ?? 0}
            />
            <DonutCard
              title={isSuperadmin ? "Projects by Status" : "My Tasks by Status"}
              slices={donutSlices.length ? donutSlices : [{ label: "No data yet", value: 1, color: "var(--border)" }]}
            />
          </div>
        </Reveal>

        <Reveal index={4}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="card-title" style={{ margin: 0 }}>{isSuperadmin ? "Today's Tasks" : "Recent Tasks"}</span>
              <a href="/tasks" className="muted" style={{ fontSize: 12.5, color: "var(--gold)", fontWeight: 600 }}>
                View All <i className="bi bi-arrow-right" />
              </a>
            </div>
            {recentTasks.length === 0 && (
              <p className="muted" style={{ marginTop: 16 }}>
                {isSuperadmin ? "Nothing due or added today." : "No tasks yet."}
              </p>
            )}
            {recentTasks.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="kwick-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      {isSuperadmin && <th>Assignee</th>}
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTasks.map((t) => (
                      <tr key={t.id}>
                        <td>{t.title}</td>
                        {isSuperadmin && <td>{t.assignee_name || "—"}</td>}
                        <td>
                          <span className={`badge ${TASK_PRIORITY_BADGE[t.priority] ?? "badge-muted"}`}>
                            {t.priority}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${TASK_STATUS_BADGE[t.status] ?? "badge-muted"}`}>
                            {t.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="muted">{t.due_date ? relativeDate(t.due_date) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Reveal>
      </div>

      {/* Reminders — always on the right, sticky. Ticking one off marks it read
          and drops it out of the docket; the badge tracks what's still pending. */}
      <Reveal index={0} style={{ position: "sticky", top: 24 }}>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span className="card-title" style={{ margin: 0, color: "var(--danger)" }}>
              <i className="bi bi-bell-fill" style={{ color: "var(--danger)" }} />
              Reminders
            </span>
            {pendingNotifications.length > 0 && (
              <span className="badge badge-danger">{pendingNotifications.length}</span>
            )}
          </div>
          {pendingNotifications.length === 0 && <p className="muted">Nothing needs attention right now.</p>}
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {pendingNotifications.slice(0, 8).map((n) => {
              const meta = SOURCE_META[n.source] ?? DEFAULT_SOURCE_META;
              return (
                <li
                  key={n.id}
                  style={{ ...reminderRow, cursor: meta.href ? "pointer" : "default" }}
                  onClick={() => {
                    if (meta.href) router.push(meta.href);
                  }}
                >
                  <span style={{ ...reminderIcon, background: meta.bg, color: meta.color }}>
                    <i className={`bi ${meta.icon}`} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{n.title}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {meta.label} · {timeAgo(n.created_at)}
                    </div>
                  </span>
                  <button
                    className="icon-btn-anim"
                    style={tickBtn}
                    title="Mark as read"
                    aria-label="Mark as read"
                    onClick={(e) => {
                      e.stopPropagation();
                      api(`/api/notifications/${n.id}/read`, { method: "POST" }).catch(() => {});
                      setNotifications((prev) =>
                        prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))
                      );
                    }}
                  >
                    <i className="bi bi-check-lg" />
                  </button>
                </li>
              );
            })}
          </ul>
          {pendingNotifications.length > 8 && (
            <a href="/reminders" className="muted" style={{ fontSize: 12.5, color: "var(--gold)", fontWeight: 600 }}>
              View all reminders <i className="bi bi-arrow-right" />
            </a>
          )}
        </div>
      </Reveal>
    </div>
  );
}

const heroRow: React.CSSProperties = {
  display: "grid",
  gap: 16,
  alignItems: "stretch",
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
  display: "grid",
  placeItems: "center",
  fontSize: 15,
};
const tickBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  minWidth: 28,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "var(--success-soft)",
  color: "var(--success)",
  border: "none",
  fontSize: 13,
};
