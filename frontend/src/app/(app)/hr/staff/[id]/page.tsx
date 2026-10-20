"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BackLink } from "@/components/BackLink";
import { useConfirm } from "@/components/ConfirmDialog";
import { DatePicker } from "@/components/DatePicker";
import { DonutCard, DonutSlice } from "@/components/DonutCard";
import { Modal } from "@/components/Modal";
import { Reveal } from "@/components/Reveal";
import { Select } from "@/components/Select";
import { api, ApiError, formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { Loader } from "@/components/Loader";
import { useImageCrop } from "@/components/AvatarCropModal";

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
  leave_balance: {
    year: number;
    annual_allowance: number;
    used: number;
    pending: number;
    remaining: number;
    cycle_start?: string;
    cycle_end?: string;
  };
  leaves: {
    id: number;
    leave_type: string;
    start_date: string;
    end_date: string;
    days: number;
    status: string;
    reason: string;
    admin_comment?: string;
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
  cancelled: "badge-muted",
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

/** Taken / Pending / Remaining breakdown for the Leave Balance donut — same
 *  chart component + color tokens as the main Dashboard's status donuts.
 *  "Taken" is capped at the allowance and anything past it becomes its own
 *  "Over allowance" slice, since a negative "Remaining" can't be a pie slice. */
function buildLeaveDonutSlices(leaveBalance: {
  annual_allowance: number;
  used: number;
  pending: number;
  remaining: number;
}): DonutSlice[] {
  const { annual_allowance, used, pending, remaining } = leaveBalance;
  const taken = Math.min(used, annual_allowance);
  const overAllowance = Math.max(used - annual_allowance, 0);
  const left = Math.max(remaining, 0);
  return [
    { label: "Taken", value: taken, color: "var(--chart-1)" },
    { label: "Pending", value: pending, color: "var(--chart-2)" },
    { label: "Remaining", value: left, color: "var(--chart-4)" },
    { label: "Over allowance", value: overAllowance, color: "var(--danger)" },
  ].filter((s) => s.value > 0);
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
  const { user } = useAuth();
  const isSuperadmin = user?.role === "superadmin";
  const { confirm, ConfirmDialog } = useConfirm();

  const [data, setData] = useState<StaffDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("profile");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [leaveForm, setLeaveForm] = useState({
    leave_type: "annual",
    start_date: "",
    end_date: "",
    reason: "",
    status: "approved",
  });
  const [addingLeave, setAddingLeave] = useState(false);

  const load = () => {
    setLoading(true);
    api<StaffDetail>(`/api/hr/staff/${id}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const uploadAvatarFile = async (file: File) => {
    if (!data) return;
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
    }
  };

  const avatarCrop = useImageCrop(uploadAvatarFile);

  const onAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    avatarCrop.start(e.target.files?.[0]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const [leaveEdit, setLeaveEdit] = useState<{ id: number; status: string; comment: string; start_date: string; end_date: string } | null>(null);
  const [savingLeaveEdit, setSavingLeaveEdit] = useState(false);

  const saveLeaveEdit = async () => {
    if (!leaveEdit) return;
    if (!leaveEdit.start_date || !leaveEdit.end_date) {
      showToast("Pick start and end dates.", "error");
      return;
    }
    if (leaveEdit.end_date < leaveEdit.start_date) {
      showToast("End date can't be before the start date.", "error");
      return;
    }
    setSavingLeaveEdit(true);
    try {
      await api(`/api/hr/leaves/${leaveEdit.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: leaveEdit.status,
          admin_comment: leaveEdit.comment,
          start_date: leaveEdit.start_date,
          end_date: leaveEdit.end_date,
        }),
      });
      showToast("Leave request updated.");
      setLeaveEdit(null);
      load();
    } catch (err: any) {
      showToast(err instanceof ApiError ? formatApiError(err.data) || "Couldn't update the leave request." : err.message, "error");
    } finally {
      setSavingLeaveEdit(false);
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

  const addLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveForm.start_date || !leaveForm.end_date) {
      showToast("Pick start and end dates.", "error");
      return;
    }
    setAddingLeave(true);
    try {
      await api("/api/hr/leaves", {
        method: "POST",
        body: JSON.stringify({
          staff: Number(id),
          leave_type: leaveForm.leave_type,
          start_date: leaveForm.start_date,
          end_date: leaveForm.end_date,
          reason: leaveForm.reason,
          status: leaveForm.status,
        }),
      });
      setLeaveForm({ leave_type: "annual", start_date: "", end_date: "", reason: "", status: "approved" });
      showToast(leaveForm.status === "approved" ? "Leave added to annual balance." : "Leave request logged.");
      load();
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't add leave." : err.message, "error");
    } finally {
      setAddingLeave(false);
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

  const deleteTicket = async (ticketId: number) => {
    const ok = await confirm("Delete this ticket? This cannot be undone.", {
      title: "Delete Ticket",
      danger: true,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setBusyKey(`ticket-${ticketId}`);
    try {
      await api(`/api/hr/tickets/${ticketId}`, { method: "DELETE" });
      showToast("Ticket deleted.");
      load();
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't delete ticket." : err.message, "error");
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) return <Loader />;
  if (!data) return <p className="muted">Staff not found.</p>;

  const { staff, leave_balance, leaves, tickets } = data;
  const pendingLeaves = leaves.filter((l) => l.status === "pending");
  const openTickets = tickets.filter((t) => t.status === "open");
  const displayName = staff.full_name || staff.email;
  const leaveDonutSlices = buildLeaveDonutSlices(leave_balance);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {ConfirmDialog}
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
              {avatarCrop.cropModal}
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
          <div className="profile-edit-grid">
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div className="card">
                <span className="card-title">Profile Details</span>
                <div className="profile-field-grid">
                  <InfoField label="Full name" value={staff.full_name || "—"} />
                  <InfoField label="Email" value={staff.email} />
                </div>
                <div className="profile-field-grid">
                  <InfoField label="Phone number" value={staff.phone || "—"} />
                  <InfoField label="Role" value={staff.role} capitalize />
                </div>
                <div className="profile-field-grid">
                  <InfoField label="Nationality" value={staff.nationality || "—"} />
                  <InfoField label="Status" value={staff.status.replace(/_/g, " ")} capitalize />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div className="card">
                <span className="card-title">Employment Details</span>
                <div className="profile-field-grid">
                  <InfoField label="Job title" value={staff.job_title || "—"} />
                  <InfoField label="Department" value={staff.department || "—"} />
                </div>
                <div className="profile-field-grid">
                  <InfoField label="Joining date" value={dateLabel(staff.date_joined)} />
                  <InfoField label="Visa renewal" value={dateLabel(staff.visa_renewal_date)} />
                </div>
                <div className="profile-field-grid">
                  <InfoField label="Insurance renewal" value={dateLabel(staff.insurance_renewal_date)} />
                  <InfoField label="ILOE renewal" value={dateLabel(staff.iloe_renewal_date)} />
                </div>
              </div>

              <div className="card">
                <span className="card-title">Emergency &amp; home country</span>
                <div className="profile-field-grid">
                  <InfoField label="Emergency contact (UAE)" value={staff.emergency_contact_uae || "—"} />
                  <InfoField label="Relation" value={staff.emergency_contact_relation || "—"} />
                </div>
                <div className="profile-field-grid">
                  <InfoField label="Home country number" value={staff.home_country_number || "—"} />
                  <InfoField label="Home country address" value={staff.home_country_address || "—"} />
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "leave" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <DonutCard
              title={
                leave_balance.cycle_start && leave_balance.cycle_end
                  ? `Leave Balance — ${dateLabel(leave_balance.cycle_start)} to ${dateLabel(leave_balance.cycle_end)}`
                  : `Leave Balance — ${leave_balance.year}`
              }
              slices={leaveDonutSlices.length ? leaveDonutSlices : [{ label: "No leave yet", value: 1, color: "var(--border)" }]}
            />

            <div className="card">
              <span className="card-title">
                Leave Requests
                {pendingLeaves.length > 0 && <span className="badge badge-warning">{pendingLeaves.length} pending</span>}
              </span>
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
                        {l.admin_comment && (
                          <div style={{ fontSize: 12, marginTop: 4, color: "var(--navy)" }}>
                            <i className="bi bi-chat-left-text" /> HR note: {l.admin_comment}
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
                      {l.status !== "cancelled" && (
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Change dates, decision or add a comment"
                          onClick={() =>
                            setLeaveEdit({
                              id: l.id,
                              status: l.status,
                              comment: l.admin_comment || "",
                              start_date: l.start_date,
                              end_date: l.end_date,
                            })
                          }
                        >
                          <i className="bi bi-pencil-fill" /> Edit
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Modal open={!!leaveEdit} onClose={() => setLeaveEdit(null)} maxWidth={460}>
              <span className="card-title" style={{ margin: 0 }}>Edit leave request</span>
              <p className="muted" style={{ fontSize: 12.5, margin: "6px 0 12px" }}>
                Changing the dates or decision updates the employee&apos;s leave balance and notifies them. The
                comment is visible to the employee.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Start date</label>
                  <DatePicker
                    value={leaveEdit?.start_date ?? ""}
                    onChange={(v) => setLeaveEdit((e) => (e ? { ...e, start_date: v } : e))}
                    ariaLabel="Leave start date"
                  />
                </div>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>End date</label>
                  <DatePicker
                    value={leaveEdit?.end_date ?? ""}
                    onChange={(v) => setLeaveEdit((e) => (e ? { ...e, end_date: v } : e))}
                    min={leaveEdit?.start_date || undefined}
                    ariaLabel="Leave end date"
                  />
                </div>
              </div>
              <label className="field-label">Decision</label>
              <Select
                value={leaveEdit?.status ?? "pending"}
                onChange={(v) => setLeaveEdit((e) => (e ? { ...e, status: v } : e))}
                options={[
                  { value: "approved", label: "Approved" },
                  { value: "rejected", label: "Rejected" },
                  { value: "pending", label: "Pending" },
                ]}
                ariaLabel="Decision"
              />
              <label className="field-label">Comment (optional)</label>
              <textarea
                className="input"
                rows={3}
                maxLength={1000}
                placeholder="e.g. Approved — please hand over your tasks first."
                value={leaveEdit?.comment ?? ""}
                onChange={(e) => setLeaveEdit((cur) => (cur ? { ...cur, comment: e.target.value } : cur))}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button type="button" className="btn" disabled={savingLeaveEdit} onClick={saveLeaveEdit}>
                  {savingLeaveEdit ? "Saving…" : "Save"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setLeaveEdit(null)}>
                  Cancel
                </button>
              </div>
            </Modal>

            <form className="card" onSubmit={addLeave}>
              <span className="card-title">Add leave (already taken)</span>
              <label className="field-label" style={{ marginTop: 0 }}>Leave type</label>
              <Select
                value={leaveForm.leave_type}
                onChange={(v) => setLeaveForm((f) => ({ ...f, leave_type: v }))}
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
                    value={leaveForm.start_date}
                    onChange={(v) => setLeaveForm((f) => ({ ...f, start_date: v }))}
                    ariaLabel="Start date"
                  />
                </div>
                <div>
                  <label className="field-label">End date</label>
                  <DatePicker
                    value={leaveForm.end_date}
                    onChange={(v) => setLeaveForm((f) => ({ ...f, end_date: v }))}
                    min={leaveForm.start_date || undefined}
                    ariaLabel="End date"
                  />
                </div>
              </div>
              <label className="field-label">Status</label>
              <Select
                value={leaveForm.status}
                onChange={(v) => setLeaveForm((f) => ({ ...f, status: v }))}
                options={[
                  { value: "approved", label: "Approved (counts against annual leave)" },
                  { value: "pending", label: "Pending" },
                ]}
                ariaLabel="Leave status"
              />
              <label className="field-label">Reason / note</label>
              <textarea
                className="input"
                rows={2}
                value={leaveForm.reason}
                onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
                style={{ resize: "vertical", fontFamily: "inherit" }}
              />
              <button className="btn" style={{ marginTop: 14 }} disabled={addingLeave}>
                {addingLeave ? "Saving…" : "Add leave"}
              </button>
            </form>
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
                    {isSuperadmin && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ color: "var(--danger)" }}
                        disabled={busyKey === `ticket-${t.id}`}
                        onClick={() => deleteTicket(t.id)}
                        aria-label="Delete ticket"
                      >
                        <i className="bi bi-trash-fill" />
                      </button>
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
