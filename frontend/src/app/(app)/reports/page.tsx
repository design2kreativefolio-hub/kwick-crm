"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { DatePicker } from "@/components/DatePicker";
import { KpiCard, KpiTone } from "@/components/KpiCard";
import { Reveal } from "@/components/Reveal";
import { Select } from "@/components/Select";
import { api, formatApiError } from "@/lib/api";
import { openUploadedFile } from "@/lib/files";
import { useAuth, hasModuleAccess } from "@/lib/auth";
import { useToast } from "@/lib/toast";

type Summary = {
  open_proposals: number;
  overdue_invoices: number;
  active_projects: number;
  open_tasks: number;
  upcoming_renewals: number;
  pending_approvals: number;
};

type EmployeeOpt = { id: number; name: string; email: string; role: string };
type ClientOpt = { id: number; name: string; client_id: string; company: string };

type ReportPayload = {
  type: "employee" | "client";
  subject: Record<string, any>;
  date_from: string;
  date_to: string;
  summary: Record<string, any>;
  tasks_completed?: any[];
  tasks_open?: any[];
  projects?: any[];
  daily_tracker?: any[];
  leave?: any[];
  content_calendar?: any[];
  tasks?: any[];
  renewals?: any[];
  invoices?: any[];
};

const TILES: { key: keyof Summary; label: string; icon: string; tone: KpiTone }[] = [
  { key: "open_proposals", label: "Open Proposals", icon: "bi-file-earmark-text-fill", tone: "blue" },
  { key: "overdue_invoices", label: "Overdue Invoices", icon: "bi-exclamation-triangle-fill", tone: "amber" },
  { key: "active_projects", label: "Active Projects", icon: "bi-folder-fill", tone: "purple" },
  { key: "open_tasks", label: "Open Tasks", icon: "bi-check-square-fill", tone: "mint" },
  { key: "upcoming_renewals", label: "Upcoming Renewals", icon: "bi-calendar-check-fill", tone: "amber" },
  { key: "pending_approvals", label: "Pending Approvals", icon: "bi-person-plus-fill", tone: "blue" },
];

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function presetRange(kind: "month" | "6m" | "year"): { from: string; to: string } {
  const today = new Date();
  if (kind === "month") {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    const to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { from: toIso(from), to: toIso(to) };
  }
  if (kind === "6m") {
    const from = new Date(today.getFullYear(), today.getMonth() - 5, 1);
    return { from: toIso(from), to: toIso(today) };
  }
  return {
    from: toIso(new Date(today.getFullYear(), 0, 1)),
    to: toIso(new Date(today.getFullYear(), 11, 31)),
  };
}

