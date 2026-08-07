"use client";

import { useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

function dateLabel(iso: string | null | undefined) {
  if (!iso) return "Not set";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

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

export function EditProfileTab() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const isSuperadmin = user?.role === "superadmin";

  const [form, setForm] = useState({ full_name: "", email: "", phone: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [letters, setLetters] = useState<
    { id: number; doc_type_label: string; title: string; file_url: string; status: string; updated_at: string }[]
  >([]);

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
      api<typeof letters>("/api/hr/letters/mine")
        .then(setLetters)
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
      // Employees' name/email are superadmin-owned — only phone ever goes out
      // for them; the backend also enforces this, this just avoids a
      // pointless round trip.
      const body = isSuperadmin ? form : { phone: form.phone };
      await api("/api/auth/me", { method: "PATCH", body: JSON.stringify(body) });
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <button
              type="button"
              className="muted"
              style={{ fontSize: 12, background: "none", border: "none", padding: 0, cursor: "pointer" }}
              onClick={() => {
                const generated = generatePassword();
                setPw((f) => ({ ...f, new_password: generated, confirm: generated }));
              }}
            >
              Generate a new one for me
            </button>
          </div>
          {pwError && <p style={{ color: "var(--danger)", fontSize: 13 }}>{pwError}</p>}
          <button className="btn" style={{ marginTop: 14 }} disabled={savingPw}>
            {savingPw ? "Updating…" : "Update password"}
          </button>
        </form>

        {!isSuperadmin && (
          <div className="card">
            <span className="card-title">My Documents</span>
            {letters.length === 0 && <p className="muted">No documents assigned to you yet.</p>}
            {letters.length > 0 && (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {letters.map((l) => (
                  <li key={l.id} style={docRow}>
                    <span style={docIcon}>
                      <i className="bi bi-file-earmark-text-fill" />
                    </span>
                    <span style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{l.doc_type_label || l.title}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {new Date(l.updated_at).toLocaleDateString()} · {l.status}
                      </div>
                    </span>
                    {l.file_url ? (
                      <a href={l.file_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                        <i className="bi bi-download" /> PDF
                      </a>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>Pending export</span>
                    )}
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
              <input
                className="input"
                value={form.full_name}
                onChange={set("full_name")}
                required
                disabled={!isSuperadmin}
                style={!isSuperadmin ? disabledInput : undefined}
              />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Email</label>
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={set("email")}
                required
                disabled={!isSuperadmin}
                style={!isSuperadmin ? disabledInput : undefined}
              />
            </div>
          </div>
          <div style={fieldGrid}>
            <div>
              <label className="field-label">Phone number</label>
              <input className="input" value={form.phone} onChange={set("phone")} />
            </div>
            <div>
              <label className="field-label">Role</label>
              <input className="input" value={user?.role ?? ""} disabled style={{ ...disabledInput, textTransform: "capitalize" }} />
            </div>
          </div>
          {profileError && <p style={{ color: "var(--danger)", fontSize: 13 }}>{profileError}</p>}
          <button className="btn" style={{ marginTop: 14 }} disabled={savingProfile}>
            {savingProfile ? "Saving…" : "Save changes"}
          </button>
        </form>

        {!isSuperadmin && (
          <div className="card">
            <span className="card-title">Employment Details</span>
            <div style={fieldGrid}>
              <InfoField label="Job title" value={user?.profile?.job_title || "—"} />
              <InfoField label="Department" value={user?.profile?.department || "—"} />
            </div>
            <div style={fieldGrid}>
              <InfoField label="Joining date" value={dateLabel(user?.profile?.date_joined)} />
              <InfoField label="Visa renewal" value={dateLabel(user?.profile?.visa_renewal_date)} />
            </div>
            <div style={fieldGrid}>
              <InfoField label="Insurance renewal" value={dateLabel(user?.profile?.insurance_renewal_date)} />
              <InfoField label="ILOE renewal" value={dateLabel(user?.profile?.iloe_renewal_date)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <div className="input" style={disabledInput}>{value}</div>
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
const disabledInput: React.CSSProperties = {
  opacity: 0.7,
  cursor: "not-allowed",
  background: "var(--bg)",
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
