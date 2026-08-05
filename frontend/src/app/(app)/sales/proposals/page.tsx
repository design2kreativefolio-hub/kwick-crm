"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Select } from "@/components/Select";
import { api, ApiError, unwrapList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { defaultContent } from "@/lib/proposalContent";
import { useToast } from "@/lib/toast";

type Client = { id: number; name: string };

type ProposalStatus = "draft" | "sent" | "accepted" | "rejected";

type Proposal = {
  id: number;
  client: number | null;
  client_name: string;
  title: string;
  status: ProposalStatus;
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function SalesProposalsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const isSuperadmin = user?.role === "superadmin";
  const hasAccess = isSuperadmin || (user?.module_access ?? []).includes("sales");

  const [clients, setClients] = useState<Client[]>([]);

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

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(true);
  const [proposalStatusFilter, setProposalStatusFilter] = useState("");
  const [proposalClientFilter, setProposalClientFilter] = useState("");
  const [creating, setCreating] = useState(false);
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
    if (!hasAccess) return;
    loadProposals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess, proposalStatusFilter, proposalClientFilter]);

  const addProposal = async () => {
    setCreating(true);
    try {
      const created = await api<Proposal>("/api/sales/proposals", {
        method: "POST",
        body: JSON.stringify({ content: defaultContent() }),
      });
      router.push(`/sales/proposals/${created.id}`);
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't create proposal." : err.message, "error");
      setCreating(false);
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
      loadProposals();
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't delete proposal." : err.message, "error");
    } finally {
      setProposalBusyId(null);
    }
  };

  if (!user) return null;

  if (!hasAccess) {
    return <p className="muted">You don&apos;t have access to Sales.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22 }}>Proposals</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Build branded proposals and export them as PDF or Word.
        </p>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ width: 180 }}>
            <Select value={proposalStatusFilter} onChange={setProposalStatusFilter} options={PROPOSAL_STATUS_FILTER_OPTIONS} ariaLabel="Filter by status" />
          </div>
          <div style={{ width: 200 }}>
            <Select value={proposalClientFilter} onChange={setProposalClientFilter} options={clientFilterOptions} ariaLabel="Filter by client" />
          </div>
        </div>
        <button className="btn btn-accent" disabled={creating} onClick={addProposal}>
          <i className="bi bi-plus-lg" /> {creating ? "Creating…" : "Add Proposal"}
        </button>
      </div>

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
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => (
                  <tr key={p.id}>
                    <td>{p.client_name || "—"}</td>
                    <td>
                      <Link href={`/sales/proposals/${p.id}`} style={{ fontWeight: 600, color: "var(--navy)" }}>
                        {p.title}
                      </Link>
                    </td>
                    <td>
                      <span className={`badge ${PROPOSAL_STATUS_BADGE[p.status]}`}>{p.status}</span>
                    </td>
                    <td>{formatDate(p.created_at)}</td>
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
                        <Link href={`/sales/proposals/${p.id}`} className="btn btn-ghost btn-sm">
                          <i className="bi bi-pencil-fill" /> Edit
                        </Link>
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
    </div>
  );
}
