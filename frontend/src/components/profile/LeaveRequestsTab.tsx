"use client";

import { useEffect, useState } from "react";

import { DatePicker } from "@/components/DatePicker";
import { Select } from "@/components/Select";
import { api, ApiError, unwrapList } from "@/lib/api";
import { useToast } from "@/lib/toast";

type LeaveBalance = {
  year: number;
  annual_allowance: number;
  used: number;
  pending: number;
  remaining: number;
  used_this_month: number;
};

type Leave = {
  id: number;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  status: string;
  reason: string;
  created_at: string;
};

const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual: "Annual",
  sick: "Sick",
  unpaid: "Unpaid",
  other: "Other",
};
const STATUS_BADGE: Record<string, string> = {
  pending: "badge-warning",
  approved: "badge-success",
  rejected: "badge-danger",
  cancelled: "badge-muted",
};

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function submittedLabel(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function LeaveRequestsTab() {
  const { showToast } = useToast();
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [form, setForm] = useState({ leave_type: "annual", start_date: "", end_date: "", reason: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retractingId, setRetractingId] = useState<number | null>(null);

  const load = () => {
    api<LeaveBalance>("/api/hr/leaves/balance").then(setBalance).catch(() => {});
    api<Leave[] | { results: Leave[] }>("/api/hr/leaves")
      .then((d) => setLeaves(unwrapList(d)))
      .catch(() => {});
  };

  useEffect(load, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.start_date || !form.end_date) {
      setError("Pick a start and end date.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/hr/leaves", { method: "POST", body: JSON.stringify(form) });
      setForm({ leave_type: "annual", start_date: "", end_date: "", reason: "" });
      showToast("Leave request submitted.");
      load();
    } catch (err: any) {
      setError(err instanceof ApiError ? JSON.stringify(err.data) : err.message);
    } finally {
      setBusy(false);
    }
  };

  const retract = async (id: number) => {
    setRetractingId(id);
    try {
      await api(`/api/hr/leaves/${id}/retract`, { method: "POST" });
      showToast("Leave request retracted.");
      load();
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't retract request." : err.message, "error");
    } finally {
      setRetractingId(null);
    }
  };

  const overAllowance = balance ? balance.used + balance.pending > balance.annual_allowance : false;
  const pct = balance
    ? Math.min(100, Math.round(((balance.used + balance.pending) / Math.max(1, balance.annual_allowance)) * 100))
    : 0;

  return (
    <div style={twoCol}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="card">
          <span className="card-title">Annual Leave Balance {balance ? `(${balance.year})` : ""}</span>
          {balance && (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 700, color: "var(--navy)" }}>
                  {balance.used}<span style={{ fontSize: 20, color: "var(--text-muted)", fontWeight: 600 }}>/{balance.annual_allowance}</span>
                </span>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  annual days taken (UAE standard: {balance.annual_allowance}/year)
                </span>
              </div>
              <div className="seg-bar">
                <div className="seg-bar-segment" style={{ width: `${pct}%`, background: "var(--blue-500)" }} />
              </div>
              <div className="seg-legend">
                <span className="seg-legend-item">
                  <span className="seg-dot" style={{ background: "var(--blue-500)" }} />
                  Used <strong style={{ color: "var(--text)" }}>{balance.used}</strong>
                </span>
                <span className="seg-legend-item">
                  <span className="seg-dot" style={{ background: "var(--blue-200)" }} />
                  Pending <strong style={{ color: "var(--text)" }}>{balance.pending}</strong>
                </span>
                <span className="seg-legend-item">
                  <span className="seg-dot" style={{ background: "var(--border)" }} />
                  Remaining{" "}
                  <strong style={{ color: balance.remaining < 0 ? "var(--danger)" : "var(--text)" }}>
                    {balance.remaining}
                  </strong>
                </span>
              </div>
              {overAllowance && (
                <p style={{ color: "var(--danger)", fontSize: 12.5, margin: "8px 0 0" }}>
                  Over annual allowance by {balance.used + balance.pending - balance.annual_allowance} day
                  {balance.used + balance.pending - balance.annual_allowance === 1 ? "" : "s"}. You can still request leave.
                </p>
              )}
              <div style={{ ...monthStat, marginBottom: 0 }}>
                <i className="bi bi-calendar-week-fill" style={{ color: "var(--gold)" }} />
                <span>
                  <strong style={{ color: "var(--text)" }}>{balance.used_this_month}</strong>{" "}
                  day{balance.used_this_month === 1 ? "" : "s"} taken this month
                </span>
              </div>
            </>
          )}
        </div>

        <form className="card" onSubmit={submit}>
          <span className="card-title">Request Leave</span>
          <label className="field-label" style={{ marginTop: 0 }}>Leave type</label>
          <Select
            value={form.leave_type}
            onChange={(v) => setForm((f) => ({ ...f, leave_type: v }))}
            options={[
              { value: "annual", label: "Annual" },
              { value: "sick", label: "Sick" },
              { value: "unpaid", label: "Unpaid" },
              { value: "other", label: "Other" },
            ]}
            ariaLabel="Leave type"
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="field-label">Start date</label>
              <DatePicker
                value={form.start_date}
                onChange={(v) => setForm((f) => ({ ...f, start_date: v }))}
                min={todayIso()}
                ariaLabel="Start date"
              />
            </div>
            <div>
              <label className="field-label">End date</label>
              <DatePicker
                value={form.end_date}
                onChange={(v) => setForm((f) => ({ ...f, end_date: v }))}
                min={form.start_date || todayIso()}
                ariaLabel="End date"
              />
            </div>
          </div>
          <label className="field-label">Reason</label>
          <textarea
            className="input"
            rows={3}
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            style={{ resize: "vertical", fontFamily: "inherit" }}
          />
          {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
          <button className="btn" style={{ marginTop: 14 }} disabled={busy}>
            {busy ? "Submitting…" : "Submit request"}
          </button>
        </form>
      </div>

      <div className="card">
        <span className="card-title">History</span>
        {leaves.length === 0 && <p className="muted">No leave requests yet.</p>}
        {leaves.length > 0 && (
          <div className="table-wrap">
            <table className="kwick-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Dates</th>
                  <th>Days</th>
                  <th>Reason</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {leaves.map((l) => (
                  <tr key={l.id}>
                    <td>{LEAVE_TYPE_LABEL[l.leave_type] ?? l.leave_type}</td>
                    <td>
                      {new Date(l.start_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      {" – "}
                      {new Date(l.end_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </td>
                    <td>{l.days}</td>
                    <td style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {l.reason || "—"}
                    </td>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>{submittedLabel(l.created_at)}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[l.status] ?? "badge-muted"}`}>{l.status}</span>
                    </td>
                    <td>
                      {l.status === "pending" && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--danger)" }}
                          disabled={retractingId === l.id}
                          onClick={() => retract(l.id)}
                        >
                          {retractingId === l.id ? "…" : "Retract"}
                        </button>
                      )}
                    </td>
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

const monthStat: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 12,
  fontSize: 12.5,
  color: "var(--text-muted)",
};
const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "380px 1fr",
  gap: 20,
  alignItems: "start",
};
