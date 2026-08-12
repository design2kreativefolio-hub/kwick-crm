"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useConfirm } from "@/components/ConfirmDialog";
import { DatePicker } from "@/components/DatePicker";
import { api, ApiError, formatApiError, unwrapList } from "@/lib/api";
import { useAuth, hasModuleAccess } from "@/lib/auth";
import { useToast } from "@/lib/toast";

type Staff = {
  id: number;
  email: string;
  full_name: string;
  role: string;
  status: string;
  job_title: string;
  department: string;
  avatar_url?: string;
};

const STATUS_BADGE: Record<string, string> = {
  active: "badge-success",
  awaiting_approval: "badge-warning",
  pending: "badge-muted",
  disabled: "badge-danger",
};

const emptyForm = {
  full_name: "",
  email: "",
  phone: "",
  password: "",
  job_title: "",
  department: "",
  date_joined: "",
  visa_renewal_date: "",
  insurance_renewal_date: "",
  iloe_renewal_date: "",
};

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let out = "";
  const values = typeof crypto !== "undefined" ? crypto.getRandomValues(new Uint32Array(12)) : null;
  for (let i = 0; i < 12; i++) {
    const idx = values ? values[i] % chars.length : Math.floor(Math.random() * chars.length);
    out += chars[idx];
  }
  return out;
}

