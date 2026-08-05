"use client";

import { useEffect, useMemo, useState } from "react";

import { DatePicker } from "@/components/DatePicker";
import { Select } from "@/components/Select";
import { api, ApiError, unwrapList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

type Client = { id: number; name: string };
type Proposal = { id: number; client: number; title: string };

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

type LineItem = {
  id?: number;
  description: string;
  quantity: string;
  unit_price: string;
  line_total?: string;
};

type Invoice = {
  id: number;
  client: number;
  client_name: string;
  proposal: number | null;
  invoice_number: string;
  amount: string;
  status: InvoiceStatus;
  due_date: string | null;
  line_items: LineItem[];
  created_at: string;
};

const INVOICE_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];
const INVOICE_STATUS_FILTER_OPTIONS = [{ value: "", label: "All Statuses" }, ...INVOICE_STATUS_OPTIONS];
const INVOICE_STATUS_BADGE: Record<InvoiceStatus, string> = {
  draft: "badge-muted",
  sent: "badge-warning",
  paid: "badge-success",
  overdue: "badge-danger",
};

const emptyInvoiceForm = {
  client: "",
  proposal: "",
  invoice_number: "",
  amount: "",
  status: "draft",
  due_date: "",
};
const emptyLineItem = () => ({ description: "", quantity: "1", unit_price: "0" });

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatCurrency(amount: string | number | null | undefined) {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SalesInvoicesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isSuperadmin = user?.role === "superadmin";
  const hasAccess = isSuperadmin || (user?.module_access ?? []).includes("sales");

  const [clients, setClients] = useState<Client[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);

  useEffect(() => {
    if (!hasAccess) return;
    api<Client[] | { results: Client[] }>("/api/sales/clients")
      .then((d) => setClients(unwrapList(d)))
      .catch(() => {});
    api<Proposal[] | { results: Proposal[] }>("/api/sales/proposals")
      .then((d) => setProposals(unwrapList(d)))
      .catch(() => {});
  }, [hasAccess]);

  const clientOptions = useMemo(
    () => clients.map((c) => ({ value: String(c.id), label: c.name })),
    [clients]
  );
  const clientFilterOptions = useMemo(
    () => [{ value: "", label: "All Clients" }, ...clientOptions],
    [clientOptions]
  );

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("");
  const [invoiceClientFilter, setInvoiceClientFilter] = useState("");
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoiceForm);
  const [invoiceLineItems, setInvoiceLineItems] = useState<{ description: string; quantity: string; unit_price: string }[]>([]);
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [invoiceBusyId, setInvoiceBusyId] = useState<number | null>(null);

  const loadInvoices = () => {
    setInvoicesLoading(true);
    const params = new URLSearchParams();
    if (invoiceStatusFilter) params.set("status", invoiceStatusFilter);
    if (invoiceClientFilter) params.set("client", invoiceClientFilter);
    const qs = params.toString();
    api<Invoice[] | { results: Invoice[] }>(`/api/sales/invoices${qs ? `?${qs}` : ""}`)
      .then((d) => setInvoices(unwrapList(d)))
      .catch(() => {})
      .finally(() => setInvoicesLoading(false));
  };

  useEffect(() => {
    if (!hasAccess) return;
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess, invoiceStatusFilter, invoiceClientFilter]);

  const proposalOptionsForInvoiceForm = useMemo(() => {
    const relevant = invoiceForm.client
      ? proposals.filter((p) => p.client === Number(invoiceForm.client))
      : proposals;
    return [{ value: "", label: "None" }, ...relevant.map((p) => ({ value: String(p.id), label: p.title }))];
  }, [proposals, invoiceForm.client]);

  const resetInvoiceForm = () => {
    setInvoiceForm(emptyInvoiceForm);
    setInvoiceLineItems([]);
    setEditingInvoiceId(null);
    setShowInvoiceForm(false);
    setInvoiceError(null);
  };

  const startEditInvoice = (inv: Invoice) => {
    setEditingInvoiceId(inv.id);
    setInvoiceForm({
      client: String(inv.client),
      proposal: inv.proposal ? String(inv.proposal) : "",
      invoice_number: inv.invoice_number,
      amount: inv.amount ?? "",
      status: inv.status,
      due_date: inv.due_date ?? "",
    });
    setInvoiceLineItems(
      (inv.line_items || []).map((li) => ({
        description: li.description,
        quantity: String(li.quantity),
        unit_price: String(li.unit_price),
      }))
    );
    setShowInvoiceForm(true);
  };

  const addLineItem = () => setInvoiceLineItems((prev) => [...prev, emptyLineItem()]);
  const updateLineItem = (idx: number, key: "description" | "quantity" | "unit_price", value: string) =>
    setInvoiceLineItems((prev) => prev.map((li, i) => (i === idx ? { ...li, [key]: value } : li)));
  const removeLineItem = (idx: number) => setInvoiceLineItems((prev) => prev.filter((_, i) => i !== idx));

  const submitInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setInvoiceError(null);
    if (!invoiceForm.client) {
      setInvoiceError("Please select a client.");
      return;
    }
    if (!invoiceForm.invoice_number.trim()) {
      setInvoiceError("Please enter an invoice number.");
      return;
    }
    setInvoiceSaving(true);
    try {
      const payload = {
        client: Number(invoiceForm.client),
        proposal: invoiceForm.proposal ? Number(invoiceForm.proposal) : null,
        invoice_number: invoiceForm.invoice_number.trim(),
        amount: invoiceForm.amount || "0",
        status: invoiceForm.status,
        due_date: invoiceForm.due_date || null,
        line_items: invoiceLineItems.map((li) => ({
          description: li.description,
          quantity: li.quantity || "1",
          unit_price: li.unit_price || "0",
        })),
      };
      if (editingInvoiceId) {
        await api(`/api/sales/invoices/${editingInvoiceId}`, { method: "PATCH", body: JSON.stringify(payload) });
        showToast("Invoice updated.");
      } else {
        await api("/api/sales/invoices", { method: "POST", body: JSON.stringify(payload) });
        showToast("Invoice added.");
      }
      resetInvoiceForm();
      loadInvoices();
    } catch (err: any) {
      setInvoiceError(err instanceof ApiError ? JSON.stringify(err.data) : err.message);
    } finally {
      setInvoiceSaving(false);
    }
  };

  const changeInvoiceStatus = async (id: number, status: string) => {
    setInvoiceBusyId(id);
    try {
      await api(`/api/sales/invoices/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setInvoices((prev) => prev.map((inv) => (inv.id === id ? { ...inv, status: status as InvoiceStatus } : inv)));
      showToast("Invoice status updated.");
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't update invoice status." : err.message, "error");
    } finally {
      setInvoiceBusyId(null);
    }
  };

  const deleteInvoice = async (id: number) => {
    setInvoiceBusyId(id);
    try {
      await api(`/api/sales/invoices/${id}`, { method: "DELETE" });
      showToast("Invoice deleted.");
      if (editingInvoiceId === id) resetInvoiceForm();
      loadInvoices();
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't delete invoice." : err.message, "error");
    } finally {
      setInvoiceBusyId(null);
    }
  };

  const generateInvoicePdf = async (id: number) => {
    setInvoiceBusyId(id);
    try {
      const res = await api<{ file_url?: string }>(`/api/sales/invoices/${id}/pdf`, { method: "POST" });
      if (res?.file_url) {
        showToast("PDF generated — click to open.", "success", () => window.open(res.file_url, "_blank"));
      } else {
        showToast("PDF generation requested.", "info");
      }
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't generate PDF." : err.message, "error");
    } finally {
      setInvoiceBusyId(null);
    }
  };

  if (!user) return null;

  if (!hasAccess) {
    return <p className="muted">You don&apos;t have access to Sales.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22 }}>Invoices</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Client invoices and payment status.
        </p>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ width: 180 }}>
            <Select value={invoiceStatusFilter} onChange={setInvoiceStatusFilter} options={INVOICE_STATUS_FILTER_OPTIONS} ariaLabel="Filter by status" />
          </div>
          <div style={{ width: 200 }}>
            <Select value={invoiceClientFilter} onChange={setInvoiceClientFilter} options={clientFilterOptions} ariaLabel="Filter by client" />
          </div>
        </div>
        <button
          className="btn btn-accent"
          onClick={() => (showInvoiceForm ? resetInvoiceForm() : setShowInvoiceForm(true))}
        >
          <i className="bi bi-plus-lg" /> Add Invoice
        </button>
      </div>

      {showInvoiceForm && (
        <form className="card" onSubmit={submitInvoice}>
          <span className="card-title">{editingInvoiceId ? "Edit Invoice" : "New Invoice"}</span>
          <div style={{ ...fieldGrid, marginTop: 14 }}>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Client</label>
              <Select
                value={invoiceForm.client}
                onChange={(v) => setInvoiceForm((f) => ({ ...f, client: v, proposal: "" }))}
                options={clientOptions}
                ariaLabel="Client"
              />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Proposal (optional)</label>
              <Select
                value={invoiceForm.proposal}
                onChange={(v) => setInvoiceForm((f) => ({ ...f, proposal: v }))}
                options={proposalOptionsForInvoiceForm}
                ariaLabel="Proposal"
              />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Invoice number</label>
              <input
                className="input"
                value={invoiceForm.invoice_number}
                onChange={(e) => setInvoiceForm((f) => ({ ...f, invoice_number: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Amount</label>
              <input
                className="input"
                type="number"
                step="0.01"
                min="0"
                value={invoiceForm.amount}
                onChange={(e) => setInvoiceForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Status</label>
              <Select
                value={invoiceForm.status}
                onChange={(v) => setInvoiceForm((f) => ({ ...f, status: v }))}
                options={INVOICE_STATUS_OPTIONS}
                ariaLabel="Status"
              />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Due date</label>
              <DatePicker
                value={invoiceForm.due_date}
                onChange={(v) => setInvoiceForm((f) => ({ ...f, due_date: v }))}
                ariaLabel="Due date"
              />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label className="field-label" style={{ margin: 0 }}>Line items</label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addLineItem}>
                <i className="bi bi-plus-lg" /> Add line item
              </button>
            </div>
            {invoiceLineItems.length === 0 && (
              <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>No line items added.</p>
            )}
            {invoiceLineItems.map((li, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                <input
                  className="input"
                  placeholder="Description"
                  value={li.description}
                  onChange={(e) => updateLineItem(idx, "description", e.target.value)}
                  style={{ flex: 2, minWidth: 160 }}
                />
                <input
                  className="input"
                  type="number"
                  min="0"
                  placeholder="Qty"
                  value={li.quantity}
                  onChange={(e) => updateLineItem(idx, "quantity", e.target.value)}
                  style={{ width: 90 }}
                />
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Unit price"
                  value={li.unit_price}
                  onChange={(e) => updateLineItem(idx, "unit_price", e.target.value)}
                  style={{ width: 120 }}
                />
                <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => removeLineItem(idx)}>
                  <i className="bi bi-trash-fill" />
                </button>
              </div>
            ))}
          </div>

          {invoiceError && <p style={{ color: "var(--danger)", fontSize: 13, margin: "10px 0 0" }}>{invoiceError}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="btn" disabled={invoiceSaving}>
              {invoiceSaving ? "Saving…" : editingInvoiceId ? "Save changes" : "Add invoice"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={resetInvoiceForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="card">
        <span className="card-title">
          <i className="bi bi-receipt" style={{ color: "var(--gold)" }} />
          All Invoices
        </span>
        {invoicesLoading && <p className="muted">Loading…</p>}
        {!invoicesLoading && invoices.length === 0 && <p className="muted">No invoices yet.</p>}
        {!invoicesLoading && invoices.length > 0 && (
          <div className="table-wrap">
            <table className="kwick-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Due Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 600, color: "var(--navy)" }}>{inv.invoice_number}</td>
                    <td>{inv.client_name}</td>
                    <td>
                      <span className={`badge ${INVOICE_STATUS_BADGE[inv.status]}`}>{inv.status}</span>
                    </td>
                    <td>{formatCurrency(inv.amount)}</td>
                    <td>{formatDate(inv.due_date)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ width: 120 }}>
                          <Select
                            value={inv.status}
                            onChange={(v) => changeInvoiceStatus(inv.id, v)}
                            options={INVOICE_STATUS_OPTIONS}
                            compact
                            ariaLabel="Change status"
                          />
                        </div>
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={invoiceBusyId === inv.id}
                          onClick={() => generateInvoicePdf(inv.id)}
                        >
                          <i className="bi bi-file-earmark-pdf-fill" /> PDF
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => startEditInvoice(inv)}>
                          <i className="bi bi-pencil-fill" /> Edit
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--danger)" }}
                          disabled={invoiceBusyId === inv.id}
                          onClick={() => deleteInvoice(inv.id)}
                        >
                          {invoiceBusyId === inv.id ? "…" : "Delete"}
                        </button>
                      </div>
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
