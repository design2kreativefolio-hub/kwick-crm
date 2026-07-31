"use client";

import { useEffect, useMemo, useState } from "react";

import { Select } from "@/components/Select";
import { api, ApiError, unwrapList } from "@/lib/api";
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
  project: "",
  client: "",
  productName: "",
  country: "",
  designer: "",
};

export default function ArtworkGeneratorPage() {
  const { user } = useAuth();
  const isManager = user?.role === "manager";
  const { showToast } = useToast();

  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [directory, setDirectory] = useState<Contact[]>([]);
  const [countries, setCountries] = useState<CountryCode[]>([]);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loadingArtworks, setLoadingArtworks] = useState(true);

  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<Artwork | null>(null);
  const [copied, setCopied] = useState(false);

  const [newCountryCode, setNewCountryCode] = useState("");
  const [newCountryLabel, setNewCountryLabel] = useState("");
  const [addingCountry, setAddingCountry] = useState(false);

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

  const sortedArtworks = useMemo(() => [...artworks].sort((a, b) => b.id - a.id), [artworks]);

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
      };
      if (form.project) payload.project = Number(form.project);
      if (form.client) payload.client = form.client;
      if (isManager && form.designer) payload.designer = Number(form.designer);

      const created = await api<Artwork>("/api/projects/artworks", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setLastGenerated(created);
      setCopied(false);
      setForm(emptyForm);
      showToast("Artwork ID generated.");
      loadArtworks();
    } catch (err: any) {
      setError(err instanceof ApiError ? JSON.stringify(err.data) : err.message);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22 }}>Artwork ID Generator</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Format: KF_Country_ProductName_Designer_DDMMYY_K-ArtworkNo
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
              <label className="field-label" style={{ marginTop: 0 }}>Project (optional)</label>
              <Select
                value={form.project}
                onChange={(v) => setForm((f) => ({ ...f, project: v }))}
                options={[{ value: "", label: "No project" }, ...projects.map((p) => ({ value: String(p.id), label: p.name }))]}
                ariaLabel="Project"
              />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Client (optional)</label>
              <Select
                value={form.client}
                onChange={(v) => setForm((f) => ({ ...f, client: v }))}
                options={[{ value: "", label: "No client" }, ...clients.map((c) => ({ value: c.name, label: c.name }))]}
                ariaLabel="Client"
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
          </div>
          <div style={fieldGrid}>
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
            {isManager && (
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Designer</label>
                <Select
                  value={form.designer}
                  onChange={(v) => setForm((f) => ({ ...f, designer: v }))}
                  options={[{ value: "", label: "Me" }, ...directory.map((c) => ({ value: String(c.id), label: c.full_name || c.email }))]}
                  ariaLabel="Designer"
                />
              </div>
            )}
          </div>

          {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
          <button
            className="btn"
            style={{ width: "fit-content" }}
            disabled={creating || !form.productName.trim() || !form.country}
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

      {isManager && (
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
      )}

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
                  <th>Client</th>
                  <th>Product Name</th>
                  <th>Country</th>
                  <th>Designer</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {sortedArtworks.map((a) => {
                  const designer = a.designer ? directoryById.get(a.designer) : undefined;
                  return (
                    <tr key={a.id}>
                      <td style={{ fontFamily: "monospace", fontWeight: 700 }}>{a.artwork_id}</td>
                      <td>{a.client || "—"}</td>
                      <td>{a.brand}</td>
                      <td>{a.category_code}</td>
                      <td>{designer ? designer.full_name || designer.email : "—"}</td>
                      <td>{new Date(a.created_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
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

const resultBanner: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  background: "var(--gold-soft)",
};
