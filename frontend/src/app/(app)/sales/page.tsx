"use client";

import { useEffect, useMemo, useState } from "react";

import { DatePicker } from "@/components/DatePicker";
import { Select } from "@/components/Select";
import { api, ApiError, unwrapList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

type Tab = "clients" | "proposals" | "invoices";

type Client = {
  id: number;
  name: string;
  contact_email: string;
  contact_phone: string;
  company: string;
  notes: string;
  created_at: string;
};

type ProposalStatus = "draft" | "sent" | "accepted" | "rejected";

type Proposal = {
  id: number;
  client: number;
  client_name: string;
  title: string;
  status: ProposalStatus;
  amount: string;
  valid_until: string | null;
  created_at: string;
};

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

const PROPOSAL_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
];
const PROPOSAL_STATUS_FILTER_OPTIONS = [{ value: "", label: "All Statuses" }, ...PROPOSAL_STATUS_OPTIONS];
const PROPOSAL_STATUS_BADGE: Record<ProposalStatus, string> = {
  draft: "badge-muted",
  sent: "badge-warning",
  accepted: "badge-success",
  rejected: "badge-danger",
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

const emptyClientForm = { name: "", contact_email: "", contact_phone: "", company: "", notes: "" };
const emptyProposalForm = { client: "", title: "", status: "draft", amount: "", valid_until: "" };
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

export default function SalesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isManager = user?.role === "manager";

  const [tab, setTab] = useState<Tab>("clients");

  // ---------------- Clients ----------------
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
    if (!isManager) return;
    const timer = setTimeout(loadClients, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, clientSearch]);

  const clientOptions = useMemo(
    () => clients.map((c) => ({ value: String(c.id), label: c.name })),
    [clients]
  );
  const clientFilterOptions = useMemo(
    () => [{ value: "", label: "All Clients" }, ...clientOptions],
    [clientOptions]
  );

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

  // ---------------- Proposals ----------------
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(true);
  const [proposalStatusFilter, setProposalStatusFilter] = useState("");
  const [proposalClientFilter, setProposalClientFilter] = useState("");
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [proposalForm, setProposalForm] = useState(emptyProposalForm);
  const [editingProposalId, setEditingProposalId] = useState<number | null>(null);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [proposalSaving, setProposalSaving] = useState(false);
  const [proposalBusyId, setProposalBusyId] = useState<number | null>(null);

  const loadProposals = () => {
    setProposalsLoading(true);
    const params = new URLSearchParams();
    if (proposalStatusFilter) params.set("status", proposalStatusFilter);
    if (proposalClientFilter) params.set("client", proposalClientFilter);
    const qs = params.toString();
    api<Proposal[] | { results: Proposal[] }>(`/api/sales/proposals${qs ? `?${qs}` : ""}`)
      .then((d) => setProposals(unwrapList(d)))
      .catch(() => {})
      .finally(() => setProposalsLoading(false));
  };

  useEffect(() => {
    if (!isManager) return;
    loadProposals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, proposalStatusFilter, proposalClientFilter]);

  const resetProposalForm = () => {
    setProposalForm(emptyProposalForm);
    setEditingProposalId(null);
    setShowProposalForm(false);
    setProposalError(null);
  };

  const startEditProposal = (p: Proposal) => {
    setEditingProposalId(p.id);
    setProposalForm({
      client: String(p.client),
      title: p.title,
      status: p.status,
      amount: p.amount ?? "",
      valid_until: p.valid_until ?? "",
    });
    setShowProposalForm(true);
  };

  const submitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    setProposalError(null);
    if (!proposalForm.client) {
      setProposalError("Please select a client.");
      return;
    }
    setProposalSaving(true);
    try {
      const payload = {
        client: Number(proposalForm.client),
        title: proposalForm.title,
        status: proposalForm.status,
        amount: proposalForm.amount || "0",
        valid_until: proposalForm.valid_until || null,
      };
      if (editingProposalId) {
        await api(`/api/sales/proposals/${editingProposalId}`, { method: "PATCH", body: JSON.stringify(payload) });
        showToast("Proposal updated.");
      } else {
        await api("/api/sales/proposals", { method: "POST", body: JSON.stringify(payload) });
        showToast("Proposal added.");
      }
      resetProposalForm();
      loadProposals();
    } catch (err: any) {
      setProposalError(err instanceof ApiError ? JSON.stringify(err.data) : err.message);
    } finally {
      setProposalSaving(false);
    }
  };

  const changeProposalStatus = async (id: number, status: string) => {
    setProposalBusyId(id);
    try {
      await api(`/api/sales/proposals/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, status: status as ProposalStatus } : p)));
      showToast("Proposal status updated.");
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't update proposal status." : err.message, "error");
    } finally {
      setProposalBusyId(null);
    }
  };

  const deleteProposal = async (id: number) => {
    setProposalBusyId(id);
    try {
      await api(`/api/sales/proposals/${id}`, { method: "DELETE" });
      showToast("Proposal deleted.");
      if (editingProposalId === id) resetProposalForm();
      loadProposals();
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't delete proposal." : err.message, "error");
    } finally {
      setProposalBusyId(null);
    }
  };

  // ---------------- Invoices ----------------
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
    if (!isManager) return;
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, invoiceStatusFilter, invoiceClientFilter]);

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

  if (!isManager) {
    return <p className="muted">Manager access required.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22 }}>Sales</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Clients, proposals and invoices.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          className={tab === "clients" ? "btn btn-accent btn-sm" : "btn btn-ghost btn-sm"}
          onClick={() => setTab("clients")}
        >
          <i className="bi bi-person-lines-fill" /> Clients
        </button>
        <button
          className={tab === "proposals" ? "btn btn-accent btn-sm" : "btn btn-ghost btn-sm"}
          onClick={() => setTab("proposals")}
        >
          <i className="bi bi-file-earmark-text-fill" /> Proposals
        </button>
        <button
          className={tab === "invoices" ? "btn btn-accent btn-sm" : "btn btn-ghost btn-sm"}
          onClick={() => setTab("invoices")}
        >
          <i className="bi bi-receipt" /> Invoices
        </button>
      </div>

      {tab === "clients" && (
        <>
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
        </>
      )}

      {tab === "proposals" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ width: 180 }}>
                <Select value={proposalStatusFilter} onChange={setProposalStatusFilter} options={PROPOSAL_STATUS_FILTER_OPTIONS} ariaLabel="Filter by status" />
              </div>
              <div style={{ width: 200 }}>
                <Select value={proposalClientFilter} onChange={setProposalClientFilter} options={clientFilterOptions} ariaLabel="Filter by client" />
              </div>
            </div>
            <button
              className="btn btn-accent"
              onClick={() => (showProposalForm ? resetProposalForm() : setShowProposalForm(true))}
            >
              <i className="bi bi-plus-lg" /> Add Proposal
            </button>
          </div>

          {showProposalForm && (
            <form className="card" onSubmit={submitProposal}>
              <span className="card-title">{editingProposalId ? "Edit Proposal" : "New Proposal"}</span>
              <div style={{ ...fieldGrid, marginTop: 14 }}>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Client</label>
                  <Select
                    value={proposalForm.client}
                    onChange={(v) => setProposalForm((f) => ({ ...f, client: v }))}
                    options={clientOptions}
                    ariaLabel="Client"
                  />
                </div>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Title</label>
                  <input
                    className="input"
                    value={proposalForm.title}
                    onChange={(e) => setProposalForm((f) => ({ ...f, title: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Status</label>
                  <Select
                    value={proposalForm.status}
                    onChange={(v) => setProposalForm((f) => ({ ...f, status: v }))}
                    options={PROPOSAL_STATUS_OPTIONS}
                    ariaLabel="Status"
                  />
                </div>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Amount</label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={proposalForm.amount}
                    onChange={(e) => setProposalForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Valid until</label>
                  <DatePicker
                    value={proposalForm.valid_until}
                    onChange={(v) => setProposalForm((f) => ({ ...f, valid_until: v }))}
                    ariaLabel="Valid until"
                  />
                </div>
              </div>
              {proposalError && <p style={{ color: "var(--danger)", fontSize: 13, margin: "10px 0 0" }}>{proposalError}</p>}
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button className="btn" disabled={proposalSaving}>
                  {proposalSaving ? "Saving…" : editingProposalId ? "Save changes" : "Add proposal"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={resetProposalForm}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="card">
            <span className="card-title">
              <i className="bi bi-file-earmark-text-fill" style={{ color: "var(--gold)" }} />
              All Proposals
            </span>
            {proposalsLoading && <p className="muted">Loading…</p>}
            {!proposalsLoading && proposals.length === 0 && <p className="muted">No proposals yet.</p>}
            {!proposalsLoading && proposals.length > 0 && (
              <div className="table-wrap">
                <table className="kwick-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Title</th>
                      <th>Status</th>
                      <th>Amount</th>
                      <th>Valid Until</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposals.map((p) => (
                      <tr key={p.id}>
                        <td>{p.client_name}</td>
                        <td style={{ fontWeight: 600, color: "var(--navy)" }}>{p.title}</td>
                        <td>
                          <span className={`badge ${PROPOSAL_STATUS_BADGE[p.status]}`}>{p.status}</span>
                        </td>
                        <td>{formatCurrency(p.amount)}</td>
                        <td>{formatDate(p.valid_until)}</td>
                        <td>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <div style={{ width: 130 }}>
                              <Select
                                value={p.status}
                                onChange={(v) => changeProposalStatus(p.id, v)}
                                options={PROPOSAL_STATUS_OPTIONS}
                                compact
                                ariaLabel="Change status"
                              />
                            </div>
                            <button className="btn btn-ghost btn-sm" onClick={() => startEditProposal(p)}>
                              <i className="bi bi-pencil-fill" /> Edit
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: "var(--danger)" }}
                              disabled={proposalBusyId === p.id}
                              onClick={() => deleteProposal(p.id)}
                            >
                              {proposalBusyId === p.id ? "…" : "Delete"}
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
        </>
      )}

      {tab === "invoices" && (
        <>
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
        </>
      )}
    </div>
  );
}

const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};
