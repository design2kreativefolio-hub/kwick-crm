"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { DatePicker } from "@/components/DatePicker";
import { api, ApiError } from "@/lib/api";
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
  };
  collaterals: {
    id: number;
    doc_type: string;
    file_url: string;
    generated_at: string | null;
  }[];
};

const DOC_TYPES: { key: string; label: string }[] = [
  { key: "experience_letter", label: "Experience Letter" },
  { key: "relieving_letter", label: "Relieving Letter" },
  { key: "salary_certificate", label: "Salary Certificate" },
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
};

export default function StaffEditPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { showToast } = useToast();

  const [data, setData] = useState<StaffDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [busyDoc, setBusyDoc] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const uploadDocType = useRef<string>("");

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
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api(`/api/hr/staff/${id}`, { method: "PATCH", body: JSON.stringify(form) });
      showToast("Staff details updated.");
      load();
    } catch (err: any) {
      setError(err instanceof ApiError ? JSON.stringify(err.data) : err.message);
    } finally {
      setSaving(false);
    }
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

  const generateDoc = async (docType: string) => {
    setBusyDoc(`generate-${docType}`);
    try {
      await api(`/api/hr/employee-collaterals/${docType}`, {
        method: "POST",
        body: JSON.stringify({ staff: id }),
      });
      showToast("Document generated.");
      load();
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't generate document." : err.message, "error");
    } finally {
      setBusyDoc(null);
    }
  };

  const pickUpload = (docType: string) => {
    uploadDocType.current = docType;
    fileRef.current?.click();
  };

  const uploadDoc = async (file: File) => {
    const docType = uploadDocType.current;
    setBusyDoc(`upload-${docType}`);
    try {
      const body = new FormData();
      body.append("staff", id);
      body.append("doc_type", docType);
      body.append("file", file);
      await api("/api/hr/employee-collaterals/upload", { method: "POST", body });
      showToast("Document uploaded.");
      load();
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't upload document." : err.message, "error");
    } finally {
      setBusyDoc(null);
      if (fileRef.current) fileRef.current.value = "";
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

  const removeDoc = async (collateralId: number) => {
    setBusyDoc(`remove-${collateralId}`);
    try {
      await api(`/api/hr/employee-collaterals/${collateralId}`, { method: "DELETE" });
      showToast("Document removed.");
      load();
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't remove document." : err.message, "error");
    } finally {
      setBusyDoc(null);
    }
  };

  if (loading) return <p className="muted">Loading…</p>;
  if (!data) return <p className="muted">Staff not found.</p>;

  const isActive = data.staff.status === "active";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Link href={`/hr/staff/${id}`} className="muted" style={{ fontSize: 12.5, color: "var(--gold)", fontWeight: 600 }}>
          <i className="bi bi-arrow-left" /> Back to {data.staff.full_name || "Staff"}
        </Link>
        <h1 style={{ margin: "8px 0 0", fontSize: 22 }}>Edit Staff</h1>
      </div>

      <div className="staff-edit-grid" style={twoCol}>
        <form className="card" onSubmit={save}>
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
          <button className="btn" style={{ marginTop: 14 }} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
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

          <div className="card">
            <span className="card-title">Documents</span>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadDoc(file);
              }}
            />
            {DOC_TYPES.map((d) => {
              const issued = data.collaterals.filter((c) => c.doc_type === d.key);
              return (
                <div key={d.key} style={docBlock}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{d.label}</div>
                  {issued.map((c) => (
                    <div key={c.id} style={docRow}>
                      <a href={c.file_url} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 12, color: "var(--gold)" }}>
                        <i className="bi bi-download" />{" "}
                        {c.generated_at ? new Date(c.generated_at).toLocaleDateString() : "Download"}
                      </a>
                      <button
                        className="icon-btn-anim"
                        style={removeBtn}
                        disabled={busyDoc === `remove-${c.id}`}
                        onClick={() => removeDoc(c.id)}
                        aria-label="Remove"
                        title="Remove"
                      >
                        <i className="bi bi-trash-fill" style={{ fontSize: 12, color: "var(--danger)" }} />
                      </button>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busyDoc === `generate-${d.key}`}
                      onClick={() => generateDoc(d.key)}
                    >
                      {busyDoc === `generate-${d.key}` ? "…" : "Generate"}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busyDoc === `upload-${d.key}`}
                      onClick={() => pickUpload(d.key)}
                    >
                      <i className="bi bi-upload" /> {busyDoc === `upload-${d.key}` ? "…" : "Upload"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
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
const docBlock: React.CSSProperties = {
  padding: "12px 0",
  borderBottom: "1px solid var(--border)",
};
const docRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "4px 0",
};
const removeBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  minWidth: 26,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "var(--bg)",
  border: "none",
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
