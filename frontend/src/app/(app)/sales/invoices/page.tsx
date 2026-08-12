"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useConfirm } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";
import { Reveal } from "@/components/Reveal";
import { Select } from "@/components/Select";
import { api, ApiError, unwrapList } from "@/lib/api";
import { useAuth, hasModuleAccess } from "@/lib/auth";
import { InvoiceContent, InvoiceKind, defaultInvoiceContent, mergedInvoiceContent } from "@/lib/invoiceContent";
import { sendDocumentViaEmail } from "@/lib/sendDocumentEmail";
import { useToast } from "@/lib/toast";

type Client = { id: number; name: string };

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

type Invoice = {
  id: number;
  client: number | null;
  client_name: string;
  title: string;
  invoice_number: string;
  amount: string;
  status: InvoiceStatus;
  due_date: string | null;
  created_at: string;
  content?: Partial<InvoiceContent>;
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

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatCurrency(amount: string | number | null | undefined, currency = "AED") {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SalesInvoicesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const router = useRouter();
  const isSuperadmin = user?.role === "superadmin";
  const hasAccess = isSuperadmin || hasModuleAccess(user?.module_access, "sales_invoices");

  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [exportingId, setExportingId] = useState<number | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);

  useEffect(() => {
    if (!hasAccess) return;
    api<Client[] | { results: Client[] }>("/api/sales/clients")
      .then((d) => setClients(unwrapList(d)))
      .catch(() => {});
  }, [hasAccess]);

  const clientFilterOptions = useMemo(
    () => [{ value: "", label: "All Clients" }, ...clients.map((c) => ({ value: String(c.id), label: c.name }))],
    [clients]
  );

  const loadInvoices = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (clientFilter) params.set("client", clientFilter);
    if (search.trim()) params.set("search", search.trim());
    const qs = params.toString();
    api<Invoice[] | { results: Invoice[] }>(`/api/sales/invoices${qs ? `?${qs}` : ""}`)
      .then((d) => setInvoices(unwrapList(d)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!hasAccess) return;
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess, statusFilter, clientFilter, search]);

  const createInvoice = async (kind: InvoiceKind) => {
    setCreating(true);
    try {
      const created = await api<{ id: number }>("/api/sales/invoices", {
        method: "POST",
        body: JSON.stringify({ content: defaultInvoiceContent(kind) }),
      });
      setCreateOpen(false);
      router.push(`/sales/invoices/${created.id}`);
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't create invoice." : err.message, "error");
      setCreating(false);
    }
  };

  const changeStatus = async (id: number, status: string) => {
    setBusyId(id);
    try {
      await api(`/api/sales/invoices/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setInvoices((prev) => prev.map((inv) => (inv.id === id ? { ...inv, status: status as InvoiceStatus } : inv)));
      showToast("Invoice status updated.");
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't update invoice status." : err.message, "error");
    } finally {
      setBusyId(null);
    }
  };

  const deleteInvoice = async (inv: Invoice) => {
    const name = inv.title || inv.invoice_number || `Invoice #${inv.id}`;
    const ok = await confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`, {
      title: "Delete Invoice",
      danger: true,
      confirmLabel: "Delete",
    });
    if (!ok) return;

    setBusyId(inv.id);
    try {
      await api(`/api/sales/invoices/${inv.id}`, { method: "DELETE" });
      showToast("Invoice deleted.");
      loadInvoices();
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't delete invoice." : err.message, "error");
    } finally {
      setBusyId(null);
    }
  };

  const duplicateInvoice = async (inv: Invoice) => {
    setBusyId(inv.id);
    try {
      const created = await api<{ id: number }>(`/api/sales/invoices/${inv.id}/duplicate`, { method: "POST" });
      showToast("Invoice duplicated.");
      router.push(`/sales/invoices/${created.id}`);
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't duplicate invoice." : err.message, "error");
      setBusyId(null);
    }
  };

  const exportPdf = async (id: number) => {
    setExportingId(id);
    try {
      const res = await api<{ file_url: string }>(`/api/sales/invoices/${id}/pdf`, { method: "POST" });
      window.open(res.file_url, "_blank");
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't export PDF." : err.message, "error");
    } finally {
      setExportingId(null);
    }
  };

  const sendToEmail = async (inv: Invoice) => {
    setSendingId(inv.id);
    try {
      const detail = await api<{ content: InvoiceContent; title: string; invoice_number: string }>(
        `/api/sales/invoices/${inv.id}`
      );
      const content = mergedInvoiceContent(detail.content);
      const res = await api<{ file_url: string }>(`/api/sales/invoices/${inv.id}/pdf`, { method: "POST" });
      const name = detail.title || content.title || inv.invoice_number || `Invoice-${inv.id}`;
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
          : "PDF downloaded. Add a recipient email on the invoice, or pick one in your mail app."
      );
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't prepare email." : err.message, "error");
    } finally {
      setSendingId(null);
    }
  };

  if (!user) return null;

  if (!hasAccess) {
    return <p className="muted">You don&apos;t have access to Sales.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {ConfirmDialog}
      <Modal open={createOpen} onClose={() => !creating && setCreateOpen(false)} maxWidth={480}>
        <span className="card-title" style={{ margin: 0 }}>
          Create invoice
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={createOptionBtn}
            disabled={creating}
            onClick={() => createInvoice("petty_cash")}
          >
            <i className="bi bi-cash-coin" style={{ fontSize: 18, color: "var(--gold)" }} />
            <span style={{ textAlign: "left" }}>
              <strong style={{ display: "block", fontSize: 14 }}>Petty cash invoice</strong>
            </span>
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={createOptionBtn}
            disabled={creating}
            onClick={() => createInvoice("proforma")}
          >
            <i className="bi bi-file-earmark-text" style={{ fontSize: 18, color: "var(--gold)" }} />
            <span style={{ textAlign: "left" }}>
              <strong style={{ display: "block", fontSize: 14 }}>Proforma invoice</strong>
            </span>
          </button>
        </div>
      </Modal>

      <Reveal index={0}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>Invoices</h1>
          </div>
          <button className="btn btn-accent" disabled={creating} onClick={() => setCreateOpen(true)}>
            <i className="bi bi-plus-lg" /> {creating ? "Creating…" : "Add Invoice"}
          </button>
        </div>
      </Reveal>

      <Reveal index={1}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="input"
            placeholder="Search by name, number or client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 280, minWidth: 200 }}
          />
          <div style={{ width: 180 }}>
            <Select value={statusFilter} onChange={setStatusFilter} options={INVOICE_STATUS_FILTER_OPTIONS} ariaLabel="Filter by status" />
          </div>
          <div style={{ width: 200 }}>
            <Select value={clientFilter} onChange={setClientFilter} options={clientFilterOptions} ariaLabel="Filter by client" />
          </div>
        </div>
      </Reveal>

      <Reveal index={2}>
        <div className="card">
          <span className="card-title">
            <i className="bi bi-receipt" style={{ color: "var(--gold)" }} />
            All Invoices
          </span>
          {loading && <p className="muted">Loading…</p>}
          {!loading && invoices.length === 0 && <p className="muted">No invoices yet.</p>}
          {!loading && invoices.length > 0 && (
            <div className="table-wrap">
              <table className="kwick-table">
                <thead>
                  <tr>
                    <th>Name</th>
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
                      <td style={{ fontWeight: 600, color: "var(--navy)" }}>
                        <Link href={`/sales/invoices/${inv.id}`}>
                          {inv.title || inv.invoice_number || `Invoice #${inv.id}`}
                        </Link>
                        {inv.title && inv.invoice_number ? (
                          <div className="muted" style={{ fontSize: 12, fontWeight: 500, marginTop: 2 }}>
                            #{inv.invoice_number}
                          </div>
                        ) : null}
                      </td>
                      <td>{inv.client_name || "—"}</td>
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
                              onChange={(v) => changeStatus(inv.id, v)}
                              options={INVOICE_STATUS_OPTIONS}
                              compact
                              ariaLabel="Change status"
                            />
                          </div>
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={exportingId === inv.id}
                            onClick={() => exportPdf(inv.id)}
                          >
                            <i className="bi bi-file-earmark-pdf-fill" /> {exportingId === inv.id ? "…" : "PDF"}
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={sendingId === inv.id}
                            onClick={() => sendToEmail(inv)}
                            title="Open email draft with PDF"
                          >
                            <i className="bi bi-envelope" /> {sendingId === inv.id ? "…" : "Send to"}
                          </button>
                          <Link className="btn btn-ghost btn-sm" href={`/sales/invoices/${inv.id}`}>
                            <i className="bi bi-pencil-fill" /> Edit
                          </Link>
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={busyId === inv.id}
                            onClick={() => duplicateInvoice(inv)}
                            title="Duplicate"
                          >
                            <i className="bi bi-copy" /> Duplicate
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: "var(--danger)" }}
                            disabled={busyId === inv.id}
                            onClick={() => deleteInvoice(inv)}
                          >
                            {busyId === inv.id ? "…" : "Delete"}
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
      </Reveal>
    </div>
  );
}

const createOptionBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  padding: "14px 16px",
  height: "auto",
  textAlign: "left",
  justifyContent: "flex-start",
};
