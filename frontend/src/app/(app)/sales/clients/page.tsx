"use client";

import { useEffect, useState } from "react";

import { api, ApiError, unwrapList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

type Client = {
  id: number;
  name: string;
  contact_email: string;
  contact_phone: string;
  company: string;
  notes: string;
  created_at: string;
};

const emptyClientForm = { name: "", contact_email: "", contact_phone: "", company: "", notes: "" };

export default function SalesClientsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isSuperadmin = user?.role === "superadmin";
  const hasAccess = isSuperadmin || (user?.module_access ?? []).includes("sales");

  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientSearch, setClientSearch] = useState("");
  const [showClientForm, setShowClientForm] = useState(false);
  const [clientForm, setClientForm] = useState(emptyClientForm);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [clientSaving, setClientSaving] = useState(false);
  const [clientBusyId, setClientBusyId] = useState<number | null>(null);

  const loadClients = () => {
    setClientsLoading(true);
    const qs = clientSearch.trim() ? `?search=${encodeURIComponent(clientSearch.trim())}` : "";
    api<Client[] | { results: Client[] }>(`/api/sales/clients${qs}`)
      .then((d) => setClients(unwrapList(d)))
      .catch(() => {})
      .finally(() => setClientsLoading(false));
  };

  useEffect(() => {
    if (!hasAccess) return;
    const timer = setTimeout(loadClients, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess, clientSearch]);

  const resetClientForm = () => {
    setClientForm(emptyClientForm);
    setEditingClientId(null);
    setShowClientForm(false);
    setClientError(null);
  };

  const startEditClient = (c: Client) => {
    setEditingClientId(c.id);
    setClientForm({
      name: c.name,
      contact_email: c.contact_email || "",
      contact_phone: c.contact_phone || "",
      company: c.company || "",
      notes: c.notes || "",
    });
    setShowClientForm(true);
  };

  const submitClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);
    setClientSaving(true);
    try {
      if (editingClientId) {
        await api(`/api/sales/clients/${editingClientId}`, { method: "PATCH", body: JSON.stringify(clientForm) });
        showToast("Client updated.");
      } else {
        await api("/api/sales/clients", { method: "POST", body: JSON.stringify(clientForm) });
        showToast("Client added.");
      }
      resetClientForm();
      loadClients();
    } catch (err: any) {
      setClientError(err instanceof ApiError ? JSON.stringify(err.data) : err.message);
    } finally {
      setClientSaving(false);
    }
  };

  const deleteClient = async (id: number) => {
    setClientBusyId(id);
    try {
      await api(`/api/sales/clients/${id}`, { method: "DELETE" });
      showToast("Client deleted.");
      if (editingClientId === id) resetClientForm();
      loadClients();
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't delete client." : err.message, "error");
    } finally {
      setClientBusyId(null);
    }
  };

  if (!user) return null;

  if (!hasAccess) {
    return <p className="muted">You don&apos;t have access to Sales.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22 }}>Clients</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Sales clients directory.
        </p>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <input
          className="input"
          placeholder="Search by name, company or email…"
          value={clientSearch}
          onChange={(e) => setClientSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <button
          className="btn btn-accent"
          onClick={() => (showClientForm ? resetClientForm() : setShowClientForm(true))}
        >
          <i className="bi bi-plus-lg" /> Add Client
        </button>
      </div>

      {showClientForm && (
        <form className="card" onSubmit={submitClient}>
          <span className="card-title">{editingClientId ? "Edit Client" : "New Client"}</span>
          <div style={{ ...fieldGrid, marginTop: 14 }}>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Name</label>
              <input
                className="input"
                value={clientForm.name}
                onChange={(e) => setClientForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Company</label>
              <input
                className="input"
                value={clientForm.company}
                onChange={(e) => setClientForm((f) => ({ ...f, company: e.target.value }))}
              />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Contact email</label>
              <input
                className="input"
                type="email"
                value={clientForm.contact_email}
                onChange={(e) => setClientForm((f) => ({ ...f, contact_email: e.target.value }))}
              />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Contact phone</label>
              <input
                className="input"
                value={clientForm.contact_phone}
                onChange={(e) => setClientForm((f) => ({ ...f, contact_phone: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="field-label">Notes</label>
            <textarea
              className="input"
              rows={3}
              value={clientForm.notes}
              onChange={(e) => setClientForm((f) => ({ ...f, notes: e.target.value }))}
              style={{ resize: "vertical" }}
            />
          </div>
          {clientError && <p style={{ color: "var(--danger)", fontSize: 13, margin: "10px 0 0" }}>{clientError}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="btn" disabled={clientSaving}>
              {clientSaving ? "Saving…" : editingClientId ? "Save changes" : "Add client"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={resetClientForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="card">
        <span className="card-title">
          <i className="bi bi-person-lines-fill" style={{ color: "var(--gold)" }} />
          All Clients
        </span>
        {clientsLoading && <p className="muted">Loading…</p>}
        {!clientsLoading && clients.length === 0 && <p className="muted">No clients yet.</p>}
        {!clientsLoading && clients.length > 0 && (
          <div className="table-wrap">
            <table className="kwick-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Contact Email</th>
                  <th>Contact Phone</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600, color: "var(--navy)" }}>{c.name}</td>
                    <td>{c.company || "—"}</td>
                    <td>{c.contact_email || "—"}</td>
                    <td>{c.contact_phone || "—"}</td>
                    <td style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => startEditClient(c)}>
                        <i className="bi bi-pencil-fill" /> Edit
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: "var(--danger)" }}
                        disabled={clientBusyId === c.id}
                        onClick={() => deleteClient(c.id)}
                      >
                        {clientBusyId === c.id ? "…" : "Delete"}
                      </button>
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

const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};
