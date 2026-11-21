"use client";

import { useEffect, useRef, useState } from "react";

import { Sheet } from "@/components/bd/Sheet";
import { Select } from "@/components/Select";
import { api, ApiError, formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SOURCES } from "@/lib/bd";
import { useToast } from "@/lib/toast";

type Preview = {
  committed: boolean;
  headers: string[];
  sheet?: string;
  sheets?: string[];
  mapping: Record<string, string>;
  fields: string[];
  summary: { total: number; ok: number; duplicates: number; skipped: number; created?: number };
  rows: { row: number; status: "ok" | "duplicate" | "skipped"; reason: string; data: Record<string, string | string[]> }[];
};

const FIELD_LABEL: Record<string, string> = {
  company: "Company",
  contact_name: "Contact person",
  designation: "Designation",
  phone: "Phone",
  whatsapp: "WhatsApp",
  email: "Email",
  website: "Website",
  country: "Country",
  city: "City",
  source: "Source",
  source_detail: "Source detail",
  services: "Services",
  est_value: "Value",
  currency: "Currency",
  notes: "Notes",
};

/**
 * Bring the existing tracking sheet in. Step 1: upload → we guess which column
 * is which and show what would happen (including duplicates, which are always
 * skipped). Step 2: confirm. Importing the same sheet again adds nothing.
 */
export function ImportSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isSuperadmin = user?.role === "superadmin";
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [defaultSource, setDefaultSource] = useState("other");
  const [owner, setOwner] = useState("");
  const [owners, setOwners] = useState<{ id: number; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState("");

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setPreview(null);
    setMapping({});
    setSheet("");
    setOwner("");
    if (isSuperadmin) api<{ id: number; name: string }[]>("/api/bd/leads/owners").then(setOwners).catch(() => {});
  }, [open, isSuperadmin]);

  const send = async (commit: boolean, f: File, map: Record<string, string> | null, sh: string = sheet) => {
    const fd = new FormData();
    fd.append("file", f);
    if (sh) fd.append("sheet", sh);
    fd.append("commit", commit ? "1" : "0");
    fd.append("default_source", defaultSource);
    if (owner) fd.append("owner", owner);
    if (map) fd.append("mapping", JSON.stringify(map));
    return api<Preview>("/api/bd/leads/import", { method: "POST", body: fd });
  };

  const analyse = async (f: File, map: Record<string, string> | null, sh: string = sheet) => {
    setBusy(true);
    try {
      const p = await send(false, f, map, sh);
      setPreview(p);
      if (p.sheet) setSheet(p.sheet);
      setMapping(p.mapping);
    } catch (err) {
      setPreview(null);
      if (err instanceof ApiError && err.data?.headers) {
        // Couldn't name the leads — let them map columns by hand.
        setPreview({ committed: false, headers: err.data.headers, mapping: err.data.mapping ?? {}, fields: Object.keys(FIELD_LABEL), summary: { total: 0, ok: 0, duplicates: 0, skipped: 0 }, rows: [] });
        setMapping(err.data.mapping ?? {});
      }
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't read that file.", "error");
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await send(true, file, mapping);
      showToast(`${r.summary.created ?? 0} lead${r.summary.created === 1 ? "" : "s"} imported.`);
      onDone();
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Import failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const cols = ["company", "contact_name", "phone", "email", "source"];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      wide
      title="Import leads"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {preview && (
            <button className="btn" onClick={commit} disabled={busy || preview.summary.ok === 0}>
              {busy ? "Working…" : `Import ${preview.summary.ok} lead${preview.summary.ok === 1 ? "" : "s"}`}
            </button>
          )}
        </>
      }
    >
      <div className="bd-field">
        <span className="bd-label">Spreadsheet (.xlsx or .csv)</span>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xlsm,.csv"
          className="input"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            setSheet("");
            if (f) void analyse(f, null, "");
          }}
        />
        <span className="muted" style={{ fontSize: 12.5 }}>
          First row = column names. Duplicates (same phone, email or website as an existing lead or client) are skipped automatically.
          Columns that don&apos;t match a lead field (rating, address, priority...) are saved in the lead&apos;s timeline.
        </span>
      </div>

      {preview && (preview.sheets?.length ?? 0) > 1 && (
        <div className="bd-field">
          <span className="bd-label">Sheet to import</span>
          <Select
            value={sheet}
            onChange={(v) => {
              setSheet(v);
              if (file) void analyse(file, null, v);
            }}
            options={(preview.sheets ?? []).map((n) => ({ value: n, label: n }))}
            ariaLabel="Sheet to import"
          />
        </div>
      )}

      <div className="bd-grid2">
        <div className="bd-field">
          <span className="bd-label">Source when the sheet doesn&apos;t say</span>
          <Select value={defaultSource} onChange={setDefaultSource} options={SOURCES} ariaLabel="Default source" />
        </div>
        {isSuperadmin && (
          <div className="bd-field">
            <span className="bd-label">Assign to</span>
            <Select
              value={owner}
              onChange={setOwner}
              options={[{ value: "", label: "Auto (round-robin)" }, ...owners.map((o) => ({ value: String(o.id), label: o.name }))]}
              ariaLabel="Assign to"
            />
          </div>
        )}
      </div>

      {preview && (
        <>
          <div className="bd-chips">
            <span className="badge badge-success">{preview.summary.ok} new</span>
            <span className="badge badge-warning">{preview.summary.duplicates} duplicates skipped</span>
            {preview.summary.skipped > 0 && <span className="badge badge-muted">{preview.summary.skipped} without a name</span>}
          </div>

          <details>
            <summary style={{ cursor: "pointer", fontWeight: 650, fontSize: 13.5 }}>Check the column matching</summary>
            <div className="bd-grid2" style={{ marginTop: 10 }}>
              {preview.fields.map((field) => (
                <div className="bd-field" key={field}>
                  <span className="bd-label">{FIELD_LABEL[field] ?? field}</span>
                  <Select
                    value={mapping[field] ?? ""}
                    onChange={(v) => setMapping((m) => ({ ...m, [field]: v }))}
                    options={[{ value: "", label: "— not in sheet —" }, ...preview.headers.map((h) => ({ value: h, label: h || "(blank)" }))]}
                    ariaLabel={FIELD_LABEL[field] ?? field}
                  />
                </div>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} disabled={busy || !file} onClick={() => file && analyse(file, mapping)}>
              Re-check with this matching
            </button>
          </details>

          {preview.rows.length > 0 && (
            <div className="table-wrap">
              <table className="bd-import-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    {cols.map((c) => (
                      <th key={c}>{FIELD_LABEL[c]}</th>
                    ))}
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.row} className={r.status === "ok" ? "" : "is-dup"}>
                      <td>{r.row}</td>
                      {cols.map((c) => (
                        <td key={c}>{String(r.data[c] ?? "")}</td>
                      ))}
                      <td style={{ textDecoration: "none" }}>{r.status === "ok" ? "✓ new" : r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.summary.total > preview.rows.length && (
                <p className="muted" style={{ fontSize: 12.5 }}>
                  Showing the first {preview.rows.length} of {preview.summary.total} rows.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
