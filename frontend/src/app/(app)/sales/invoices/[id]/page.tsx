"use client";

import { useEffect, useMemo, useState } from "react";

import { useParams } from "next/navigation";

import { BackLink } from "@/components/BackLink";
import { DatePicker } from "@/components/DatePicker";
import { DocNameField } from "@/components/DocNameField";
import { Select } from "@/components/Select";
import { InvoicePreview } from "@/components/invoices/InvoicePreview";
import {
  InvoiceContent,
  InvoiceLineItem,
  InvoicePayment,
  defaultLineItem,
  invoiceSubtotal,
  lineAmount,
  mergedInvoiceContent,
} from "@/lib/invoiceContent";
import { api, ApiError, unwrapList } from "@/lib/api";
import { sendDocumentViaEmail } from "@/lib/sendDocumentEmail";
import { useToast } from "@/lib/toast";
import { useDirtySnapshot, useUnsavedChanges } from "@/lib/useUnsavedChanges";

type Client = { id: number; name: string; contact_email?: string };

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];

export default function InvoiceBuilderPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<InvoiceContent | null>(null);
  const [status, setStatus] = useState("draft");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sending, setSending] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);

  const formState = useMemo(() => ({ content, status }), [content, status]);
  const { dirty, markClean } = useDirtySnapshot(formState, !loading && !!content);
  const { ConfirmDialog } = useUnsavedChanges(dirty);

  useEffect(() => {
    api<Client[] | { results: Client[] }>("/api/sales/clients")
      .then((d) => setClients(unwrapList(d)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api<{ content: InvoiceContent; status: string; invoice_number: string }>(`/api/sales/invoices/${id}`)
      .then((inv) => {
        const merged = mergedInvoiceContent(inv.content);
        if (!merged.invoice_number && inv.invoice_number) {
          merged.invoice_number = inv.invoice_number;
        }
        setContent(merged);
        setStatus(inv.status);
      })
      .catch(() => showToast("Couldn't load invoice.", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const clientOptions = useMemo(
    () => [{ value: "", label: "— Custom / not in list —" }, ...clients.map((c) => ({ value: String(c.id), label: c.name }))],
    [clients]
  );

  const patch = (partial: Partial<InvoiceContent>) => {
    setContent((prev) => (prev ? { ...prev, ...partial } : prev));
  };

  const patchPayment = (partial: Partial<InvoicePayment>) => {
    setContent((prev) => (prev ? { ...prev, payment: { ...prev.payment, ...partial } } : prev));
  };

  const pickClient = (clientId: string) => {
    if (!clientId) {
      patch({ client_id: null });
      return;
    }
    const c = clients.find((x) => String(x.id) === clientId);
    if (!c) return;
    patch({
      client_id: c.id,
      bill_to: c.name,
      bill_to_email: c.contact_email || "",
    });
  };

  const updateItem = (idx: number, partial: Partial<InvoiceLineItem>) => {
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
      const updated = await api<{ content: InvoiceContent; invoice_number: string }>(`/api/sales/invoices/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          content,
          status,
          client: content.client_id,
        }),
      });
      const next = mergedInvoiceContent(updated.content);
      setContent(next);
      markClean({ content: next, status });
      showToast("Invoice saved.");
      return true;
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't save invoice." : err.message, "error");
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
      const res = await api<{ file_url: string }>(`/api/sales/invoices/${id}/pdf`, { method: "POST" });
      window.open(res.file_url, "_blank");
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't export PDF." : err.message, "error");
    } finally {
      setExporting(false);
    }
  };

  const sendToEmail = async () => {
    if (!content) return;
    const ok = await save();
    if (!ok) return;
    setSending(true);
    try {
      const res = await api<{ file_url: string }>(`/api/sales/invoices/${id}/pdf`, { method: "POST" });
      const name = content.title || content.invoice_number || `Invoice-${id}`;
      await sendDocumentViaEmail({
        pdfUrl: res.file_url,
        to: content.bill_to_email,
        subject: name,
        body: `Please find the attached invoice${content.invoice_number ? ` #${content.invoice_number}` : ""}.\n\nAttach the downloaded PDF if it is not already attached, then send.`,
        filename: `${name.replace(/[^\w\-]+/g, "_")}.pdf`,
      });
      showToast(
        content.bill_to_email
          ? "Email draft opened. Attach the downloaded PDF before sending."
          : "PDF downloaded. Add a recipient email, or pick one in your mail app."
      );
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't prepare email." : err.message, "error");
    } finally {
      setSending(false);
    }
  };

  if (loading || !content) {
    return <p className="muted">Loading invoice…</p>;
  }

  const total = invoiceSubtotal(content.items);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {ConfirmDialog}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
        <div>
          <BackLink href="/sales/invoices" label="Back to Invoices" />
          <DocNameField
            value={content.title || ""}
            onChange={(v) => patch({ title: v })}
            ariaLabel="Invoice name"
            placeholder="Invoice"
          />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ width: 150 }}>
            <Select value={status} onChange={setStatus} options={STATUS_OPTIONS} ariaLabel="Status" />
          </div>
          <button className="btn btn-ghost" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button className="btn btn-ghost" disabled={sending || exporting} onClick={sendToEmail}>
            <i className="bi bi-envelope" /> {sending ? "Preparing…" : "Send to"}
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
              <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>Invoice details</span>
            </div>
            <div className="section-card-body">
              <div style={fieldGrid}>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Invoice number</label>
                  <input
                    className="input"
                    value={content.invoice_number}
                    onChange={(e) => patch({ invoice_number: e.target.value })}
                    placeholder="VL26000012"
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
                  onChange={(e) => patch({ bill_to: e.target.value })}
                  placeholder="Client / company name"
                />
              </div>
              <div>
                <label className="field-label">Bill To email</label>
                <input
                  className="input"
                  type="email"
                  value={content.bill_to_email}
                  onChange={(e) => patch({ bill_to_email: e.target.value })}
                  placeholder="client@example.com"
                />
              </div>
              <div style={fieldGrid}>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Invoice date</label>
                  <DatePicker value={content.date || ""} onChange={(v) => patch({ date: v || null })} ariaLabel="Invoice date" />
                </div>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Due date</label>
                  <DatePicker
                    value={content.due_date || ""}
                    onChange={(v) => patch({ due_date: v || null })}
                    ariaLabel="Due date"
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
                      placeholder="Social media"
                    />
                  </div>
                  <div>
                    <label className="field-label">Details</label>
                    <textarea
                      className="input"
                      rows={3}
                      value={item.details}
                      onChange={(e) => updateItem(idx, { details: e.target.value })}
                      placeholder={"Content creation\nScheduling\n..."}
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
                Subtotal: <strong>{content.currency} {total.toFixed(2)}</strong>
              </p>
            </div>
          </div>

          {content.invoice_kind === "petty_cash" ? (
            <div className="section-card">
              <div className="section-card-head">
                <i className="bi bi-person-check" style={{ color: "var(--gold)", fontSize: 16 }} />
                <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>Authorization</span>
              </div>
              <div className="section-card-body">
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Received by</label>
                  <input
                    className="input"
                    value={content.received_by || ""}
                    onChange={(e) => patch({ received_by: e.target.value })}
                    placeholder="Name of person who received"
                  />
                </div>
                <div>
                  <label className="field-label">Passed by</label>
                  <input
                    className="input"
                    value={content.passed_by || ""}
                    onChange={(e) => patch({ passed_by: e.target.value })}
                    placeholder="Name of person who passed / approved"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="section-card">
              <div className="section-card-head">
                <i className="bi bi-bank" style={{ color: "var(--gold)", fontSize: 16 }} />
                <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>Payment details</span>
              </div>
              <div className="section-card-body">
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Payment method</label>
                  <input
                    className="input"
                    value={content.payment.payment_method}
                    onChange={(e) => patchPayment({ payment_method: e.target.value })}
                  />
                </div>
                <div>
                  <label className="field-label">Bank name</label>
                  <input
                    className="input"
                    value={content.payment.bank_name}
                    onChange={(e) => patchPayment({ bank_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="field-label">Account name</label>
                  <input
                    className="input"
                    value={content.payment.account_name}
                    onChange={(e) => patchPayment({ account_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="field-label">IBAN / Account number</label>
                  <input
                    className="input"
                    value={content.payment.iban}
                    onChange={(e) => patchPayment({ iban: e.target.value })}
                  />
                </div>
                <div>
                  <label className="field-label">Paid amount</label>
                  <input
                    className="input"
                    value={content.payment.paid_amount}
                    onChange={(e) => patchPayment({ paid_amount: e.target.value })}
                    placeholder="AED 0.00"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="section-card">
            <div className="section-card-head">
              <i className="bi bi-file-text-fill" style={{ color: "var(--gold)", fontSize: 16 }} />
              <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>Notes</span>
            </div>
            <div className="section-card-body">
              <textarea
                className="input"
                rows={3}
                value={content.notes}
                onChange={(e) => patch({ notes: e.target.value })}
                style={{ resize: "vertical" }}
              />
            </div>
          </div>
        </div>

        <div style={{ position: "sticky", top: 16, alignSelf: "flex-start" }}>
          <InvoicePreview content={content} />
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
