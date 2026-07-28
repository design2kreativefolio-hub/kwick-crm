"use client";

import { useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

type Collateral = {
  id: number;
  doc_type: string;
  file_url: string;
  generated_at: string | null;
};

const DOC_LABELS: Record<string, string> = {
  offer_letter: "Offer Letter",
  experience_letter: "Experience Letter",
  relieving_letter: "Relieving Letter",
  salary_certificate: "Salary Certificate",
};

export function EditProfileTab() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();

  const [form, setForm] = useState({ full_name: "", email: "", phone: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  const [collaterals, setCollaterals] = useState<Collateral[]>([]);

  useEffect(() => {
    if (user) {
      setForm({
        full_name: user.full_name || "",
        email: user.email || "",
        phone: user.profile?.phone || "",
      });
    }
  }, [user]);

  useEffect(() => {
    if (user?.role === "employee") {
      api<Collateral[]>("/api/hr/employee-collaterals/mine")
        .then(setCollaterals)
        .catch(() => {});
    }
  }, [user?.role]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const setPwField = (k: keyof typeof pw) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setPw((f) => ({ ...f, [k]: e.target.value }));

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileError(null);
    try {
      await api("/api/auth/me", { method: "PATCH", body: JSON.stringify(form) });
      await refreshUser();
      showToast("Profile updated.");
    } catch (err: any) {
      setProfileError(err instanceof ApiError ? JSON.stringify(err.data) : err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (pw.new_password !== pw.confirm) {
      setPwError("New passwords don't match.");
      return;
    }
    setSavingPw(true);
    try {
      await api("/api/auth/me/password", {
        method: "POST",
        body: JSON.stringify({ current_password: pw.current_password, new_password: pw.new_password }),
      });
      setPw({ current_password: "", new_password: "", confirm: "" });
      showToast("Password changed.");
    } catch (err: any) {
      setPwError(err instanceof ApiError ? JSON.stringify(err.data) : err.message);
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div style={twoCol}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <form className="card" onSubmit={changePassword}>
          <span className="card-title">Change Password</span>
          <label className="field-label" style={{ marginTop: 0 }}>Current password</label>
          <input className="input" type="password" value={pw.current_password} onChange={setPwField("current_password")} required />
          <div style={fieldGrid}>
            <div>
              <label className="field-label">New password</label>
              <input className="input" type="password" value={pw.new_password} onChange={setPwField("new_password")} required minLength={8} />
            </div>
            <div>
              <label className="field-label">Confirm new password</label>
              <input className="input" type="password" value={pw.confirm} onChange={setPwField("confirm")} required minLength={8} />
            </div>
          </div>
          {pwError && <p style={{ color: "var(--danger)", fontSize: 13 }}>{pwError}</p>}
          <button className="btn" style={{ marginTop: 14 }} disabled={savingPw}>
            {savingPw ? "Updating…" : "Update password"}
          </button>
        </form>

        {user?.role === "employee" && (
          <div className="card">
            <span className="card-title">My Documents</span>
            {collaterals.length === 0 && <p className="muted">No documents issued yet.</p>}
            {collaterals.length > 0 && (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {collaterals.map((c) => (
                  <li key={c.id} style={docRow}>
                    <span style={docIcon}>
                      <i className="bi bi-file-earmark-text-fill" />
                    </span>
                    <span style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{DOC_LABELS[c.doc_type] ?? c.doc_type}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {c.generated_at ? new Date(c.generated_at).toLocaleDateString() : "—"}
                      </div>
                    </span>
                    <a href={c.file_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                      <i className="bi bi-download" /> Download
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <form className="card" onSubmit={saveProfile}>
          <span className="card-title">Profile Details</span>
          <div style={fieldGrid}>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Username</label>
              <input className="input" value={form.full_name} onChange={set("full_name")} required />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Email</label>
              <input className="input" type="email" value={form.email} onChange={set("email")} required />
            </div>
          </div>
          <div style={fieldGrid}>
            <div>
              <label className="field-label">Phone number</label>
              <input className="input" value={form.phone} onChange={set("phone")} />
            </div>
            <div>
              <label className="field-label">Role</label>
              <input className="input" value={user?.role ?? ""} disabled style={{ textTransform: "capitalize", opacity: 0.7, cursor: "not-allowed" }} />
            </div>
          </div>
          {profileError && <p style={{ color: "var(--danger)", fontSize: 13 }}>{profileError}</p>}
          <button className="btn" style={{ marginTop: 14 }} disabled={savingProfile}>
            {savingProfile ? "Saving…" : "Save changes"}
          </button>
        </form>
      </div>
    </div>
  );
}

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

const docRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "11px 0",
  borderBottom: "1px solid var(--border)",
};
const docIcon: React.CSSProperties = {
  width: 34,
  height: 34,
  minWidth: 34,
  borderRadius: "50%",
  background: "var(--blue-100)",
  color: "var(--navy)",
  display: "grid",
  placeItems: "center",
  fontSize: 15,
};