export default function ReportsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [employees, setEmployees] = useState<EmployeeOpt[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [reportType, setReportType] = useState<"employee" | "client">("employee");
  const [subjectId, setSubjectId] = useState("");
  const [dateFrom, setDateFrom] = useState(() => presetRange("month").from);
  const [dateTo, setDateTo] = useState(() => presetRange("month").to);

  const [report, setReport] = useState<ReportPayload | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const hasAccess = user?.role === "superadmin" || hasModuleAccess(user?.module_access, "reports");

  const loadMeta = useCallback(() => {
    setLoadingMeta(true);
    Promise.all([
      api<Summary>("/api/reports/summary"),
      api<{ employees: EmployeeOpt[]; clients: ClientOpt[] }>("/api/reports/options"),
    ])
      .then(([sum, opts]) => {
        setSummary(sum);
        setEmployees(opts.employees || []);
        setClients(opts.clients || []);
      })
      .catch(() => {})
      .finally(() => setLoadingMeta(false));
  }, []);

  useEffect(() => {
    if (hasAccess) loadMeta();
  }, [hasAccess, loadMeta]);

  const subjectOptions = useMemo(() => {
    if (reportType === "employee") {
      return employees.map((e) => ({
        value: String(e.id),
        label: e.name + (e.email ? ` · ${e.email}` : ""),
      }));
    }
    return clients.map((c) => ({
      value: String(c.id),
      label: c.name + (c.client_id ? ` · ${c.client_id}` : ""),
    }));
  }, [reportType, employees, clients]);

  const applyPreset = (kind: "month" | "6m" | "year") => {
    const r = presetRange(kind);
    setDateFrom(r.from);
    setDateTo(r.to);
  };

  const generate = async () => {
    if (!subjectId) {
      showToast("Select an employee or client first.", "error");
      return;
    }
    if (!dateFrom || !dateTo) {
      showToast("Choose a date range.", "error");
      return;
    }
    setGenerating(true);
    setReport(null);
    try {
      const data = await api<ReportPayload>("/api/reports/generate", {
        method: "POST",
        body: JSON.stringify({
          type: reportType,
          subject_id: Number(subjectId),
          date_from: dateFrom,
          date_to: dateTo,
        }),
      });
      setReport(data);
    } catch (err: any) {
      showToast(formatApiError(err?.data) || err.message || "Could not generate report.", "error");
    } finally {
      setGenerating(false);
    }
  };

  const downloadPdf = async () => {
    if (!subjectId || !dateFrom || !dateTo) return;
    setPdfBusy(true);
    try {
      const res = await api<{ file_url: string }>("/api/reports/pdf", {
        method: "POST",
        body: JSON.stringify({
          type: reportType,
          subject_id: Number(subjectId),
          date_from: dateFrom,
          date_to: dateTo,
        }),
      });
      if (res.file_url) void openUploadedFile(res.file_url);
      else showToast("PDF URL missing.", "error");
    } catch (err: any) {
      showToast(formatApiError(err?.data) || err.message || "PDF failed.", "error");
    } finally {
      setPdfBusy(false);
    }
  };

  if (user && !hasAccess) {
    return <p className="muted">You don&apos;t have access to Reports.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Reveal index={0}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>Reports</h1>
          </div>
          <button className="btn btn-ghost" onClick={loadMeta} disabled={loadingMeta}>
            <i className="bi bi-arrow-clockwise" /> {loadingMeta ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </Reveal>

      {summary && (
        <Reveal index={1}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            {TILES.map((t) => (
              <KpiCard key={t.key} label={t.label} value={summary[t.key]} icon={t.icon} tone={t.tone} />
            ))}
          </div>
        </Reveal>
      )}

      <Reveal index={2}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Build a report</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Report type</label>
              <Select
                value={reportType}
                onChange={(v) => {
                  setReportType(v as "employee" | "client");
                  setSubjectId("");
                  setReport(null);
                }}
                options={[
                  { value: "employee", label: "Employee activity" },
                  { value: "client", label: "Client work & renewals" },
                ]}
                ariaLabel="Report type"
              />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>
                {reportType === "employee" ? "Employee" : "Client"}
              </label>
              <Select
                value={subjectId}
                onChange={(v) => {
                  setSubjectId(v);
                  setReport(null);
                }}
                options={[
                  { value: "", label: reportType === "employee" ? "Select employee…" : "Select client…" },
                  ...subjectOptions,
                ]}
                ariaLabel="Subject"
              />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>From</label>
              <DatePicker value={dateFrom} onChange={setDateFrom} ariaLabel="From date" />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>To</label>
              <DatePicker value={dateTo} onChange={setDateTo} min={dateFrom} ariaLabel="To date" />
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14, alignItems: "center" }}>
            <span className="muted" style={{ fontSize: 12.5, marginRight: 4 }}>Quick:</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => applyPreset("month")}>This month</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => applyPreset("6m")}>Last 6 months</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => applyPreset("year")}>This year</button>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn" onClick={() => void generate()} disabled={generating}>
              <i className="bi bi-bar-chart-fill" /> {generating ? "Generating…" : "Generate report"}
            </button>
            <button
              type="button"
              className="btn btn-accent"
              onClick={() => void downloadPdf()}
              disabled={pdfBusy || !subjectId || !dateFrom || !dateTo}
            >
              <i className="bi bi-file-earmark-pdf" /> {pdfBusy ? "Preparing…" : "Download PDF"}
            </button>
          </div>
        </div>
      </Reveal>

      {!report && !generating && (
        <p className="muted" style={{ textAlign: "center", padding: "28px 12px" }}>
          Select what you need above, then generate to see the report here.
        </p>
      )}
      {generating && <p className="muted">Building report…</p>}

      {report && (
        <Reveal index={3}>
          <ReportPreview report={report} />
        </Reveal>
      )}
    </div>
  );
}

