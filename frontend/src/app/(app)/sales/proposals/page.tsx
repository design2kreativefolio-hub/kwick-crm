"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useConfirm } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";
import { Select } from "@/components/Select";
import { api, ApiError, formatApiError, unwrapList } from "@/lib/api";
import { useAuth, hasModuleAccess } from "@/lib/auth";
import { defaultEstimateContent } from "@/lib/estimateContent";
import { defaultContent } from "@/lib/proposalContent";
import { openUploadedFile } from "@/lib/files";
import { sendDocumentViaEmail } from "@/lib/sendDocumentEmail";
import { useToast } from "@/lib/toast";

type Client = { id: number; name: string };

type DocStatus = "draft" | "sent" | "accepted" | "rejected";

type ListDoc = {
  id: number;
  kind: "proposal" | "estimate";
  client: number | null;
  client_name: string;
  title: string;
  status: DocStatus;
  created_at: string;
};

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
];
const STATUS_FILTER_OPTIONS = [{ value: "", label: "All Statuses" }, ...STATUS_OPTIONS];
const STATUS_BADGE: Record<DocStatus, string> = {
  draft: "badge-muted",
  sent: "badge-warning",
  accepted: "badge-success",
  rejected: "badge-danger",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function SalesProposalsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const router = useRouter();
  const isSuperadmin = user?.role === "superadmin";
  const hasAccess = isSuperadmin || hasModuleAccess(user?.module_access, "sales_proposals");

  const [clients, setClients] = useState<Client[]>([]);
  const [docs, setDocs] = useState<ListDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [sendingKey, setSendingKey] = useState<string | null>(null);

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

  const loadDocs = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (clientFilter) params.set("client", clientFilter);
    if (search.trim()) params.set("search", search.trim());
    const qs = params.toString();
    Promise.all([
      api<any[] | { results: any[] }>(`/api/sales/proposals${qs ? `?${qs}` : ""}`).then(unwrapList).catch(() => []),
      api<any[] | { results: any[] }>(`/api/sales/estimates${qs ? `?${qs}` : ""}`).then(unwrapList).catch(() => []),
    ])
      .then(([proposals, estimates]) => {
        const merged: ListDoc[] = [
          ...proposals.map((p) => ({ ...p, kind: "proposal" as const })),
          ...estimates.map((e) => ({ ...e, kind: "estimate" as const })),
        ];
        merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setDocs(merged);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!hasAccess) return;
    loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess, statusFilter, clientFilter, search]);

  const createProposal = async () => {
    setCreating(true);
    try {
      const created = await api<{ id: number }>("/api/sales/proposals", {
        method: "POST",
        body: JSON.stringify({ content: defaultContent() }),
      });
      setCreateOpen(false);
      router.push(`/sales/proposals/${created.id}`);
    } catch (err: any) {
      showToast(err instanceof ApiError ? formatApiError(err.data) || "Couldn't create proposal." : err.message, "error");
      setCreating(false);
    }
  };

  const createEstimate = async () => {
    setCreating(true);
    try {
      const created = await api<{ id: number }>("/api/sales/estimates", {
        method: "POST",
        body: JSON.stringify({ content: defaultEstimateContent() }),
      });
      setCreateOpen(false);
      router.push(`/sales/estimates/${created.id}`);
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't create estimate." : err.message, "error");
      setCreating(false);
    }
  };

  const changeStatus = async (doc: ListDoc, status: string) => {
    const key = `${doc.kind}-${doc.id}`;
    setBusyKey(key);
    try {
      const path = doc.kind === "proposal" ? `/api/sales/proposals/${doc.id}` : `/api/sales/estimates/${doc.id}`;
      await api(path, { method: "PATCH", body: JSON.stringify({ status }) });
      setDocs((prev) => prev.map((d) => (d.kind === doc.kind && d.id === doc.id ? { ...d, status: status as DocStatus } : d)));
      showToast(`${doc.kind === "proposal" ? "Proposal" : "Estimate"} status updated.`);
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't update status." : err.message, "error");
    } finally {
      setBusyKey(null);
    }
  };

  const deleteDoc = async (doc: ListDoc) => {
    const kindLabel = doc.kind === "proposal" ? "proposal" : "estimate";
    const name = doc.title || (doc.kind === "proposal" ? "Untitled Proposal" : "Untitled Estimate");
    const ok = await confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`, {
      title: `Delete ${kindLabel === "proposal" ? "Proposal" : "Estimate"}`,
      danger: true,
      confirmLabel: "Delete",
    });
    if (!ok) return;

    const key = `${doc.kind}-${doc.id}`;
    setBusyKey(key);
    try {
      const path = doc.kind === "proposal" ? `/api/sales/proposals/${doc.id}` : `/api/sales/estimates/${doc.id}`;
      await api(path, { method: "DELETE" });
      showToast(`${doc.kind === "proposal" ? "Proposal" : "Estimate"} deleted.`);
      loadDocs();
    } catch (err: any) {
      showToast(err instanceof ApiError ? `Couldn't delete ${kindLabel}.` : err.message, "error");
    } finally {
      setBusyKey(null);
    }
  };

  const duplicateDoc = async (doc: ListDoc) => {
    const key = `${doc.kind}-${doc.id}`;
    setBusyKey(key);
    try {
      const path =
        doc.kind === "proposal"
          ? `/api/sales/proposals/${doc.id}/duplicate`
          : `/api/sales/estimates/${doc.id}/duplicate`;
      const created = await api<{ id: number }>(path, { method: "POST" });
      showToast(`${doc.kind === "proposal" ? "Proposal" : "Estimate"} duplicated.`);
      router.push(doc.kind === "proposal" ? `/sales/proposals/${created.id}` : `/sales/estimates/${created.id}`);
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't duplicate." : err.message, "error");
      setBusyKey(null);
    }
  };

  const exportPdf = async (doc: ListDoc) => {
    const key = `${doc.kind}-${doc.id}`;
    setExportingKey(key);
    try {
      const path =
        doc.kind === "proposal"
          ? `/api/sales/proposals/${doc.id}/pdf`
          : `/api/sales/estimates/${doc.id}/pdf`;
      const res = await api<{ file_url: string }>(path, { method: "POST" });
      void openUploadedFile(res.file_url);
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't export PDF." : err.message, "error");
    } finally {
      setExportingKey(null);
    }
  };

  const sendToEmail = async (doc: ListDoc) => {
    const key = `${doc.kind}-${doc.id}`;
    setSendingKey(key);
    try {
      let to = "";
      let subject = doc.title || (doc.kind === "proposal" ? "Proposal" : "Estimate");
      if (doc.kind === "proposal") {
        const detail = await api<{ content: any; title: string }>(`/api/sales/proposals/${doc.id}`);
        to = detail.content?.home?.client_email || "";
        subject = detail.title || subject;
        const res = await api<{ file_url: string }>(`/api/sales/proposals/${doc.id}/pdf`, { method: "POST" });
        await sendDocumentViaEmail({
          pdfUrl: res.file_url,
          to,
          subject,
          body: `Please find the attached proposal.\n\nAttach the downloaded PDF if it is not already attached, then send.`,
          filename: `${subject.replace(/[^\w\-]+/g, "_")}.pdf`,
        });
      } else {
        const detail = await api<{ content: any; title: string }>(`/api/sales/estimates/${doc.id}`);
        to = detail.content?.bill_to_email || "";
        subject = detail.title || subject;
        const res = await api<{ file_url: string }>(`/api/sales/estimates/${doc.id}/pdf`, { method: "POST" });
        await sendDocumentViaEmail({
          pdfUrl: res.file_url,
          to,
          subject,
          body: `Please find the attached estimate.\n\nAttach the downloaded PDF if it is not already attached, then send.`,
          filename: `${subject.replace(/[^\w\-]+/g, "_")}.pdf`,
        });
      }
      showToast(
        to
          ? "Email draft opened. Attach the downloaded PDF before sending."
          : "PDF downloaded. Add a recipient email on the document, or pick one in your mail app."
      );
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't prepare email." : err.message, "error");
    } finally {
      setSendingKey(null);
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
          Create
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={createOptionBtn}
            disabled={creating}
            onClick={createEstimate}
          >
            <i className="bi bi-receipt" style={{ fontSize: 18, color: "var(--gold)" }} />
            <span style={{ textAlign: "left" }}>
              <strong style={{ display: "block", fontSize: 14 }}>Create Estimate</strong>
            </span>
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={createOptionBtn}
            disabled={creating}
            onClick={createProposal}
          >
            <i className="bi bi-file-earmark-richtext" style={{ fontSize: 18, color: "var(--gold)" }} />
            <span style={{ textAlign: "left" }}>
              <strong style={{ display: "block", fontSize: 14 }}>Create Proposal</strong>
            </span>
          </button>
        </div>
      </Modal>

      <div>
        <h1 style={{ margin: 0, fontSize: 22 }}>Proposals</h1>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="input"
            placeholder="Search by title or client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 280, minWidth: 200 }}
          />
          <div style={{ width: 180 }}>
            <Select value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} ariaLabel="Filter by status" />
          </div>
          <div style={{ width: 200 }}>
            <Select value={clientFilter} onChange={setClientFilter} options={clientFilterOptions} ariaLabel="Filter by client" />
          </div>
        </div>
        <button className="btn btn-accent" disabled={creating} onClick={() => setCreateOpen(true)}>
          <i className="bi bi-plus-lg" /> {creating ? "Creating…" : "Create Proposal"}
        </button>
      </div>

      <div className="card">
        <span className="card-title">
          <i className="bi bi-file-earmark-text-fill" style={{ color: "var(--gold)" }} />
          All Documents
        </span>
        {loading && <p className="muted">Loading…</p>}
        {!loading && docs.length === 0 && <p className="muted">No proposals or estimates yet.</p>}
        {!loading && docs.length > 0 && (
          <div className="table-wrap">
            <table className="kwick-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Client</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => {
                  const href = d.kind === "proposal" ? `/sales/proposals/${d.id}` : `/sales/estimates/${d.id}`;
                  const key = `${d.kind}-${d.id}`;
                  return (
                    <tr key={key}>
                      <td>
                        <span className={`badge ${d.kind === "estimate" ? "badge-warning" : "badge-muted"}`}>
                          {d.kind === "estimate" ? "Estimate" : "Proposal"}
                        </span>
                      </td>
                      <td>{d.client_name || "—"}</td>
                      <td>
                        <Link href={href} style={{ fontWeight: 600, color: "var(--navy)" }}>
                          {d.title}
                        </Link>
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[d.status]}`}>{d.status}</span>
                      </td>
                      <td>{formatDate(d.created_at)}</td>
                      <td>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{ width: 130 }}>
                            <Select
                              value={d.status}
                              onChange={(v) => changeStatus(d, v)}
                              options={STATUS_OPTIONS}
                              compact
                              ariaLabel="Change status"
                            />
                          </div>
                          <Link href={href} className="btn btn-ghost btn-sm">
                            <i className="bi bi-pencil-fill" /> Edit
                          </Link>
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={busyKey === key}
                            onClick={() => duplicateDoc(d)}
                            title="Duplicate"
                          >
                            <i className="bi bi-copy" /> Duplicate
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            title="Export PDF"
                            aria-label="Export PDF"
                            disabled={exportingKey === key}
                            onClick={() => exportPdf(d)}
                          >
                            <i className="bi bi-file-earmark-pdf-fill" />
                            {exportingKey === key ? "…" : "PDF"}
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            title="Open email draft with PDF"
                            disabled={sendingKey === key}
                            onClick={() => sendToEmail(d)}
                          >
                            <i className="bi bi-envelope" />
                            {sendingKey === key ? "…" : "Send to"}
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: "var(--danger)" }}
                            disabled={busyKey === key}
                            onClick={() => deleteDoc(d)}
                          >
                            {busyKey === key ? "…" : "Delete"}
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
    </div>
  );
}

const createOptionBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  justifyContent: "flex-start",
  padding: "14px 16px",
  height: "auto",
  textAlign: "left",
  whiteSpace: "normal",
};
