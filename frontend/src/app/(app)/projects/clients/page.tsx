"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";

import { DatePicker } from "@/components/DatePicker";
import { Modal } from "@/components/Modal";
import { api, ApiError, formatApiError, unwrapList } from "@/lib/api";
import { useToast } from "@/lib/toast";

type Client = {
  id: number;
  client_id: string;
  name: string;
  start_date: string | null;
  poc_name: string;
  contact_phone: string;
  notes: string;
  services: string[];
  other_service: string;
  accent_color: string;
  logo_url: string;
};

const SERVICES: { value: string; label: string }[] = [
  { value: "branding", label: "Branding" },
  { value: "graphic_design", label: "Graphic Design" },
  { value: "web_design", label: "Web Design & Development" },
  { value: "ads_leads", label: "Ads And Leads Management" },
  { value: "photo_video", label: "Photography & Videography" },
  { value: "digital_marketing", label: "Digital Marketing" },
  { value: "podcast", label: "Podcast Production" },
  { value: "other", label: "Other Services" },
];
const SERVICE_LABEL: Record<string, string> = Object.fromEntries(SERVICES.map((s) => [s.value, s.label]));

const DEFAULT_ACCENT = "#3673FC";

const emptyForm = {
  name: "",
  start_date: "",
  poc_name: "",
  contact_phone: "",
  notes: "",
  services: [] as string[],
  other_service: "",
  accent_color: DEFAULT_ACCENT,
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function ProjectClientsPage() {
  const { showToast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingServices, setEditingServices] = useState<string[]>([]);
  const [editingOtherService, setEditingOtherService] = useState("");
  const [editingAccent, setEditingAccent] = useState(DEFAULT_ACCENT);
  const [editingPocName, setEditingPocName] = useState("");
  const [editingPocPhone, setEditingPocPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    api<Client[] | { results: Client[] }>("/api/projects/clients")
      .then((d) => setClients(unwrapList(d)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggleFormService = (value: string) => {
    setForm((f) => {
      const on = f.services.includes(value);
      const services = on ? f.services.filter((v) => v !== value) : [...f.services, value];
      return { ...f, services, other_service: value === "other" && on ? "" : f.other_service };
    });
  };

  const addClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setError(null);
    setCreating(true);
    try {
      const created = await api<Client>("/api/projects/clients", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          start_date: form.start_date || null,
          poc_name: form.poc_name.trim(),
          contact_phone: form.contact_phone.trim(),
          notes: form.notes.trim(),
          services: form.services,
          other_service: form.services.includes("other") ? form.other_service.trim() : "",
          accent_color: form.accent_color,
        }),
      });
      setForm(emptyForm);
      setShowForm(false);
      showToast(`Client added — ID ${created.client_id}.`);
      load();
    } catch (err: any) {
      setError(err instanceof ApiError ? formatApiError(err.data) : err.message);
    } finally {
      setCreating(false);
    }
  };

  const editingClient = editingId ? clients.find((c) => c.id === editingId) ?? null : null;

  const startEdit = (c: Client) => {
    setEditingId(c.id);
    setEditingServices(c.services || []);
    setEditingOtherService(c.other_service || "");
    setEditingAccent(c.accent_color || DEFAULT_ACCENT);
    setEditingPocName(c.poc_name || "");
    setEditingPocPhone(c.contact_phone || "");
  };

  const closeEdit = () => setEditingId(null);

  const toggleService = (value: string) => {
    setEditingServices((prev) => {
      const on = prev.includes(value);
      if (value === "other" && on) setEditingOtherService("");
      return on ? prev.filter((v) => v !== value) : [...prev, value];
    });
  };

  const saveClientEdits = async () => {
    if (editingId === null) return;
    setSaving(true);
    try {
      await api(`/api/projects/clients/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({
          services: editingServices,
          other_service: editingServices.includes("other") ? editingOtherService.trim() : "",
          accent_color: editingAccent,
          poc_name: editingPocName.trim(),
          contact_phone: editingPocPhone.trim(),
        }),
      });
      showToast("Client updated.");
      closeEdit();
      load();
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't update client." : err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (id: number, file: File) => {
    setUploadingLogo(true);
    try {
      const body = new FormData();
      body.append("file", file);
      await api(`/api/projects/clients/${id}/logo`, { method: "POST", body });
      showToast("Logo updated.");
      load();
    } catch {
      showToast("Couldn't upload logo.", "error");
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Clients</h1>
        </div>
        <button className="btn btn-accent" onClick={() => setShowForm((v) => !v)}>
          <i className="bi bi-plus-lg" /> Add Client
        </button>
      </div>

      {showForm && (
        <form className="card" onSubmit={addClient}>
          <span className="card-title">New Client</span>
          <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
            <div style={fieldGrid}>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Client name</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Start date</label>
                <DatePicker
                  value={form.start_date}
                  onChange={(v) => setForm((f) => ({ ...f, start_date: v }))}
                  ariaLabel="Start date"
                />
              </div>
            </div>
            <div style={fieldGrid}>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Point of Contact — name</label>
                <input
                  className="input"
                  value={form.poc_name}
                  onChange={(e) => setForm((f) => ({ ...f, poc_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Point of Contact — number</label>
                <input
                  className="input"
                  value={form.contact_phone}
                  onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Description</label>
              <textarea
                className="input"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                style={{ resize: "vertical" }}
              />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Accent color</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="color"
                  className="color-swatch-input"
                  value={form.accent_color}
                  onChange={(e) => setForm((f) => ({ ...f, accent_color: e.target.value }))}
                  aria-label="Accent color"
                />
                <span className="muted" style={{ fontSize: 12.5, fontFamily: "monospace" }}>{form.accent_color}</span>
              </div>
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Services using</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 6 }}>
                {SERVICES.map((s) => (
                  <label key={s.value} style={serviceCheckboxRow}>
                    <input
                      type="checkbox"
                      checked={form.services.includes(s.value)}
                      onChange={() => toggleFormService(s.value)}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
              {form.services.includes("other") && (
                <div style={{ marginTop: 10 }}>
                  <label className="field-label" style={{ marginTop: 0 }}>Other service</label>
                  <input
                    className="input"
                    value={form.other_service}
                    onChange={(e) => setForm((f) => ({ ...f, other_service: e.target.value }))}
                    placeholder="Describe the other service…"
                  />
                </div>
              )}
            </div>

            {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" disabled={creating || !form.name.trim()}>
                {creating ? "Adding…" : "Add client"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      <div>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, color: "var(--navy)", marginBottom: 14 }}>
          <i className="bi bi-person-lines-fill" style={{ color: "var(--gold)" }} />
          All Clients
        </span>
        {loading && <p className="muted">Loading…</p>}
        {!loading && clients.length === 0 && <p className="muted">No clients yet.</p>}
        {!loading && clients.length > 0 && (
          <div style={cardGrid}>
            {clients.map((c) => {
              const accent = c.accent_color || DEFAULT_ACCENT;
              return (
                <div key={c.id} className="card" style={tileCard}>
                  <div style={{ ...tileBanner, background: `linear-gradient(135deg, ${accent}2e 0%, ${accent}0d 100%)` }}>
                    <span style={{ ...logoCircle, background: "#fff", color: accent, boxShadow: `0 0 0 3px ${accent}33` }}>
                      {c.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.logo_url} alt="" style={logoImg} />
                      ) : (
                        c.name[0]?.toUpperCase() || "?"
                      )}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.name}
                      </div>
                      <span className="badge badge-muted" style={{ fontFamily: "monospace", marginTop: 4, display: "inline-block" }}>
                        {c.client_id}
                      </span>
                    </div>
                  </div>

                  <div style={tileBody}>
                    <div className="muted" style={{ fontSize: 12.5, display: "flex", flexDirection: "column", gap: 4 }}>
                      <span><i className="bi bi-calendar3" style={{ marginRight: 6, color: accent }} />Started {formatDate(c.start_date)}</span>
                      {(c.poc_name || c.contact_phone) && (
                        <span>
                          <i className="bi bi-person-fill" style={{ marginRight: 6, color: accent }} />
                          {c.poc_name || "POC"}
                          {c.contact_phone ? ` · ${c.contact_phone}` : ""}
                        </span>
                      )}
                    </div>
                    {c.notes && <p style={tileNotes}>{c.notes}</p>}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                      {c.services.length === 0 && <span className="muted" style={{ fontSize: 12 }}>No services set.</span>}
                      {c.services.map((s) => (
                        <span key={s} className="badge badge-muted">
                          {s === "other" ? (c.other_service || SERVICE_LABEL[s]) : (SERVICE_LABEL[s] ?? s)}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={tileFooter}>
                    <Link href={`/projects/clients/${c.id}/calendar`} className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: "center" }}>
                      <i className="bi bi-calendar3-fill" /> Calendar
                    </Link>
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: "center" }} onClick={() => startEdit(c)}>
                      <i className="bi bi-pencil-fill" /> Edit client
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal open={!!editingClient} onClose={closeEdit}>
        {editingClient && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="card-title" style={{ margin: 0 }}>Edit {editingClient.name}</span>
              <button type="button" className="icon-btn-anim" style={closeBtn} onClick={closeEdit} aria-label="Close">
                <i className="bi bi-x-lg" />
              </button>
            </div>

            <label className="field-label" style={{ marginTop: 16 }}>Point of contact</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Name</label>
                <input
                  className="input"
                  value={editingPocName}
                  onChange={(e) => setEditingPocName(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Phone number</label>
                <input
                  className="input"
                  value={editingPocPhone}
                  onChange={(e) => setEditingPocPhone(e.target.value)}
                />
              </div>
            </div>

            <label className="field-label" style={{ marginTop: 16 }}>Accent color</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <input
                type="color"
                className="color-swatch-input"
                value={editingAccent}
                onChange={(e) => setEditingAccent(e.target.value)}
                aria-label="Accent color"
              />
              <span className="muted" style={{ fontSize: 12.5, fontFamily: "monospace" }}>{editingAccent}</span>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadLogo(editingClient.id, file);
                }}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={uploadingLogo}
                onClick={() => logoInputRef.current?.click()}
              >
                <i className="bi bi-image-fill" /> {uploadingLogo ? "Uploading…" : editingClient.logo_url ? "Change logo" : "Upload logo"}
              </button>
            </div>

            <label className="field-label">Services</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 6 }}>
              {SERVICES.map((s) => (
                <label key={s.value} style={serviceCheckboxRow}>
                  <input
                    type="checkbox"
                    checked={editingServices.includes(s.value)}
                    onChange={() => toggleService(s.value)}
                  />
                  {s.label}
                </label>
              ))}
              </div>
              {editingServices.includes("other") && (
                <div style={{ marginTop: 10 }}>
                  <label className="field-label" style={{ marginTop: 0 }}>Other service</label>
                  <input
                    className="input"
                    value={editingOtherService}
                    onChange={(e) => setEditingOtherService(e.target.value)}
                    placeholder="Describe the other service…"
                  />
                </div>
              )}

            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button className="btn" disabled={saving} onClick={saveClientEdits}>
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={closeEdit}>
                Cancel
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const serviceCheckboxRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  cursor: "pointer",
};

const cardGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
  gap: 18,
};

const tileCard: React.CSSProperties = {
  padding: 0,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const tileBanner: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "16px 16px",
};

const tileBody: React.CSSProperties = {
  padding: "14px 16px",
  flex: 1,
};

const tileNotes: React.CSSProperties = {
  fontSize: 13,
  margin: "10px 0 0",
  color: "var(--text)",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const tileFooter: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "10px 14px",
  borderTop: "1px solid var(--border)",
};

const logoCircle: React.CSSProperties = {
  width: 46,
  height: 46,
  minWidth: 46,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  fontSize: 17,
  overflow: "hidden",
  flexShrink: 0,
};

const logoImg: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const closeBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "var(--bg)",
  border: "none",
  color: "var(--text-muted)",
};
