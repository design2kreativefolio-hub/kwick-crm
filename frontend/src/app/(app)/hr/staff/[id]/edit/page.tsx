"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BackLink } from "@/components/BackLink";
import { useConfirm } from "@/components/ConfirmDialog";
import { DatePicker } from "@/components/DatePicker";
import { api, ApiError, formatApiError, unwrapList } from "@/lib/api";
import { useAuth, Module } from "@/lib/auth";
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
};

type Grant = { id: number; module: Module };

const MODULES: { key: Module; label: string }[] = [
  { key: "hr", label: "HR" },
  { key: "sales", label: "Sales" },
  { key: "renewals", label: "Renewals" },
  { key: "reports", label: "Reports" },
];

const emptyForm = {
  full_name: "",
  email: "",
  phone: "",
  job_title: "",
  department: "",
  date_joined: "",
  visa_renewal_date: "",
  insurance_renewal_date: "",
  iloe_renewal_date: "",
  nationality: "",
  emergency_contact_uae: "",
  emergency_contact_relation: "",
  home_country_address: "",
  home_country_number: "",
};

export default function StaffEditPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const isSuperadmin = user?.role === "superadmin";

  const [data, setData] = useState<StaffDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);

  const [grants, setGrants] = useState<Grant[]>([]);
  const [grantBusy, setGrantBusy] = useState<Module | null>(null);

  const load = () => {
    setLoading(true);
    api<StaffDetail>(`/api/hr/staff/${id}`)
      .then((d) => {
        setData(d);
        setForm({
          full_name: d.staff.full_name || "",
          email: d.staff.email || "",
          phone: d.staff.phone || "",
          job_title: d.staff.job_title || "",
          department: d.staff.department || "",
          date_joined: d.staff.date_joined || "",
          visa_renewal_date: d.staff.visa_renewal_date || "",
          insurance_renewal_date: d.staff.insurance_renewal_date || "",
          iloe_renewal_date: d.staff.iloe_renewal_date || "",
          nationality: d.staff.nationality || "",
          emergency_contact_uae: d.staff.emergency_contact_uae || "",
          emergency_contact_relation: d.staff.emergency_contact_relation || "",
          home_country_address: d.staff.home_country_address || "",
          home_country_number: d.staff.home_country_number || "",
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const loadGrants = () => {
    if (!isSuperadmin) return;
    api<Grant[] | { results: Grant[] }>(`/api/auth/module-access?user=${id}`)
      .then((d) => setGrants(unwrapList(d)))
      .catch(() => {});
  };

  useEffect(loadGrants, [id, isSuperadmin]);

  const toggleModule = async (module: Module, checked: boolean) => {
    setGrantBusy(module);
    try {
      if (checked) {
        await api("/api/auth/module-access", {
          method: "POST",
          body: JSON.stringify({ user: Number(id), module }),
        });
      } else {
        const grant = grants.find((g) => g.module === module);
        if (grant) await api(`/api/auth/module-access/${grant.id}`, { method: "DELETE" });
      }
      showToast(checked ? "Access granted." : "Access removed.");
      loadGrants();
    } catch (err: any) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't update access.", "error");
    } finally {
      setGrantBusy(null);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submitDetails = async (payload: Record<string, unknown>) => {
    setError(null);
    setSaving(true);
    try {
      await api(`/api/hr/staff/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      showToast("Staff details updated.");
      load();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409 && err.data?.duplicate_warning === "phone") {
        setSaving(false);
        if (await confirm(`${err.data.message}\n\nSave this phone number anyway?`, { confirmLabel: "Save anyway" })) {
          await submitDetails({ ...payload, confirm_duplicate_phone: true });
        }
        return;
      }
      setError(err instanceof ApiError ? formatApiError(err.data) : err.message);
    } finally {
      setSaving(false);
    }
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    submitDetails(form);
  };

  const resetPassword = async () => {
    setResetting(true);
    try {
      await api(`/api/hr/staff/${id}/reset_password`, { method: "POST" });
      showToast("Password reset link emailed to the employee.");
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't reset password." : err.message, "error");
    } finally {
      setResetting(false);
    }
  };

  const toggleStatus = async () => {
    if (!data) return;
    const nextStatus = data.staff.status === "active" ? "disabled" : "active";
    setTogglingStatus(true);
    try {
      await api(`/api/hr/staff/${id}/set_status`, {
        method: "POST",
        body: JSON.stringify({ status: nextStatus }),
      });
      showToast(nextStatus === "active" ? "Account enabled." : "Account disabled.");
      load();
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't update status." : err.message, "error");
    } finally {
      setTogglingStatus(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    setUploadingAvatar(true);
    try {
      const body = new FormData();
      body.append("file", file);
      await api(`/api/hr/staff/${id}/avatar`, { method: "POST", body });
      showToast("Photo updated.");
      load();
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't upload photo." : err.message, "error");
    } finally {
      setUploadingAvatar(false);
      if (avatarRef.current) avatarRef.current.value = "";
    }
  };

  if (loading) return <p className="muted">Loading…</p>;
  if (!data) return <p className="muted">Staff not found.</p>;

  const isActive = data.staff.status === "active";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <BackLink href={`/hr/staff/${id}`} label={`Back to ${data.staff.full_name || "Staff"}`} />
          <h1 style={{ margin: "8px 0 0", fontSize: 22 }}>Edit Staff</h1>
        </div>
        <button className="btn" form="staff-edit-form" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      <div className="staff-edit-grid" style={twoCol}>
        <form id="staff-edit-form" className="card" onSubmit={save}>
          <span className="card-title">Details</span>
          <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "14px 0" }}>
            <div style={avatarPreviewBox} onClick={() => avatarRef.current?.click()}>
              {data.staff.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.staff.avatar_url} alt="" style={avatarImg} />
              ) : (
                <i className="bi bi-person-fill" style={{ fontSize: 34, color: "var(--text-muted)" }} />
              )}
              <span style={avatarCameraBadge}>
                <i className="bi bi-camera-fill" />
              </span>
            </div>
            <input
              ref={avatarRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadAvatar(file);
              }}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={uploadingAvatar}
              onClick={() => avatarRef.current?.click()}
            >
              {uploadingAvatar ? "Uploading…" : data.staff.avatar_url ? "Change photo" : "Upload photo"}
            </button>
          </div>
          <div style={fieldGrid}>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Full name</label>
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
              <label className="field-label">Job title</label>
              <input className="input" value={form.job_title} onChange={set("job_title")} />
            </div>
          </div>
          <label className="field-label">Department</label>
          <input className="input" value={form.department} onChange={set("department")} />

          <div style={{ ...fieldGrid, marginTop: 14 }}>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Nationality</label>
              <input className="input" value={form.nationality} onChange={set("nationality")} />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Home country number</label>
              <input className="input" value={form.home_country_number} onChange={set("home_country_number")} />
            </div>
          </div>

          <label className="field-label">Home country address</label>
          <textarea
            className="input"
            rows={2}
            style={{ resize: "vertical" }}
            value={form.home_country_address}
            onChange={set("home_country_address")}
          />

          <div style={{ ...fieldGrid, marginTop: 14 }}>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Emergency contact (UAE)</label>
              <input className="input" value={form.emergency_contact_uae} onChange={set("emergency_contact_uae")} />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Relation to emergency contact</label>
              <input
                className="input"
                value={form.emergency_contact_relation}
                onChange={set("emergency_contact_relation")}
              />
            </div>
          </div>

          <label className="field-label">Joining date</label>
          <DatePicker
            value={form.date_joined}
            onChange={(v) => setForm((f) => ({ ...f, date_joined: v }))}
            ariaLabel="Joining date"
          />

          <div style={{ ...fieldGrid, marginTop: 14 }}>
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
          <label className="field-label">ILOE renewal date</label>
          <DatePicker
            value={form.iloe_renewal_date}
            onChange={(v) => setForm((f) => ({ ...f, iloe_renewal_date: v }))}
            ariaLabel="ILOE renewal date"
          />

          {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 12 }}>{error}</p>}
        </form>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card">
            <span className="card-title">Account</span>
            <p className="muted" style={{ fontSize: 12.5, marginTop: -8 }}>
              Status:{" "}
              <span className={`badge ${isActive ? "badge-success" : "badge-danger"}`}>
                {data.staff.status.replace("_", " ")}
              </span>
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={resetPassword} disabled={resetting} style={{ justifyContent: "flex-start" }}>
                <i className="bi bi-key-fill" /> {resetting ? "Sending…" : "Reset password"}
              </button>
              <button
                className="btn btn-sm"
                onClick={toggleStatus}
                disabled={togglingStatus}
                style={{
                  justifyContent: "flex-start",
                  background: isActive ? "var(--danger)" : "var(--success)",
                }}
              >
                <i className={`bi ${isActive ? "bi-slash-circle-fill" : "bi-check-circle-fill"}`} />{" "}
                {togglingStatus ? "Updating…" : isActive ? "Disable account" : "Enable account"}
              </button>
            </div>
          </div>

          {isSuperadmin && (
            <div className="card">
              <span className="card-title">Module Access</span>
              <p className="muted" style={{ fontSize: 12.5, marginTop: -8, marginBottom: 10 }}>
                By default this employee only has their standard access. Grant full access to any
                of these modules below.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {MODULES.map((m) => {
                  const granted = grants.some((g) => g.module === m.key);
                  return (
                    <label
                      key={m.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        fontSize: 13.5,
                        cursor: grantBusy ? "default" : "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={granted}
                        disabled={grantBusy === m.key}
                        onChange={(e) => toggleModule(m.key, e.target.checked)}
                      />
                      {m.label}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      {ConfirmDialog}
    </div>
  );
}

const twoCol: React.CSSProperties = {
  display: "grid",
  gap: 20,
  alignItems: "start",
};
const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};
const avatarPreviewBox: React.CSSProperties = {
  position: "relative",
  width: 84,
  height: 84,
  borderRadius: "50%",
  background: "#eef0f6",
  border: "2px dashed var(--border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  overflow: "hidden",
  flexShrink: 0,
};
const avatarImg: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};
const avatarCameraBadge: React.CSSProperties = {
  position: "absolute",
  bottom: 0,
  right: 0,
  width: 26,
  height: 26,
  borderRadius: "50%",
  background: "var(--gold)",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  border: "2px solid var(--surface)",
};
