"use client";

import { useEffect, useState } from "react";

import { api, ApiError, unwrapList } from "@/lib/api";
import { useToast } from "@/lib/toast";

type Client = { id: number; name: string; services: string[] };

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

export default function ProjectClientsPage() {
  const { showToast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingServices, setEditingServices] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api<Client[] | { results: Client[] }>("/api/projects/clients")
      .then((d) => setClients(unwrapList(d)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const addClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    setCreating(true);
    try {
      await api("/api/projects/clients", { method: "POST", body: JSON.stringify({ name: newName.trim(), services: [] }) });
      setNewName("");
      setShowForm(false);
      showToast("Client added.");
      load();
    } catch (err: any) {
      setError(err instanceof ApiError ? JSON.stringify(err.data) : err.message);
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (c: Client) => {
    setEditingId(c.id);
    setEditingServices(c.services || []);
  };

  const toggleService = (value: string) => {
    setEditingServices((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const saveServices = async () => {
    if (editingId === null) return;
    setSaving(true);
    try {
      await api(`/api/projects/clients/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({ services: editingServices }),
      });
      showToast("Services updated.");
      setEditingId(null);
      load();
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't update services." : err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Clients</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Current clients and which services we provide them.
          </p>
        </div>
        <button className="btn btn-accent" onClick={() => setShowForm((v) => !v)}>
          <i className="bi bi-plus-lg" /> Add Client
        </button>
      </div>

      {showForm && (
        <form className="card" onSubmit={addClient}>
          <span className="card-title">New Client</span>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <input
              className="input"
              placeholder="Client name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ flex: 1, minWidth: 200 }}
              required
            />
            <button className="btn" disabled={creating}>
              {creating ? "Adding…" : "Add client"}
            </button>
          </div>
          {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>}
        </form>
      )}

      <div className="card">
        <span className="card-title">
          <i className="bi bi-person-lines-fill" style={{ color: "var(--gold)" }} />
          All Clients
        </span>
        {loading && <p className="muted">Loading…</p>}
        {!loading && clients.length === 0 && <p className="muted">No clients yet.</p>}
        {!loading && clients.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {clients.map((c) => (
              <div key={c.id} style={clientRow}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--navy)" }}>{c.name}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {c.services.length === 0 && <span className="muted" style={{ fontSize: 12 }}>No services set.</span>}
                    {c.services.map((s) => (
                      <span key={s} className="badge badge-muted">
                        {SERVICE_LABEL[s] ?? s}
                      </span>
                    ))}
                  </div>
                </div>

                {editingId === c.id ? (
                  <div style={editPanel}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 6 }}>
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
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button className="btn btn-sm" disabled={saving} onClick={saveServices}>
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(c)}>
                    <i className="bi bi-pencil-fill" /> Edit services
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const clientRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 14,
  padding: "12px 14px",
  border: "1px solid var(--border)",
  borderRadius: 12,
  flexWrap: "wrap",
};

const editPanel: React.CSSProperties = {
  flex: "1 1 100%",
  background: "var(--bg)",
  borderRadius: 10,
  padding: 12,
  marginTop: 4,
};

const serviceCheckboxRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  cursor: "pointer",
};
