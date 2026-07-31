"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";

type StaffDetail = {
  staff: {
    id: number;
    email: string;
    full_name: string;
    role: string;
    status: string;
    job_title: string;
    department: string;
  };
  collaterals: { id: number; doc_type: string; file_url: string; generated_at: string | null }[];
  leave_balance: { year: number; annual_allowance: number; used: number; pending: number; remaining: number };
  leaves: {
    id: number;
    leave_type: string;
    start_date: string;
    end_date: string;
    days: number;
    status: string;
    reason: string;
    created_at: string;
  }[];
  tickets: {
    id: number;
    date: string;
    description: string;
    urgency: string;
    status: string;
    created_at: string;
  }[];
};

function submittedLabel(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_BADGE: Record<string, string> = {
  active: "badge-success",
  awaiting_approval: "badge-warning",
  pending: "badge-muted",
  disabled: "badge-danger",
};
const LEAVE_STATUS_BADGE: Record<string, string> = {
  pending: "badge-warning",
  approved: "badge-success",
  rejected: "badge-danger",
};
const URGENCY_BADGE: Record<string, string> = {
  low: "badge-muted",
  medium: "badge-warning",
  high: "badge-danger",
};
export default function StaffDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { showToast } = useToast();

  const [data, setData] = useState<StaffDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api<StaffDetail>(`/api/hr/staff/${id}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const decideLeave = async (leaveId: number, decision: "approved" | "rejected") => {
    setBusyKey(`leave-${leaveId}`);
    try {
      await api(`/api/hr/leaves/${leaveId}`, { method: "PATCH", body: JSON.stringify({ status: decision }) });
      showToast(`Leave request ${decision}.`);
      load();
    } finally {
      setBusyKey(null);
    }
  };

  const resolveTicket = async (ticketId: number) => {
    setBusyKey(`ticket-${ticketId}`);
    try {
      await api(`/api/hr/tickets/${ticketId}`, { method: "PATCH", body: JSON.stringify({ status: "resolved" }) });
      showToast("Ticket resolved.");
      load();
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) return <p className="muted">Loading…</p>;
  if (!data) return <p className="muted">Staff not found.</p>;

  const { staff, leave_balance, leaves, tickets } = data;
  const pendingLeaves = leaves.filter((l) => l.status === "pending");
  const openTickets = tickets.filter((t) => t.status === "open");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Link href="/hr" className="muted" style={{ fontSize: 12.5, color: "var(--gold)", fontWeight: 600 }}>
          <i className="bi bi-arrow-left" /> Back to Staff
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 8 }}>
          <span style={avatar}>{(staff.full_name || staff.email)[0].toUpperCase()}</span>
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>{staff.full_name || staff.email}</h1>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
              {staff.email} {staff.job_title && `· ${staff.job_title}`} {staff.department && `· ${staff.department}`}
            </p>
          </div>
          <span className={`badge ${STATUS_BADGE[staff.status] ?? ""}`} style={{ marginLeft: 12 }}>
            {staff.status.replace("_", " ")}
          </span>
          <Link href={`/hr/staff/${id}/edit`} className="btn btn-sm" style={{ marginLeft: "auto" }}>
            <i className="bi bi-pencil-fill" /> Edit
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div className="card">
          <span className="card-title">
            Leave Requests
            {pendingLeaves.length > 0 && <span className="badge badge-warning">{pendingLeaves.length} pending</span>}
          </span>
          <p className="muted" style={{ fontSize: 12.5, marginTop: -8 }}>
            {leave_balance.remaining} of {leave_balance.annual_allowance} days remaining ({leave_balance.year})
          </p>
          {leaves.length === 0 && <p className="muted">No leave requests yet.</p>}
          {leaves.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {leaves.map((l) => (
                <li key={l.id} style={row}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, textTransform: "capitalize" }}>
                      {l.leave_type} · {l.days}d
                    </div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {new Date(l.start_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      {" – "}
                      {new Date(l.end_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      {" · Submitted "}
                      {submittedLabel(l.created_at)}
                    </div>
                  </span>
                  {l.status === "pending" ? (
                    <span style={{ display: "flex", gap: 6 }}>
                      <button
                        className="btn btn-sm"
                        disabled={busyKey === `leave-${l.id}`}
                        onClick={() => decideLeave(l.id, "approved")}
                      >
                        Approve
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busyKey === `leave-${l.id}`}
                        onClick={() => decideLeave(l.id, "rejected")}
                      >
                        Reject
                      </button>
                    </span>
                  ) : (
                    <span className={`badge ${LEAVE_STATUS_BADGE[l.status] ?? ""}`}>{l.status}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <span className="card-title">
            Tickets
            {openTickets.length > 0 && <span className="badge badge-danger">{openTickets.length} open</span>}
          </span>
          {tickets.length === 0 && <p className="muted">No tickets raised.</p>}
          {tickets.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {tickets.map((t) => (
                <li key={t.id} style={row}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{t.description}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {new Date(t.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      {" · Submitted "}
                      {submittedLabel(t.created_at)}
                    </div>
                  </span>
                  <span className={`badge ${URGENCY_BADGE[t.urgency] ?? "badge-muted"}`}>{t.urgency}</span>
                  {t.status === "open" ? (
                    <button
                      className="btn btn-sm"
                      disabled={busyKey === `ticket-${t.id}`}
                      onClick={() => resolveTicket(t.id)}
                    >
                      Resolve
                    </button>
                  ) : (
                    <span className="badge badge-success">resolved</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

const avatar: React.CSSProperties = {
  width: 48,
  height: 48,
  minWidth: 48,
  borderRadius: "50%",
  background: "var(--navy)",
  color: "#fff",
  display: "grid",
  placeItems: "center",
  fontWeight: 700,
  fontSize: 18,
};
const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "11px 0",
  borderBottom: "1px solid var(--border)",
};
