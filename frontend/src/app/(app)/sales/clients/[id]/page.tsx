"use client";

import { useEffect, useRef, useState } from "react";

import { useParams, useRouter, useSearchParams } from "next/navigation";

import { BackLink } from "@/components/BackLink";
import { ClientFormFields } from "@/components/sales/ClientFormFields";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  DEFAULT_CLIENT_ACCENT,
  SalesClient,
  clientPayload,
  formFromClient,
} from "@/lib/salesClient";
import { useToast } from "@/lib/toast";

export default function SalesClientDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params.id;
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const isSuperadmin = user?.role === "superadmin";
  const hasAccess = isSuperadmin || (user?.module_access ?? []).includes("sales");

  const [client, setClient] = useState<SalesClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(searchParams.get("edit") === "1");
  const [form, setForm] = useState(formFromClient(null));
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api<SalesClient>(`/api/sales/clients/${id}`)
      .then((c) => {
        setClient(c);
        setForm(formFromClient(c));
      })
      .catch(() => showToast("Couldn't load client.", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!hasAccess) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess, id]);

  useEffect(() => {
    setEditing(searchParams.get("edit") === "1");
  }, [searchParams]);

  const accent = (editing ? form.accent_color : client?.accent_color) || DEFAULT_CLIENT_ACCENT;

  const onLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await api<{ logo_url: string }>(`/api/sales/clients/${id}/logo`, {
        method: "POST",
        body,
      });
      setClient((prev) => (prev ? { ...prev, logo_url: res.logo_url } : prev));
      showToast("Logo updated.");
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't upload logo." : err.message, "error");
    } finally {
      setUploadingLogo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const cancelEdit = () => {
    if (!client) return;
    setForm(formFromClient(client));
    setEditing(false);
    setError(null);
    router.replace(`/sales/clients/${id}`);
  };

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.name.trim()) {
      setError("Company name is required.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const updated = await api<SalesClient>(`/api/sales/clients/${id}`, {
        method: "PATCH",
        body: JSON.stringify(clientPayload(form)),
      });
      setClient(updated);
      setForm(formFromClient(updated));
      setEditing(false);
      router.replace(`/sales/clients/${id}`);
      showToast("Client updated.");
    } catch (err: any) {
      setError(err instanceof ApiError ? JSON.stringify(err.data) : err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;
  if (!hasAccess) return <p className="muted">You don&apos;t have access to Sales.</p>;
  if (loading || !client) return <p className="muted">Loading client…</p>;

  const initial = (client.name || "?").trim().charAt(0).toUpperCase();
  const websiteHref = client.website
    ? client.website.startsWith("http")
      ? client.website
      : `https://${client.website}`
    : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <BackLink href="/sales/clients" label="Back to Clients" />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {editing ? (
            <>
              <button className="btn" disabled={saving} onClick={() => save()}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={cancelEdit}>
                Cancel
              </button>
            </>
          ) : (
            <button className="btn btn-accent" onClick={() => setEditing(true)}>
              <i className="bi bi-pencil-fill" /> Edit
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ height: 130, background: `linear-gradient(135deg, ${accent} 0%, ${accent}cc 100%)` }} />
        <div style={{ textAlign: "center", padding: "0 20px 22px" }}>
          <div style={avatarSlot}>
            <div style={{ ...avatarWrap, background: accent }}>
              {client.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={client.logo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 30, fontWeight: 700, color: "#fff" }}>{initial}</span>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={onLogoChange} style={{ display: "none" }} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingLogo}
              style={cameraBtn}
              aria-label="Change logo"
              title="Upload logo"
            >
              <i className="bi bi-camera-fill" />
            </button>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)", marginTop: 12 }}>
            {editing ? form.name || client.name : client.name}
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            {editing ? form.contact_email || "—" : client.contact_email || "—"}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {(editing ? form.website : client.website) || "Client"}
          </div>
        </div>
      </div>

      {editing ? (
        <form className="card" id="client-edit-form" onSubmit={save}>
          <span className="card-title">Edit client</span>
          <div style={{ marginTop: 14 }}>
            <ClientFormFields form={form} setForm={setForm} clientId={client.id} />
          </div>
          {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 12 }}>{error}</p>}
        </form>
      ) : (
        <div className="client-profile-grid">
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <span className="card-title">Company details</span>
            <div style={fieldGrid}>
              <InfoField label="Company name" value={client.name} />
              <InfoField label="Contact email" value={client.contact_email || "—"} />
              <InfoField label="Contact phone" value={client.contact_phone || "—"} />
              <div>
                <label className="field-label">Website</label>
                {websiteHref ? (
                  <a href={websiteHref} target="_blank" rel="noreferrer" style={{ fontSize: 14 }}>
                    {client.website}
                  </a>
                ) : (
                  <div style={{ fontSize: 14 }}>—</div>
                )}
              </div>
              <div>
                <label className="field-label">Theme color</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      background: accent,
                      border: "1px solid var(--border)",
                    }}
                  />
                  <span style={{ fontSize: 13.5, fontFamily: "monospace" }}>{accent}</span>
                </div>
              </div>
            </div>
            <div>
              <label className="field-label">Address</label>
              <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{client.address?.trim() || "—"}</div>
            </div>
            <div>
              <label className="field-label">Notes</label>
              <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{client.notes?.trim() || "—"}</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <span className="card-title">Documents</span>
              <FileRow label="Trade license" url={client.trade_license_url} />
              <FileRow label="VAT registration" url={client.vat_registration_url} />
            </div>

            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <span className="card-title">Company executives</span>
              {(client.executives || []).filter((e) => e.name || e.phone).length === 0 && (
                <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
                  None added.
                </p>
              )}
              {(client.executives || [])
                .filter((e) => e.name || e.phone)
                .map((e, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "8px 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div style={docIcon}>
                      <i className="bi bi-person-fill" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{e.name || "—"}</div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {e.phone || "—"}
                      </div>
                    </div>
                  </div>
                ))}
            </div>

            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <span className="card-title">Additional fields</span>
              {(client.additional_fields || []).length === 0 && (
                <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
                  None added.
                </p>
              )}
              {(client.additional_fields || []).map((f, i) => (
                <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 600 }}>{f.name || "Untitled"}</div>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                    {f.field_type === "attachment" ? "Attachment" : "Text"}
                  </div>
                  {f.field_type === "attachment" ? (
                    f.value ? (
                      <a href={f.value} target="_blank" rel="noreferrer">
                        View file
                      </a>
                    ) : (
                      <span className="muted">No file</span>
                    )
                  ) : (
                    <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{f.value || "—"}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <div style={{ fontSize: 14 }}>{value}</div>
    </div>
  );
}

function FileRow({ label, url }: { label: string; url?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={docIcon}>
        <i className="bi bi-file-earmark-fill" />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{label}</div>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
            View file
          </a>
        ) : (
          <span className="muted" style={{ fontSize: 13 }}>
            Not uploaded
          </span>
        )}
      </div>
    </div>
  );
}

const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
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
  background: "var(--navy)",
  color: "#fff",
  border: "2px solid var(--surface)",
  display: "grid",
  placeItems: "center",
  fontSize: 12.5,
  cursor: "pointer",
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
