"use client";

import { useEffect, useMemo, useState } from "react";

import { useParams } from "next/navigation";

import { BackLink } from "@/components/BackLink";
import { DatePicker } from "@/components/DatePicker";
import { DocNameField } from "@/components/DocNameField";
import { Select } from "@/components/Select";
import { EstimatePreview } from "@/components/estimates/EstimatePreview";
import {
  EstimateContent,
  EstimateLineItem,
  defaultLineItem,
  estimateSubtotal,
  lineAmount,
  mergedEstimateContent,
} from "@/lib/estimateContent";
import { api, ApiError, unwrapList } from "@/lib/api";
import { openUploadedFile } from "@/lib/files";
import { useToast } from "@/lib/toast";
import { useDirtySnapshot, useUnsavedChanges } from "@/lib/useUnsavedChanges";

type Client = { id: number; name: string };

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
];

export default function EstimateBuilderPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<EstimateContent | null>(null);
  const [docName, setDocName] = useState("");
  const [status, setStatus] = useState("draft");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);

  const formState = useMemo(() => ({ content, docName, status }), [content, docName, status]);
  const { dirty, markClean } = useDirtySnapshot(formState, !loading && !!content);
  const { ConfirmDialog } = useUnsavedChanges(dirty);

  useEffect(() => {
    api<Client[] | { results: Client[] }>("/api/sales/clients")
      .then((d) => setClients(unwrapList(d)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api<{ content: EstimateContent; status: string; title: string }>(`/api/sales/estimates/${id}`)
      .then((e) => {
        const merged = mergedEstimateContent(e.content);
        setContent(merged);
        setDocName(e.title || (merged.quote_number ? `Quote ${merged.quote_number}` : "Untitled Estimate"));
        setStatus(e.status);
      })
      .catch(() => showToast("Couldn't load estimate.", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const clientOptions = useMemo(
    () => [{ value: "", label: "— Custom / not in list —" }, ...clients.map((c) => ({ value: String(c.id), label: c.name }))],
    [clients]
  );

  const patch = (partial: Partial<EstimateContent>) => {
    setContent((prev) => (prev ? { ...prev, ...partial } : prev));
  };

  const pickClient = (clientId: string) => {
    if (!clientId) {
      patch({ client_id: null });
      return;
    }
    const c = clients.find((x) => String(x.id) === clientId);
    if (!c) return;
    patch({ client_id: c.id, bill_to: c.name });
  };

  const updateItem = (idx: number, partial: Partial<EstimateLineItem>) => {
    setContent((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((item, i) => (i === idx ? { ...item, ...partial } : item)),
      };
    });
  };

  const addItem = () => setContent((prev) => (prev ? { ...prev, items: [...prev.items, defaultLineItem()] } : prev));
  const removeItem = (idx: number) =>
    setContent((prev) => {
      if (!prev) return prev;
      const next = prev.items.filter((_, i) => i !== idx);
      return { ...prev, items: next.length ? next : [defaultLineItem()] };
    });

  const save = async (): Promise<boolean> => {
    if (!content) return false;
    setSaving(true);
    try {
      const nextName = docName.trim() || (content.quote_number ? `Quote ${content.quote_number}` : "Untitled Estimate");
      await api(`/api/sales/estimates/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          content,
          status,
          client: content.client_id,
          title: nextName,
        }),
      });
      setDocName(nextName);
      markClean({ content, docName: nextName, status });
      showToast("Estimate saved.");
      return true;
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't save estimate." : err.message, "error");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const exportPdf = async () => {
    const ok = await save();
    if (!ok) return;
    setExporting(true);
    try {
      const res = await api<{ file_url: string }>(`/api/sales/estimates/${id}/pdf`, { method: "POST" });
      void openUploadedFile(res.file_url);
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't export PDF." : err.message, "error");
    } finally {
      setExporting(false);
    }
  };

  if (loading || !content) {
    return <p className="muted">Loading estimate…</p>;
  }

  const total = estimateSubtotal(content.items);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {ConfirmDialog}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
        <div>
          <BackLink href="/sales/proposals" label="Back to Proposals" />
          <DocNameField
            value={docName}
            onChange={setDocName}
            ariaLabel="Estimate name"
            placeholder="Untitled Estimate"
          />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ width: 150 }}>
            <Select value={status} onChange={setStatus} options={STATUS_OPTIONS} ariaLabel="Status" />
          </div>
          <button className="btn btn-ghost" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button className="btn btn-accent" disabled={exporting} onClick={exportPdf}>
            <i className="bi bi-file-earmark-pdf-fill" /> {exporting ? "Exporting…" : "Export PDF"}
          </button>
        </div>
      </div>

      <div className="proposal-builder-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="section-card">
            <div className="section-card-head">
              <i className="bi bi-receipt" style={{ color: "var(--gold)", fontSize: 16 }} />
              <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>Quote details</span>
            </div>
            <div className="section-card-body">
              <div style={fieldGrid}>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Quotation number</label>
                  <input
                    className="input"
                    value={content.quote_number}
                    onChange={(e) => patch({ quote_number: e.target.value })}
                    placeholder="KF/QTN/05/0261"
                  />
                </div>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Currency</label>
                  <input className="input" value={content.currency} onChange={(e) => patch({ currency: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="field-label">Pick a client</label>
                <Select
                  value={content.client_id ? String(content.client_id) : ""}
                  onChange={pickClient}
                  options={clientOptions}
                  ariaLabel="Client"
                />
              </div>
              <div>
                <label className="field-label">Bill To</label>
                <input
                  className="input"
                  value={content.bill_to}
                  onChange={(e) => patch({ bill_to: e.target.value, client_id: content.client_id })}
                  placeholder="Client / company name"
                />
              </div>
              <div style={fieldGrid}>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Date</label>
                  <DatePicker value={content.date || ""} onChange={(v) => patch({ date: v || null })} ariaLabel="Quote date" />
                </div>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Expiry date</label>
                  <DatePicker
                    value={content.expiry_date || ""}
                    onChange={(v) => patch({ expiry_date: v || null })}
                    ariaLabel="Expiry date"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="section-card">
            <div className="section-card-head">
              <i className="bi bi-list-ul" style={{ color: "var(--gold)", fontSize: 16 }} />
              <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>Line items</span>
            </div>
            <div className="section-card-body">
              {content.items.map((item, idx) => (
                <div key={idx} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Item {idx + 1}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ color: "var(--danger)" }}
                      onClick={() => removeItem(idx)}
                    >
                      <i className="bi bi-trash-fill" />
                    </button>
                  </div>
                  <div>
                    <label className="field-label" style={{ marginTop: 0 }}>Item &amp; description</label>
                    <input
                      className="input"
                      value={item.description}
                      onChange={(e) => updateItem(idx, { description: e.target.value })}
                      placeholder="Website Design And Development"
                    />
                  </div>
                  <div>
                    <label className="field-label">Details</label>
                    <textarea
                      className="input"
                      rows={3}
                      value={item.details}
                      onChange={(e) => updateItem(idx, { details: e.target.value })}
                      placeholder={"Template-based design\nSEO setup\n..."}
                      style={{ resize: "vertical" }}
                    />
                  </div>
                  <div style={fieldGrid}>
                    <div>
                      <label className="field-label" style={{ marginTop: 0 }}>Qty</label>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.qty}
                        onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="field-label" style={{ marginTop: 0 }}>Rate</label>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.rate}
                        onChange={(e) => updateItem(idx, { rate: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="field-label" style={{ marginTop: 0 }}>Amount</label>
                      <input className="input" value={lineAmount(item).toFixed(2)} readOnly />
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" onClick={addItem}>
                <i className="bi bi-plus-lg" /> Add item
              </button>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Subtotal: <strong>{content.currency}{total.toFixed(2)}</strong>
              </p>
            </div>
          </div>

          <div className="section-card">
            <div className="section-card-head">
              <i className="bi bi-file-text-fill" style={{ color: "var(--gold)", fontSize: 16 }} />
              <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>Notes &amp; terms</span>
            </div>
            <div className="section-card-body">
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Notes</label>
                <textarea
                  className="input"
                  rows={2}
                  value={content.notes}
                  onChange={(e) => patch({ notes: e.target.value })}
                  style={{ resize: "vertical" }}
                />
              </div>
              <div>
                <label className="field-label">Terms &amp; conditions</label>
                <textarea
                  className="input"
                  rows={8}
                  value={content.terms}
                  onChange={(e) => patch({ terms: e.target.value })}
                  style={{ resize: "vertical" }}
                />
              </div>
            </div>
          </div>
        </div>

        <div style={{ position: "sticky", top: 16, alignSelf: "flex-start" }}>
          <EstimatePreview content={content} />
        </div>
      </div>
    </div>
  );
}

const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 14,
};
