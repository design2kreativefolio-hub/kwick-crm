"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BackLink } from "@/components/BackLink";
import { Reveal } from "@/components/Reveal";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";

type Staff = {
  id: number;
  email: string;
  full_name: string;
  role: string;
  status: string;
  job_title: string;
  department: string;
  phone: string;
  date_joined: string | null;
  visa_renewal_date: string | null;
  insurance_renewal_date: string | null;
  iloe_renewal_date: string | null;
  avatar_url?: string;
  nationality: string;
  emergency_contact_uae: string;
  emergency_contact_relation: string;
  home_country_address: string;
  home_country_number: string;
};

type StaffDetail = {
  staff: Staff;
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

type Tab = "profile" | "leave" | "ticket";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "profile", label: "Profile Details", icon: "bi-person-fill" },
  { key: "leave", label: "Leave Requests", icon: "bi-calendar-check-fill" },
  { key: "ticket", label: "Tickets", icon: "bi-life-preserver" },
];

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

function dateLabel(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function submittedLabel(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function StaffDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { showToast } = useToast();

  const [data, setData] = useState<StaffDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("profile");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    api<StaffDetail>(`/api/hr/staff/${id}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !data) return;
    setUploadingAvatar(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await api<{ avatar_url: string }>(`/api/hr/staff/${id}/avatar`, { method: "POST", body });
      setData((prev) =>
        prev ? { ...prev, staff: { ...prev.staff, avatar_url: res.avatar_url } } : prev
      );
      showToast("Photo updated.");
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't update photo." : err.message, "error");
    } finally {
      setUploadingAvatar(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

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
  const displayName = staff.full_name || staff.email;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <BackLink href="/hr/staff" label="Back to Staff" />
        <Link href={`/hr/staff/${id}/edit`} className="btn btn-sm">
          <i className="bi bi-pencil-fill" /> Edit
        </Link>
      </div>

      <Reveal index={0}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={banner} />
          <div style={{ textAlign: "center", padding: "0 20px 20px" }}>
            <div style={avatarSlot}>
              <div style={avatarWrap}>
                {staff.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={staff.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: 30, fontWeight: 700, color: "#fff" }}>
                    {displayName[0].toUpperCase()}
                  </span>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={onAvatarChange} style={{ display: "none" }} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploadingAvatar}
                style={cameraBtn}
                aria-label="Change photo"
              >
                <i className="bi bi-camera-fill" />
              </button>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)", marginTop: 12 }}>{displayName}</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
              {staff.email}
            </div>
            <div className="muted" style={{ fontSize: 11.5, textTransform: "capitalize", marginTop: 4 }}>
              {staff.role}
              {staff.job_title ? ` · ${staff.job_title}` : ""}
              {staff.department ? ` · ${staff.department}` : ""}
            </div>
            <div style={{ marginTop: 10 }}>
              <span className={`badge ${STATUS_BADGE[staff.status] ?? ""}`}>
                {staff.status.replace(/_/g, " ")}
              </span>
            </div>
          </div>

          <div style={tabBar}>
            {TABS.map((t) => {
              const active = t.key === tab;
              const badge =
                t.key === "leave" && pendingLeaves.length > 0
                  ? pendingLeaves.length
                  : t.key === "ticket" && openTickets.length > 0
                    ? openTickets.length
                    : null;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  style={{
                    ...tabItem,
                    color: active ? "var(--navy)" : "var(--text-muted)",
                    borderBottomColor: active ? "var(--gold)" : "transparent",
                  }}
                >
                  <i className={`bi ${t.icon}`} /> {t.label}
                  {badge !== null && <span className={`badge ${t.key === "leave" ? "badge-warning" : "badge-danger"}`}>{badge}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </Reveal>

      <Reveal index={1}>
        {tab === "profile" && (
          <div style={twoCol}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div className="card">
                <span className="card-title">Profile Details</span>
                <div style={fieldGrid}>
                  <InfoField label="Full name" value={staff.full_name || "—"} />
                  <InfoField label="Email" value={staff.email} />
                </div>
                <div style={fieldGrid}>
                  <InfoField label="Phone number" value={staff.phone || "—"} />
                  <InfoField label="Role" value={staff.role} capitalize />
                </div>
                <div style={fieldGrid}>
                  <InfoField label="Nationality" value={staff.nationality || "—"} />
                  <InfoField label="Status" value={staff.status.replace(/_/g, " ")} capitalize />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div className="card">
                <span className="card-title">Employment Details</span>
                <div style={fieldGrid}>
                  <InfoField label="Job title" value={staff.job_title || "—"} />
                  <InfoField label="Department" value={staff.department || "—"} />
                </div>
                <div style={fieldGrid}>
                  <InfoField label="Joining date" value={dateLabel(staff.date_joined)} />
                  <InfoField label="Visa renewal" value={dateLabel(staff.visa_renewal_date)} />
                </div>
                <div style={fieldGrid}>
                  <InfoField label="Insurance renewal" value={dateLabel(staff.insurance_renewal_date)} />
                  <InfoField label="ILOE renewal" value={dateLabel(staff.iloe_renewal_date)} />
                </div>
              </div>

              <div className="card">
                <span className="card-title">Emergency &amp; home country</span>
                <div style={fieldGrid}>
                  <InfoField label="Emergency contact (UAE)" value={staff.emergency_contact_uae || "—"} />
                  <InfoField label="Relation" value={staff.emergency_contact_relation || "—"} />
                </div>
                <div style={fieldGrid}>
                  <InfoField label="Home country number" value={staff.home_country_number || "—"} />
                  <InfoField label="Home country address" value={staff.home_country_address || "—"} />
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "leave" && (
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
                      {l.reason && (
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                          {l.reason}
                        </div>
                      )}
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
        )}

        {tab === "ticket" && (
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
        )}
      </Reveal>
    </div>
  );
}

function InfoField({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <div className="input" style={{ ...disabledInput, ...(capitalize ? { textTransform: "capitalize" } : {}) }}>
        {value}
      </div>
    </div>
  );
}

const banner: React.CSSProperties = {
  height: 130,
  background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-soft) 100%)",
};
const avatarSlot: React.CSSProperties = {
  position: "relative",
  display: "inline-block",
  marginTop: -48,
};
const avatarWrap: React.CSSProperties = {
  width: 96,
  height: 96,
  borderRadius: "50%",
  background: "var(--navy)",
  border: "4px solid var(--surface)",
  boxShadow: "var(--shadow)",
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
};
const cameraBtn: React.CSSProperties = {
  position: "absolute",
  bottom: 2,
  right: 2,
  width: 30,
  height: 30,
  borderRadius: "50%",
  background: "var(--gold)",
  color: "#fff",
  border: "2px solid var(--surface)",
  display: "grid",
  placeItems: "center",
  fontSize: 12.5,
  cursor: "pointer",
};
const tabBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: 28,
  borderTop: "1px solid var(--border)",
  flexWrap: "wrap",
};
const tabItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  padding: "14px 4px",
  fontSize: 13.5,
  fontWeight: 600,
  background: "none",
  border: "none",
  borderBottom: "2px solid transparent",
  cursor: "pointer",
};
const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 20,
  alignItems: "start",
};
const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};
const disabledInput: React.CSSProperties = {
  opacity: 0.7,
  cursor: "default",
  background: "var(--bg)",
};
const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "11px 0",
  borderBottom: "1px solid var(--border)",
};