function ReportPreview({ report }: { report: ReportPayload }) {
  const s = report.summary || {};
  const name = report.subject?.name || "Report";
  const isEmployee = report.type === "employee";

  const overviewBars = useMemo(() => {
    if (isEmployee) {
      return [
        { name: "Completed", value: Number(s.tasks_completed || 0), fill: "#1E9E62" },
        { name: "Open", value: Number(s.tasks_open || 0), fill: "var(--blue-500)" },
        { name: "Projects", value: Number(s.projects || 0), fill: "var(--navy)" },
        { name: "Tracker", value: Number(s.daily_tracker_entries || 0), fill: "#0EA5E9" },
        { name: "Leave", value: Number(s.leave_days || 0), fill: "#D97706" },
      ];
    }
    return [
      { name: "Projects", value: Number(s.projects || 0), fill: "var(--navy)" },
      { name: "Content", value: Number(s.content_items || 0), fill: "var(--blue-500)" },
      { name: "Tasks", value: Number(s.tasks || 0), fill: "#0EA5E9" },
      { name: "Renewals", value: Number(s.renewals || 0), fill: "#D97706" },
      { name: "Invoices", value: Number(s.invoices || 0), fill: "#1E9E62" },
    ];
  }, [isEmployee, s]);

  const donutSlices = useMemo(() => {
    if (isEmployee) {
      const pri: Record<string, number> = {};
      for (const t of [...(report.tasks_completed || []), ...(report.tasks_open || [])]) {
        const key = String(t.priority || "normal").replace(/^\w/, (c: string) => c.toUpperCase());
        pri[key] = (pri[key] || 0) + 1;
      }
      const colors: Record<string, string> = {
        High: "#DC2626",
        Medium: "#D97706",
        Normal: "var(--blue-500)",
        Low: "#64748B",
      };
      const entries = Object.entries(pri).map(([label, value]) => ({
        label,
        value,
        color: colors[label] || "var(--navy)",
      }));
      return entries.length ? entries : [{ label: "No tasks", value: 1, color: "var(--border)" }];
    }

    const paid = Number(s.invoiced_paid || 0);
    const overdue = Number(s.invoiced_overdue || 0);
    const total = Number(s.invoiced_total || 0);
    const outstanding = Math.max(total - paid - overdue, 0);
    if (total > 0) {
      return [
        { label: "Paid", value: paid, color: "#1E9E62" },
        { label: "Overdue", value: overdue, color: "#DC2626" },
        { label: "Outstanding", value: outstanding, color: "#D97706" },
      ].filter((x) => x.value > 0);
    }

    const status: Record<string, number> = {};
    for (const c of report.content_calendar || []) {
      const key = String(c.status || "other").replace(/_/g, " ");
      status[key] = (status[key] || 0) + 1;
    }
    const palette = ["var(--navy)", "var(--blue-500)", "#1E9E62", "#D97706", "#0EA5E9"];
    const entries = Object.entries(status).map(([label, value], i) => ({
      label: label.replace(/^\w/, (c) => c.toUpperCase()),
      value,
      color: palette[i % palette.length],
    }));
    return entries.length ? entries : [{ label: "No data", value: 1, color: "var(--border)" }];
  }, [isEmployee, report, s]);

  const donutTotal = donutSlices.reduce((sum, x) => sum + x.value, 0);
  const donutTitle = isEmployee
    ? "Task priority"
    : Number(s.invoiced_total || 0) > 0
    ? "Invoice amounts"
    : "Content status";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        className="card"
        style={{
          padding: 0,
          overflow: "hidden",
          background: "linear-gradient(135deg, var(--brand-fill) 0%, var(--brand-fill-soft) 100%)",
          color: "var(--on-brand)",
          border: "none",
        }}
      >
        <div style={{ padding: "20px 22px", display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", opacity: 0.8 }}>
              {isEmployee ? "Employee report" : "Client report"}
            </div>
            <h2 style={{ margin: "6px 0 0", fontSize: 22, color: "inherit" }}>{name}</h2>
            <p style={{ margin: "6px 0 0", fontSize: 13, opacity: 0.85 }}>
              {report.date_from} → {report.date_to}
            </p>
          </div>
          {!isEmployee && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
              <MoneyChip label="Invoiced" value={`AED ${s.invoiced_total ?? 0}`} />
              <MoneyChip label="Paid" value={`AED ${s.invoiced_paid ?? 0}`} />
              <MoneyChip label="Overdue" value={`AED ${s.invoiced_overdue ?? 0}`} />
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
        {isEmployee ? (
          <>
            <MiniStat label="Completed" value={s.tasks_completed} tone="#1E9E62" icon="bi-check2-circle" />
            <MiniStat label="Open tasks" value={s.tasks_open} tone="var(--blue-500)" icon="bi-list-task" />
            <MiniStat label="Projects" value={s.projects} tone="var(--navy)" icon="bi-folder-fill" />
            <MiniStat label="Tracker" value={s.daily_tracker_entries} tone="#0EA5E9" icon="bi-journal-text" />
            <MiniStat label="Leave days" value={s.leave_days} tone="#D97706" icon="bi-calendar-x" />
          </>
        ) : (
          <>
            <MiniStat label="Projects" value={s.projects} tone="var(--navy)" icon="bi-folder-fill" />
            <MiniStat label="Content" value={s.content_items} tone="var(--blue-500)" icon="bi-calendar2-heart" />
            <MiniStat label="Tasks" value={s.tasks} tone="#0EA5E9" icon="bi-check2-square" />
            <MiniStat label="Renewals" value={s.renewals} tone="#D97706" icon="bi-arrow-repeat" />
            <MiniStat label="Invoices" value={s.invoices} tone="#1E9E62" icon="bi-receipt" />
          </>
        )}
      </div>

      <div
        className="report-charts-grid"
        style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(240px, 0.9fr)", gap: 14 }}
      >
        <div className="card" style={{ padding: 16, minHeight: 280 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--navy)", marginBottom: 8 }}>
            {isEmployee ? "Activity overview" : "Workload overview"}
          </div>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overviewBars} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "var(--panel-muted)" }}
                  contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 12.5 }}
                />
                <Bar dataKey="value" radius={[8, 8, 4, 4]} maxBarSize={42}>
                  {overviewBars.map((d) => (
                    <Cell key={d.name} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card" style={{ padding: 16, minHeight: 280 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--navy)", marginBottom: 4 }}>{donutTitle}</div>
          <div style={{ position: "relative", height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutSlices}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="62%"
                  outerRadius="92%"
                  paddingAngle={2}
                  stroke="none"
                >
                  {donutSlices.map((slice) => (
                    <Cell key={slice.label} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 12.5 }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={donutCenter}>
              <div className="muted" style={{ fontSize: 11 }}>Total</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--navy)" }}>
                {Number(s.invoiced_total || 0) > 0 && !isEmployee
                  ? Math.round(donutTotal)
                  : donutTotal}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            {donutSlices.map((slice) => (
              <span key={slice.label} className="muted" style={{ fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: slice.color }} />
                {slice.label} <strong style={{ color: "var(--text)" }}>{slice.value}</strong>
              </span>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .report-charts-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {isEmployee ? (
        <>
          <SectionTable
            title="Tasks completed"
            icon="bi-check2-circle"
            columns={["Title", "Project", "Priority", "Completed"]}
            rows={(report.tasks_completed || []).map((t) => [t.title, t.project || "—", t.priority, t.completed_at || "—"])}
          />
          <SectionTable
            title="Open tasks"
            icon="bi-list-task"
            columns={["Title", "Status", "Due", "Priority"]}
            rows={(report.tasks_open || []).map((t) => [t.title, t.status, t.due_date || "—", t.priority])}
          />
          <SectionTable
            title="Projects"
            icon="bi-folder-fill"
            columns={["Name", "Client", "Status", "Delivery"]}
            rows={(report.projects || []).map((p) => [p.name, p.client || "—", p.status, p.delivery_date || "—"])}
          />
          <SectionTable
            title="Daily tracker"
            icon="bi-journal-text"
            columns={["Date", "Task", "Notes"]}
            rows={(report.daily_tracker || []).map((e) => [e.date, e.task_name, e.description || "—"])}
          />
          <SectionTable
            title="Leave"
            icon="bi-calendar-x"
            columns={["Type", "From", "To", "Days"]}
            rows={(report.leave || []).map((l) => [l.type, l.start_date, l.end_date, String(l.days)])}
          />
        </>
      ) : (
        <>
          <SectionTable
            title="Projects"
            icon="bi-folder-fill"
            columns={["Name", "Status", "Start", "Delivery"]}
            rows={(report.projects || []).map((p) => [p.name, p.status, p.start_date || "—", p.delivery_date || "—"])}
          />
          <SectionTable
            title="Content calendar"
            icon="bi-calendar2-heart"
            columns={["Title", "Type", "Status", "Scheduled"]}
            rows={(report.content_calendar || []).map((c) => [c.title, c.content_type, c.status, c.scheduled_date])}
          />
          <SectionTable
            title="Tasks"
            icon="bi-check2-square"
            columns={["Title", "Assignee", "Status", "Due"]}
            rows={(report.tasks || []).map((t) => [t.title, t.assignee || "—", t.status, t.due_date || "—"])}
          />
          <SectionTable
            title="Renewals"
            icon="bi-arrow-repeat"
            columns={["Type", "Due", "Status", "Notes"]}
            rows={(report.renewals || []).map((r) => [r.renewal_type, r.due_date, r.status, r.notes || "—"])}
          />
          <SectionTable
            title="Invoices"
            icon="bi-receipt"
            columns={["Number", "Amount", "Status", "Due"]}
            rows={(report.invoices || []).map((i) => [i.invoice_number, `AED ${i.amount}`, i.status, i.due_date || "—"])}
          />
        </>
      )}
    </div>
  );
}

function MoneyChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.14)",
        border: "1px solid rgba(255,255,255,0.22)",
        borderRadius: 12,
        padding: "10px 14px",
        minWidth: 110,
      }}
    >
      <div style={{ fontSize: 10.5, opacity: 0.8, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: any;
  tone: string;
  icon: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "12px 14px",
        boxShadow: "var(--shadow)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div className="muted" style={{ fontSize: 11.5, fontWeight: 600 }}>{label}</div>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 9,
            display: "grid",
            placeItems: "center",
            background: "var(--panel-muted)",
            color: tone,
            fontSize: 13,
          }}
        >
          <i className={`bi ${icon}`} />
        </span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--navy)", marginTop: 6 }}>{value ?? 0}</div>
    </div>
  );
}

function SectionTable({
  title,
  icon,
  columns,
  rows,
}: {
  title: string;
  icon: string;
  columns: string[];
  rows: string[][];
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
        <i className={`bi ${icon}`} style={{ color: "var(--gold)" }} />
        {title}
        <span className="muted" style={{ fontWeight: 500, marginLeft: "auto", fontSize: 12 }}>{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="muted" style={{ padding: "14px 16px", margin: 0, fontSize: 13 }}>Nothing in this period.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="kwick-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {r.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const donutCenter: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  textAlign: "center",
  pointerEvents: "none",
};