export default function HrPage() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const isSuperadmin = user?.role === "superadmin";
  const hasAccess = isSuperadmin || hasModuleAccess(user?.module_access, "hr_staff");
  const { confirm, ConfirmDialog } = useConfirm();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    api<Staff[] | { results: Staff[] }>("/api/hr/staff")
      .then((d) => setStaff(unwrapList(d)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const pickAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setAvatarFile(file);
    setAvatarPreview(file ? URL.createObjectURL(file) : null);
  };

  const submitStaff = async (payload: Record<string, unknown>) => {
    setError(null);
    setCreating(true);
    try {
      const created = await api<Staff>("/api/hr/staff", { method: "POST", body: JSON.stringify(payload) });
      if (avatarFile) {
        const fd = new FormData();
        fd.append("file", avatarFile);
        await api(`/api/hr/staff/${created.id}/avatar`, { method: "POST", body: fd }).catch(() => {});
      }
      setForm(emptyForm);
      setAvatarFile(null);
      setAvatarPreview(null);
      setShowForm(false);
      showToast("Staff account created — a welcome email was sent.");
      load();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409 && err.data?.duplicate_warning === "phone") {
        setCreating(false);
        if (await confirm(`${err.data.message}\n\nSave this staff member with the same phone number anyway?`, { confirmLabel: "Save anyway" })) {
          await submitStaff({ ...payload, confirm_duplicate_phone: true });
        }
        return;
      }
      setError(err instanceof ApiError ? formatApiError(err.data) : err.message);
    } finally {
      setCreating(false);
    }
  };

  const addStaff = (e: React.FormEvent) => {
    e.preventDefault();
    submitStaff(form);
  };

  const approve = async (id: number) => {
    setBusyId(id);
    try {
      await api(`/api/auth/approve/${id}`, { method: "POST" });
      showToast("Staff approved.");
      load();
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: number) => {
    setBusyId(id);
    try {
      await api(`/api/auth/reject/${id}`, { method: "POST" });
      showToast("Registration rejected.");
      load();
    } finally {
      setBusyId(null);
    }
  };

  if (!hasAccess) {
    return <p className="muted">You don&apos;t have access to HR Staff.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Staffs</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Employees can self-register at /register and wait for your approval, or you can add
            them directly here — staff you add yourself are active immediately.
          </p>
        </div>
        <button className="btn btn-accent" onClick={() => setShowForm((v) => !v)}>
          <i className="bi bi-person-plus-fill" /> Add Staff
        </button>
      </div>

      {showForm && (
        <form className="card" onSubmit={addStaff}>
          <span className="card-title">New Staff Account</span>
          <div style={{ display: "flex", gap: 28, alignItems: "flex-start", marginTop: 14, flexWrap: "wrap" }}>
            <div style={avatarCol}>
              <div style={avatarPreviewBox} onClick={() => avatarInputRef.current?.click()}>
                {avatarPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarPreview} alt="" style={avatarImg} />
                ) : (
                  <i className="bi bi-person-fill" style={{ fontSize: 40, color: "var(--text-muted)" }} />
                )}
                <span style={avatarCameraBadge}>
                  <i className="bi bi-camera-fill" />
                </span>
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={pickAvatar}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 10 }}
                onClick={() => avatarInputRef.current?.click()}
              >
                {avatarPreview ? "Change photo" : "Upload photo"}
              </button>
            </div>

            <div style={{ flex: 1, minWidth: 320, display: "grid", gap: 14 }}>
              <div style={fieldGrid}>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Full name</label>
                  <input className="input" value={form.full_name} onChange={set("full_name")} required />
                </div>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Email</label>
                  <input className="input" type="email" value={form.email} onChange={set("email")} required />
                </div>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Phone number</label>
                  <input className="input" value={form.phone} onChange={set("phone")} />
                </div>
              </div>
              <div style={fieldGrid}>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Password</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      className="input"
                      value={form.password}
                      onChange={set("password")}
                      minLength={8}
                      required
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setForm((f) => ({ ...f, password: generatePassword() }))}
                    >
                      Generate
                    </button>
                  </div>
                </div>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Job title</label>
                  <input className="input" value={form.job_title} onChange={set("job_title")} />
                </div>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Department</label>
                  <input className="input" value={form.department} onChange={set("department")} />
                </div>
              </div>
              <div style={fieldGrid}>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Joining date</label>
                  <DatePicker
                    value={form.date_joined}
                    onChange={(v) => setForm((f) => ({ ...f, date_joined: v }))}
                    ariaLabel="Joining date"
                  />
                </div>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Visa renewal date</label>
                  <DatePicker
                    value={form.visa_renewal_date}
                    onChange={(v) => setForm((f) => ({ ...f, visa_renewal_date: v }))}
                    ariaLabel="Visa renewal date"
                  />
                </div>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Insurance renewal date</label>
                  <DatePicker
                    value={form.insurance_renewal_date}
                    onChange={(v) => setForm((f) => ({ ...f, insurance_renewal_date: v }))}
                    ariaLabel="Insurance renewal date"
                  />
                </div>
              </div>
              <div style={fieldGrid}>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>ILOE renewal date</label>
                  <DatePicker
                    value={form.iloe_renewal_date}
                    onChange={(v) => setForm((f) => ({ ...f, iloe_renewal_date: v }))}
                    ariaLabel="ILOE renewal date"
                  />
                </div>
              </div>

              {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
              <button className="btn" style={{ width: "fit-content" }} disabled={creating}>
                {creating ? "Creating…" : "Create staff account"}
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="card">
        <span className="card-title">
          <i className="bi bi-people-fill" style={{ color: "var(--gold)" }} />
          All Staff
        </span>
        {loading && <p className="muted">Loading…</p>}
        {!loading && staff.length === 0 && <p className="muted">No staff yet.</p>}
        {!loading && staff.length > 0 && (
          <div className="table-wrap">
            <table className="kwick-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Job Title</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link
                        href={`/hr/staff/${s.id}`}
                        style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--navy)", fontWeight: 600 }}
                      >
                        <span style={rowAvatar}>
                          {s.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={s.avatar_url} alt="" style={avatarImg} />
                          ) : (
                            <i className="bi bi-person-fill" style={{ fontSize: 14, color: "var(--text-muted)" }} />
                          )}
                        </span>
                        {s.full_name || "—"}
                      </Link>
                    </td>
                    <td>{s.email}</td>
                    <td>{s.job_title || "—"}</td>
                    <td>{s.department || "—"}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[s.status] ?? ""}`}>
                        {s.status.replace("_", " ")}
                      </span>
                    </td>
                    <td style={{ display: "flex", gap: 8 }}>
                      {s.status === "awaiting_approval" && (
                        <>
                          <button
                            className="btn btn-sm"
                            disabled={busyId === s.id}
                            onClick={() => approve(s.id)}
                          >
                            {busyId === s.id ? "…" : "Approve"}
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: "var(--danger)" }}
                            disabled={busyId === s.id}
                            onClick={() => reject(s.id)}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      <Link href={`/hr/staff/${s.id}`} className="btn btn-ghost btn-sm">
                        View <i className="bi bi-arrow-right" />
                      </Link>
                      <Link href={`/hr/staff/${s.id}/edit`} className="btn btn-ghost btn-sm">
                        <i className="bi bi-pencil-fill" /> Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {ConfirmDialog}
    </div>
  );
}

const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const avatarCol: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  width: 140,
  flexShrink: 0,
};

const avatarPreviewBox: React.CSSProperties = {
  position: "relative",
  width: 104,
  height: 104,
  borderRadius: "50%",
  background: "#eef0f6",
  border: "2px dashed var(--border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  overflow: "hidden",
};

const avatarImg: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const rowAvatar: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  background: "#eef0f6",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  flexShrink: 0,
};

const avatarCameraBadge: React.CSSProperties = {
  position: "absolute",
  bottom: 0,
  right: 0,
  width: 30,
  height: 30,
  borderRadius: "50%",
  background: "var(--gold)",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  border: "2px solid var(--surface)",
};
