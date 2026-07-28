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
};

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function LeaveRequestsTab() {
  const { showToast } = useToast();
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [form, setForm] = useState({ leave_type: "annual", start_date: "", end_date: "", reason: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const pct = balance ? Math.min(100, Math.round(((balance.used + balance.pending) / balance.annual_allowance) * 100)) : 0;

  return (
    <div style={twoCol}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="card">
          <span className="card-title">Leave Balance {balance ? `(${balance.year})` : ""}</span>
          {balance && (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 700, color: "var(--navy)" }}>{balance.remaining}</span>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  days remaining of {balance.annual_allowance} paid days/year (UAE standard)
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
                  <th>Status</th>
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
                    <td>
                      <span className={`badge ${STATUS_BADGE[l.status] ?? "badge-muted"}`}>{l.status}</span>
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

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "380px 1fr",
  gap: 20,
  alignItems: "start",
};
