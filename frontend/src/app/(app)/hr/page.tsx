"use client";

import { useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";

type Staff = {
  id: number;
  email: string;
  full_name: string;
  role: string;
  status: string;
  job_title: string;
  department: string;
};

const STATUS_BADGE: Record<string, string> = {
  active: "badge-success",
  awaiting_approval: "badge-warning",
  pending: "badge-muted",
  disabled: "badge-danger",
};

export default function HrPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", job_title: "", department: "" });
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [inviteRole, setInviteRole] = useState<"employee" | "manager">("employee");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api<Staff[]>("/api/hr/staff")
      .then(setStaff)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const addStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/hr/staff", { method: "POST", body: JSON.stringify(form) });
      setForm({ full_name: "", email: "", job_title: "", department: "" });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err instanceof ApiError ? JSON.stringify(err.data) : err.message);
    }
  };

  const approve = async (id: number) => {
    setBusyId(id);
    try {
      await api(`/api/auth/approve/${id}`, { method: "POST" });
      load();
    } finally {
      setBusyId(null);
    }
  };

  const generateInvite = async () => {
    setInviteBusy(true);
    setInviteError(null);
    setInviteCode(null);
    try {
      const res = await api<{ code: string }>("/api/auth/invite-codes", {
        method: "POST",
        body: JSON.stringify({ role_for: inviteRole, expires_in_days: 7 }),
      });
      setInviteCode(res.code);
    } catch (err: any) {
      setInviteError(err instanceof ApiError ? JSON.stringify(err.data) : err.message);
    } finally {
      setInviteBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>HR — Staff</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Add employees directly (no invite code needed) or wait for them to self-register with
            an employee invite code — either way they land here awaiting your approval.
          </p>
        </div>
        <button className="btn btn-accent" onClick={() => setShowForm((v) => !v)}>
          <i className="bi bi-person-plus" /> Add Staff
        </button>
      </div>

      {showForm && (
        <form className="card" onSubmit={addStaff} style={{ maxWidth: 480 }}>
          <label className="field-label">Full name</label>
          <input className="input" value={form.full_name} onChange={set("full_name")} required />
          <label className="field-label">Email</label>
          <input className="input" type="email" value={form.email} onChange={set("email")} required />
          <label className="field-label">Job title</label>
          <input className="input" value={form.job_title} onChange={set("job_title")} />
          <label className="field-label">Department</label>
          <input className="input" value={form.department} onChange={set("department")} />
          {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
          <button className="btn" style={{ marginTop: 14 }}>Create staff record</button>
        </form>
      )}

      <div className="card" style={{ maxWidth: 480 }}>
        <span className="card-title">Invite Codes</span>
        <p className="muted" style={{ fontSize: 13, marginTop: -8, marginBottom: 14 }}>
          Generate a single-use code so someone can self-register at{" "}
          <code style={{ color: "var(--gold)" }}>/register</code>. Employee registrations still
          need your approval; manager registrations activate immediately.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label className="field-label" style={{ marginTop: 0 }}>Role</label>
            <select
              className="input"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "employee" | "manager")}
            >
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
            </select>
          </div>
          <button className="btn" onClick={generateInvite} disabled={inviteBusy}>
            {inviteBusy ? "Generating…" : "Generate code"}
          </button>
        </div>
        {inviteError && <p style={{ color: "var(--danger)", fontSize: 13 }}>{inviteError}</p>}
        {inviteCode && (
          <p style={{ marginTop: 12, marginBottom: 0 }}>
            <code
              style={{
                background: "var(--bg)",
                padding: "6px 10px",
                borderRadius: 6,
                color: "var(--gold)",
                fontWeight: 600,
              }}
            >
              {inviteCode}
            </code>
            <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
              Valid 7 days, shown once — copy it now.
            </span>
          </p>
        )}
      </div>

      <div className="card">
        <span className="card-title">
          <i className="bi bi-people" style={{ color: "var(--gold)" }} />
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
                    <td>{s.full_name || "—"}</td>
                    <td>{s.email}</td>
                    <td>{s.job_title || "—"}</td>
                    <td>{s.department || "—"}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[s.status] ?? ""}`}>
                        {s.status.replace("_", " ")}
                      </span>
                    </td>
                    <td>
                      {s.status === "awaiting_approval" && (
                        <button
                          className="btn btn-sm"
                          disabled={busyId === s.id}
                          onClick={() => approve(s.id)}
                        >
                          {busyId === s.id ? "Approving…" : "Approve"}
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
