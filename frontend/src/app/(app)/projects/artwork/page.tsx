"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

import { Combobox } from "@/components/Combobox";
import { useConfirm } from "@/components/ConfirmDialog";
import { Select } from "@/components/Select";
import { api, ApiError, formatApiError, unwrapList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

type Project = { id: number; name: string };
type ClientOption = { id: number; name: string };
type Contact = { id: number; full_name: string; email: string; role: string };
type CountryCode = { id: number; code: string; label: string };

type Artwork = {
  id: number;
  project: number | null;
  client: string;
  brand: string;
  category_code: string;
  designer: number | null;
  artwork_id: string;
  created_at: string;
};

const emptyForm = {
  companyName: "",
  productName: "",
  country: "",
  designer: "",
};

export default function ArtworkGeneratorPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [directory, setDirectory] = useState<Contact[]>([]);
  const [countries, setCountries] = useState<CountryCode[]>([]);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loadingArtworks, setLoadingArtworks] = useState(true);

  const [form, setForm] = useState(emptyForm);
  const [useCustomId, setUseCustomId] = useState(false);
  const [customArtworkId, setCustomArtworkId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<Artwork | null>(null);
  const [copied, setCopied] = useState(false);

  const [newCountryCode, setNewCountryCode] = useState("");
  const [newCountryLabel, setNewCountryLabel] = useState("");
  const [addingCountry, setAddingCountry] = useState(false);

  const [editingArtwork, setEditingArtwork] = useState<Artwork | null>(null);
  const [editForm, setEditForm] = useState({
    artwork_id: "",
    client: "",
    brand: "",
    category_code: "",
    designer: "",
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadArtworks = () => {
    setLoadingArtworks(true);
    api<Artwork[] | { results: Artwork[] }>("/api/projects/artworks")
      .then((d) => setArtworks(unwrapList(d)))
      .catch(() => {})
      .finally(() => setLoadingArtworks(false));
  };

  const loadCountries = () => {
    api<CountryCode[] | { results: CountryCode[] }>("/api/projects/category-codes")
      .then((d) => setCountries(unwrapList(d)))
      .catch(() => {});
  };

  useEffect(() => {
    api<Project[] | { results: Project[] }>("/api/projects").then((d) => setProjects(unwrapList(d))).catch(() => {});
    api<ClientOption[] | { results: ClientOption[] }>("/api/projects/clients")
      .then((d) => setClients(unwrapList(d)))
      .catch(() => {});
    api<Contact[]>("/api/messages/directory").then(setDirectory).catch(() => {});
    loadCountries();
    loadArtworks();
  }, []);

  const directoryById = useMemo(() => {
    const map = new Map<number, Contact>();
    directory.forEach((c) => map.set(c.id, c));
    return map;
  }, [directory]);

  // /api/messages/directory deliberately excludes the logged-in user (it's a
  // "colleagues to chat with" list), so an artwork designed by yourself
  // won't resolve through directoryById — fall back to the current user.
  const designerLabel = (designerId: number | null) => {
    if (!designerId) return "—";
    const contact = directoryById.get(designerId);
    if (contact) return contact.full_name || contact.email;
    if (user && designerId === user.id) return user.full_name || user.email || "Me";
    return "—";
  };

  const sortedArtworks = useMemo(() => [...artworks].sort((a, b) => b.id - a.id), [artworks]);

  // Company Name suggestions merge the real Clients list and the Projects
  // list — picking either just fills in a name; typing a fresh value never
  // creates a client or project record (same free-text-with-suggestions
  // pattern as the Projects page's Client field).
  const companyNameOptions = useMemo(() => {
    const names = new Set<string>();
    clients.forEach((c) => names.add(c.name));
    projects.forEach((p) => names.add(p.name));
    return Array.from(names);
  }, [clients, projects]);

  const addCountry = async () => {
    if (!newCountryCode.trim()) return;
    setAddingCountry(true);
    try {
      await api("/api/projects/category-codes", {
        method: "POST",
        body: JSON.stringify({ code: newCountryCode.trim(), label: newCountryLabel.trim() }),
      });
      setNewCountryCode("");
      setNewCountryLabel("");
      loadCountries();
      showToast("Country code added.");
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't add that country code." : err.message, "error");
    } finally {
      setAddingCountry(false);
    }
  };

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const payload: Record<string, unknown> = {
        brand: form.productName,
        category_code: form.country,
        client: form.companyName,
      };
      if (form.designer) payload.designer = Number(form.designer);
      if (useCustomId && customArtworkId.trim()) payload.artwork_id = customArtworkId.trim();

      const created = await api<Artwork>("/api/projects/artworks", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setLastGenerated(created);
      setCopied(false);
      setForm(emptyForm);
      setUseCustomId(false);
      setCustomArtworkId("");
      showToast("Artwork ID generated.");
      loadArtworks();
    } catch (err: any) {
      setError(err instanceof ApiError ? formatApiError(err.data) : err.message);
    } finally {
      setCreating(false);
    }
  };

  const copyId = (id: string) => {
    navigator.clipboard?.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const openEdit = (a: Artwork) => {
    setEditError(null);
    setEditingArtwork(a);
    setEditForm({
      artwork_id: a.artwork_id,
      client: a.client,
      brand: a.brand,
      category_code: a.category_code,
      designer: a.designer ? String(a.designer) : "",
    });
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingArtwork) return;
    setEditError(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        artwork_id: editForm.artwork_id.trim(),
        client: editForm.client,
        brand: editForm.brand,
        category_code: editForm.category_code,
      };
      payload.designer = editForm.designer ? Number(editForm.designer) : null;
      const updated = await api<Artwork>(`/api/projects/artworks/${editingArtwork.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setArtworks((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setEditingArtwork(null);
      showToast("Artwork updated.");
    } catch (err: any) {
      setEditError(err instanceof ApiError ? formatApiError(err.data) : err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteArtwork = async (a: Artwork) => {
    if (
      !(await confirm(`Are you sure you want to delete "${a.artwork_id}"? This cannot be undone.`, {
        title: "Delete Artwork",
        danger: true,
        confirmLabel: "Delete",
      }))
    )
      return;
    setBusyId(a.id);
    try {
      await api(`/api/projects/artworks/${a.id}`, { method: "DELETE" });
      setArtworks((prev) => prev.filter((x) => x.id !== a.id));
      showToast("Artwork deleted.");
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't delete that artwork." : err.message, "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22 }}>Artwork ID Generator</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Format: KF_CompanyName_Country_ProductName_Designer_DDMMYY_K-20244001, 20244002…
        </p>
      </div>

      <form className="card" onSubmit={generate}>
        <span className="card-title">
          <i className="bi bi-magic" style={{ color: "var(--gold)" }} />
          Generate Artwork ID
        </span>
        <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
          <div style={fieldGrid}>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Company Name</label>
              <Combobox
                value={form.companyName}
                onChange={(v) => setForm((f) => ({ ...f, companyName: v }))}
                options={companyNameOptions}
                placeholder="Pick a client, a project, or type one"
                ariaLabel="Company name"
              />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Product Name</label>
              <input
                className="input"
                value={form.productName}
                onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Country Code</label>
              <Select
                value={form.country}
                onChange={(v) => setForm((f) => ({ ...f, country: v }))}
                options={[
                  { value: "", label: countries.length ? "Select…" : "No countries yet" },
                  ...countries.map((c) => ({ value: c.code, label: c.label ? `${c.code} — ${c.label}` : c.code })),
                ]}
                ariaLabel="Country code"
              />
            </div>
          </div>
          <div style={fieldGrid}>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Designer</label>
              <Select
                value={form.designer}
                onChange={(v) => setForm((f) => ({ ...f, designer: v }))}
                options={[{ value: "", label: "Me" }, ...directory.map((c) => ({ value: String(c.id), label: c.full_name || c.email }))]}
                ariaLabel="Designer"
              />
            </div>
          </div>

          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={useCustomId}
                onChange={(e) => setUseCustomId(e.target.checked)}
              />
              Use a custom artwork number instead of auto-generating one
            </label>
            {useCustomId && (
              <input
                className="input"
                style={{ marginTop: 8, fontFamily: "monospace" }}
                placeholder="e.g. KF_Acme_UAE_Cacao_RH_010826_K-20264001"
                value={customArtworkId}
                onChange={(e) => setCustomArtworkId(e.target.value)}
                required={useCustomId}
              />
            )}
          </div>

          {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
          <button
            className="btn"
            style={{ width: "fit-content" }}
            disabled={
              creating ||
              !form.productName.trim() ||
              !form.country ||
              !form.companyName.trim() ||
              (useCustomId && !customArtworkId.trim())
            }
          >
            {creating ? "Generating…" : "Generate Artwork ID"}
          </button>
        </div>
      </form>

      {lastGenerated && (
        <div className="card" style={resultBanner}>
          <div>
            <div className="muted" style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.6 }}>
              New artwork ID
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--navy)", fontFamily: "monospace", wordBreak: "break-all" }}>
              {lastGenerated.artwork_id}
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => copyId(lastGenerated.artwork_id)}>
            <i className={copied ? "bi bi-check-lg" : "bi bi-clipboard"} /> {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      <div className="card">
        <span className="card-title">Quick add — Country Code</span>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <input
            className="input"
            placeholder="Code, e.g. UAE"
            value={newCountryCode}
            onChange={(e) => setNewCountryCode(e.target.value)}
            style={{ maxWidth: 160 }}
          />
          <input
            className="input"
            placeholder="Label (optional), e.g. United Arab Emirates"
            value={newCountryLabel}
            onChange={(e) => setNewCountryLabel(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <button className="btn btn-sm" disabled={addingCountry || !newCountryCode.trim()} onClick={addCountry}>
            {addingCountry ? "…" : "Add"}
          </button>
        </div>
      </div>

      <div className="card">
        <span className="card-title">
          <i className="bi bi-clock-history" style={{ color: "var(--gold)" }} />
          Recently Generated
        </span>
        {loadingArtworks && <p className="muted">Loading…</p>}
        {!loadingArtworks && sortedArtworks.length === 0 && <p className="muted">No artwork IDs generated yet.</p>}
        {!loadingArtworks && sortedArtworks.length > 0 && (
          <div className="table-wrap">
            <table className="kwick-table">
              <thead>
                <tr>
                  <th>Artwork ID</th>
                  <th>Company</th>
                  <th>Product Name</th>
                  <th>Country</th>
                  <th>Designer</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedArtworks.map((a) => {
                  return (
                    <tr key={a.id}>
                      <td style={{ fontFamily: "monospace", fontWeight: 700 }}>{a.artwork_id}</td>
                      <td>{a.client || "—"}</td>
                      <td>{a.brand}</td>
                      <td>{a.category_code}</td>
                      <td>{designerLabel(a.designer)}</td>
                      <td>{new Date(a.created_at).toLocaleDateString()}</td>
                      <td>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(a)}>
                            <i className="bi bi-pencil-fill" /> Edit
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: "var(--danger)" }}
                            disabled={busyId === a.id}
                            onClick={() => deleteArtwork(a)}
                            aria-label="Delete artwork"
                          >
                            <i className="bi bi-trash-fill" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {editingArtwork && (
          <motion.div
            style={modalOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setEditingArtwork(null)}
          >
            <motion.form
              className="card"
              style={modalCard}
              onClick={(e) => e.stopPropagation()}
              onSubmit={saveEdit}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="card-title" style={{ margin: 0 }}>Edit Artwork</span>
                <button type="button" className="icon-btn-anim" style={closeBtn} onClick={() => setEditingArtwork(null)} aria-label="Close">
                  <i className="bi bi-x-lg" style={{ fontSize: 13 }} />
                </button>
              </div>
              <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Artwork ID</label>
                  <input
                    className="input"
                    style={{ fontFamily: "monospace" }}
                    value={editForm.artwork_id}
                    onChange={(e) => setEditForm((f) => ({ ...f, artwork_id: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Company Name</label>
                  <Combobox
                    value={editForm.client}
                    onChange={(v) => setEditForm((f) => ({ ...f, client: v }))}
                    options={companyNameOptions}
                    placeholder="Pick a client, a project, or type one"
                    ariaLabel="Company name"
                  />
                </div>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Product Name</label>
                  <input
                    className="input"
                    value={editForm.brand}
                    onChange={(e) => setEditForm((f) => ({ ...f, brand: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Country Code</label>
                  <Select
                    value={editForm.category_code}
                    onChange={(v) => setEditForm((f) => ({ ...f, category_code: v }))}
                    options={countries.map((c) => ({ value: c.code, label: c.label ? `${c.code} — ${c.label}` : c.code }))}
                    ariaLabel="Country code"
                  />
                </div>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Designer</label>
                  <Select
                    value={editForm.designer}
                    onChange={(v) => setEditForm((f) => ({ ...f, designer: v }))}
                    options={[
                      { value: "", label: "—" },
                      ...(user
                        ? [{ value: String(user.id), label: user.full_name || user.email || "Me" }]
                        : []),
                      ...directory.map((c) => ({ value: String(c.id), label: c.full_name || c.email })),
                    ]}
                    ariaLabel="Designer"
                  />
                </div>

                {editError && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{editError}</p>}
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn" disabled={saving}>
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditingArtwork(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
      {ConfirmDialog}
    </div>
  );
}

const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const resultBanner: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  background: "var(--gold-soft)",
};

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(16, 19, 63, 0.35)",
  display: "grid",
  placeItems: "center",
  zIndex: 50,
  padding: 16,
};

const modalCard: React.CSSProperties = {
  width: "100%",
  maxWidth: 440,
  maxHeight: "90vh",
  overflowY: "auto",
};

const closeBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  minWidth: 28,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "var(--bg)",
  border: "none",
};
