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
import { useToast } from "@/lib/toast";
import { DEFAULT_SOURCE_META, SOURCE_META, timeAgo } from "@/lib/notifications";
import { STATUS_BADGE, STATUS_COLOR as SHARED_STATUS_COLOR, isTaskApproved } from "@/lib/statusBadges";

type StatusCount = { status: string; label: string; count: number };

type Task = {
  id: number;
  title: string;
  assignee_name: string;
  status: string;
  priority: string;
  due_date: string | null;
  due_time?: string | null;
};

type PendingApprovalUser = {
  id: number;
  full_name: string;
  email: string;
  created_at: string;
};

type DashboardCardItem = {
  kind: "notification" | "reminder" | "todo";
  id: number;
  title: string;
  body: string;
  source: string;
  href: string;
  at: string;
  created_at: string;
  read_at?: string | null;
};

const TASK_STATUS_BADGE = STATUS_BADGE;
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
  pending_approvals?: number;
  pending_approval_users?: PendingApprovalUser[];
};

const STATUS_COLOR: Record<string, string> = {
  ...SHARED_STATUS_COLOR,
  ongoing: SHARED_STATUS_COLOR.in_progress,
  on_hold: SHARED_STATUS_COLOR.waiting_approval,
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

function formatTaskDue(date: string, time?: string | null) {
  const base = relativeDate(date);
  if (!time) return base;
  const [hh, mm] = time.split(":");
  const t = new Date();
  t.setHours(Number(hh), Number(mm), 0, 0);
  return `${base}, ${t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function cardMeta(item: DashboardCardItem) {
  if (item.kind === "todo") return SOURCE_META.todo ?? DEFAULT_SOURCE_META;
  if (item.kind === "reminder") return SOURCE_META.calendar ?? DEFAULT_SOURCE_META;
  return SOURCE_META[item.source] ?? DEFAULT_SOURCE_META;
}

function cardSubtitle(item: DashboardCardItem) {
  const meta = cardMeta(item);
  if (item.kind === "todo") {
    return item.body || meta.label;
  }
  if (item.kind === "reminder") {
    try {
      return `${meta.label} · ${relativeDate(item.at)}`;
    } catch {
      return meta.label;
    }
  }
  return `${meta.label} · ${timeAgo(item.created_at)}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const isSuperadmin = user?.role === "superadmin";
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cardItems, setCardItems] = useState<DashboardCardItem[]>([]);
  const [sparkline, setSparkline] = useState<number[]>([]);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [recentTab, setRecentTab] = useState<"all" | "mine">("mine");
  const [approvalBusyId, setApprovalBusyId] = useState<number | null>(null);

  const loadRecentTasks = useCallback(() => {
    const params = new URLSearchParams({ page_size: "5" });
    if (recentTab === "mine") params.set("mine", "1");
    api<{ results: Task[] } | Task[]>(`/api/tasks?${params}`)
      .then((d) => setRecentTasks(Array.isArray(d) ? d : d.results))
      .catch(() => setRecentTasks([]));
  }, [recentTab]);

  const load = useCallback(() => {
    api<Summary>("/api/dashboard/summary").then(setSummary).catch(() => {});
    api<{ items: DashboardCardItem[] }>("/api/dashboard/reminders")
      .then((d) => setCardItems(d.items || []))
      .catch(() => {});
    api<{ series: { completed: number }[] }>(
      `/api/dashboard/performance?granularity=daily&scope=${isSuperadmin ? "company" : "self"}`
    )
      .then((d) => setSparkline(d.series.slice(-14).map((p) => p.completed)))
      .catch(() => {});
    loadRecentTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperadmin, loadRecentTasks]);

  useEffect(load, [load]);

  const dismissCardItem = (item: DashboardCardItem) => {
    setCardItems((prev) => prev.filter((x) => !(x.kind === item.kind && x.id === item.id)));
    api("/api/dashboard/reminders/dismiss", {
      method: "POST",
      body: JSON.stringify({ kind: item.kind, id: item.id }),
    }).catch(() => load());
  };

  const restoreCardItems = () => {
    api<{ items: DashboardCardItem[] }>("/api/dashboard/reminders/restore", { method: "POST" })
      .then((d) => setCardItems(d.items || []))
      .catch(() => load());
  };
  const decideApproval = async (id: number, action: "approve" | "reject") => {
    setApprovalBusyId(id);
    try {
      await api(`/api/auth/${action}/${id}`, { method: "POST" });
      showToast(action === "approve" ? "Account approved." : "Registration rejected.");
      load();
    } catch {
      showToast(action === "approve" ? "Couldn't approve account." : "Couldn't reject registration.", "error");
    } finally {
      setApprovalBusyId(null);
    }
  };

  const donutSlices: DonutSlice[] =
    isSuperadmin && summary?.project_status_breakdown
      ? toSlices(summary.project_status_breakdown)
      : toSlices(summary?.task_status_breakdown);

  const completed = isSuperadmin ? summary?.company_completed_this_month : summary?.completed_this_month;
  const completedPrev = isSuperadmin ? summary?.company_completed_last_month : summary?.completed_last_month;
  const completedTrend = summary ? trendPct(completed ?? 0, completedPrev ?? 0) : null;

  return (
    <div className="dashboard-grid fit-mobile" style={{ display: "grid", gap: 22, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <Reveal index={0}>
          <div className="dashboard-hero-row fit-mobile" style={heroRow}>
            <HeroBanner
              compact
              name={user?.full_name?.split(" ")[0] || "there"}
              subtitle={
                isSuperadmin
                  ? "Stay updated with the company's performance today."
                  : "Stay updated with your workload today."
              }
              ctaLabel={isSuperadmin ? "View Full Report" : "Check With Edith"}
              ctaHref={
                isSuperadmin
                  ? "/reports"
                  : "/ai?ask=" + encodeURIComponent("What are my pending tasks?")
              }
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
                label="Pending Approvals"
                value={summary?.pending_approvals ?? "—"}
                icon="bi-person-plus-fill"
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

        {isSuperadmin && (summary?.pending_approval_users?.length ?? 0) > 0 && (
          <Reveal index={1}>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="card-title" style={{ margin: 0 }}>Awaiting approval</span>
                <a href="/hr/staff" className="muted" style={{ fontSize: 12.5, color: "var(--gold)", fontWeight: 600 }}>
                  Open staff <i className="bi bi-arrow-right" />
                </a>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
                {(summary?.pending_approval_users ?? []).map((u) => (
                  <li key={u.id} style={approvalRow}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{u.full_name || "—"}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{u.email}</div>
                    </span>
                    <button
                      className="btn btn-sm"
                      disabled={approvalBusyId === u.id}
                      onClick={() => decideApproval(u.id, "approve")}
                    >
                      {approvalBusyId === u.id ? "…" : "Approve"}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: "var(--danger)" }}
                      disabled={approvalBusyId === u.id}
                      onClick={() => decideApproval(u.id, "reject")}
                    >
                      Reject
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        )}

        <Reveal index={2}>
          <div className="dashboard-charts-row fit-mobile" style={{ display: "grid", gap: 22 }}>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <span className="card-title" style={{ margin: 0 }}>Recent Tasks</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className={recentTab === "all" ? "btn btn-accent btn-sm" : "btn btn-ghost btn-sm"}
                    onClick={() => setRecentTab("all")}
                  >
                    All Tasks
                  </button>
                  <button
                    type="button"
                    className={recentTab === "mine" ? "btn btn-accent btn-sm" : "btn btn-ghost btn-sm"}
                    onClick={() => setRecentTab("mine")}
                  >
                    My Tasks
                  </button>
                </div>
                <a href="/tasks" className="muted" style={{ fontSize: 12.5, color: "var(--gold)", fontWeight: 600 }}>
                  View All <i className="bi bi-arrow-right" />
                </a>
              </div>
            </div>
            {recentTasks.length === 0 && (
              <p className="muted" style={{ marginTop: 16 }}>
                {recentTab === "mine" ? "No tasks assigned to you yet." : "No tasks yet."}
              </p>
            )}
            {recentTasks.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="kwick-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      {recentTab === "all" && isSuperadmin && <th>Assignee</th>}
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTasks.map((t) => (
                      <tr key={t.id}>
                        <td
                          style={{
                            textDecoration: isTaskApproved(t.status) ? "line-through" : undefined,
                            opacity: isTaskApproved(t.status) ? 0.7 : 1,
                            cursor: "pointer",
                          }}
                          onClick={() => router.push(`/tasks/${t.id}`)}
                        >
                          {t.title}
                        </td>
                        {recentTab === "all" && isSuperadmin && <td>{t.assignee_name || "—"}</td>}
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
                        <td className="muted">
                          {isTaskApproved(t.status) || !t.due_date ? "—" : formatTaskDue(t.due_date, t.due_time)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Reveal>
      </div>

      {/* Reminders card — calendar reminders + to-dos + notifications.
          Tick only dismisses from this card (not mark done / not mark read). */}
      <Reveal index={0} style={{ position: "sticky", top: 24 }}>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span className="card-title" style={{ margin: 0, color: "var(--danger)" }}>
              <i className="bi bi-bell-fill" style={{ color: "var(--danger)" }} />
              Reminders
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                className="icon-btn-anim"
                style={tickBtn}
                title="Show pending items again"
                aria-label="Show pending items again"
                onClick={restoreCardItems}
              >
                <i className="bi bi-arrow-clockwise" />
              </button>
              {cardItems.length > 0 && (
                <span className="badge badge-danger">{cardItems.length}</span>
              )}
            </span>
          </div>
          {cardItems.length === 0 && <p className="muted">Nothing needs attention right now.</p>}
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {cardItems.slice(0, 8).map((item) => {
              const meta = cardMeta(item);
              const href = item.href || meta.href;
              return (
                <li
                  key={`${item.kind}-${item.id}`}
                  style={{ ...reminderRow, cursor: href ? "pointer" : "default" }}
                  onClick={() => {
                    if (href) router.push(href);
                  }}
                >
                  <span style={{ ...reminderIcon, background: meta.bg, color: meta.color }}>
                    <i className={`bi ${meta.icon}`} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{item.title}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {cardSubtitle(item)}
                    </div>
                  </span>
                  <button
                    className="icon-btn-anim"
                    style={tickBtn}
                    title="Dismiss from card"
                    aria-label="Dismiss from card"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissCardItem(item);
                    }}
                  >
                    <i className="bi bi-check-lg" />
                  </button>
                </li>
              );
            })}
          </ul>
          {cardItems.length > 8 && (
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
  width: "100%",
  minWidth: 0,
};
const approvalRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 0",
  borderBottom: "1px solid var(--border)",
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
