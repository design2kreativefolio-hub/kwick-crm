"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ContactBar } from "@/components/bd/ContactBar";
import { BulkDisqualifySheet } from "@/components/bd/BulkDisqualifySheet";
import { ImportSheet } from "@/components/bd/ImportSheet";
import { LeadForm } from "@/components/bd/LeadForm";
import { QualifySheet } from "@/components/bd/QualifySheet";
import { ScoreBadge } from "@/components/bd/ScoreBadge";
import { Sheet } from "@/components/bd/Sheet";
import { useConfirm } from "@/components/ConfirmDialog";
import { Loader } from "@/components/Loader";
import { Select } from "@/components/Select";
import { api, ApiError, formatApiError } from "@/lib/api";
import { hasModuleAccess, useAuth } from "@/lib/auth";
import {
  SERVICES,
  SOURCES,
  SOURCE_LABEL,
  STAGE_BADGE,
  STAGE_LABEL,
  fmtMoney,
  fmtWhen,
  isOverdue,
  type BDLead,
} from "@/lib/bd";
import { useToast } from "@/lib/toast";
import { timeAgo } from "@/lib/notifications";

type Page = { count: number; next: string | null; results: BDLead[] };

// "To work" is the inbox: leads nobody has qualified or closed yet. A qualified lead
// moves to the Pipeline ("In pipeline" here shows them again).
const STATUS_FILTERS = [
  { value: "work", label: "To work" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "In pipeline" },
  { value: "converted", label: "Won" },
  { value: "disqualified", label: "Closed" },
  { value: "all", label: "All" },
];
const FOLLOW_FILTERS = [
  { value: "", label: "Any follow-up" },
  { value: "due", label: "Due / overdue" },
  { value: "today", label: "Due today" },
  { value: "overdue", label: "Overdue" },
  { value: "none", label: "None scheduled" },
];
const STAGE_FILTERS = [
  { value: "", label: "Any stage" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "meeting", label: "Meeting" },
  { value: "proposal_sent", label: "Proposal sent" },
  { value: "negotiation", label: "Negotiation" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];
const VALUE_FILTERS = [
  { value: "", label: "Any" },
  { value: "yes", label: "Has a value" },
  { value: "no", label: "No value yet" },
];
const ADDED_FILTERS = [
  { value: "", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];
const SORTS = [
  { value: "-created_at", label: "Sort: Newest" },
  { value: "-score", label: "Sort: Best score" },
  { value: "created_at", label: "Sort: Oldest" },
  { value: "next_follow_up_at", label: "Sort: Follow-up" },
  { value: "-est_value", label: "Sort: Highest value" },
  { value: "last_activity_at", label: "Sort: Quiet longest" },
  { value: "company", label: "Sort: Company A–Z" },
];
const SCORE_FILTERS = [
  { value: "", label: "Any" },
  { value: "hot", label: "Hot (70+)" },
  { value: "warm", label: "Warm (40-69)" },
  { value: "cold", label: "Cold (under 40)" },
];
const PAGE_SIZE = 25;

/** The lead's headline status: its deal stage once qualified, else lead status. */
function stageOf(l: BDLead): string {
  return l.deal ? l.deal.stage : l.status;
}

export default function LeadsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const router = useRouter();
  const isSuperadmin = user?.role === "superadmin";
  const hasAccess = isSuperadmin || hasModuleAccess(user?.module_access, "bd");

  const [rows, setRows] = useState<BDLead[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("work");
  const [source, setSource] = useState("");
  const [service, setService] = useState("");
  const [follow, setFollow] = useState("");
  const [owner, setOwner] = useState("");
  const [stage, setStage] = useState("");
  const [hasValue, setHasValue] = useState("");
  const [added, setAdded] = useState("");
  const [band, setBand] = useState("");
  const [sort, setSort] = useState("-created_at");
  const [owners, setOwners] = useState<{ id: number; name: string }[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTo, setReassignTo] = useState("");
  const [qualifyFor, setQualifyFor] = useState<BDLead[] | null>(null);
  const [disqualifyIds, setDisqualifyIds] = useState<{ ids: number[]; name?: string } | null>(null);

  const buildQuery = useCallback(
    (p: number, size = PAGE_SIZE) => {
      const q = new URLSearchParams({ page: String(p), page_size: String(size), ordering: sort });
      if (search.trim()) q.set("search", search.trim());
      if (status === "work") q.set("view", "work");
      else if (status && status !== "all") q.set("status", status);
      if (source) q.set("source", source);
      if (service) q.set("service", service);
      if (follow) q.set("follow_up", follow);
      if (owner) q.set("owner", owner);
      if (stage) q.set("stage", stage);
      if (hasValue) q.set("has_value", hasValue);
      if (added) q.set("added", added);
      if (band) q.set("score", band);
      return q.toString();
    },
    [search, status, source, service, follow, owner, stage, hasValue, added, band, sort]
  );

  const load = useCallback(() => {
    setLoading(true);
    api<Page>(`/api/bd/leads?${buildQuery(page)}`)
      .then((d) => {
        setRows(d.results);
        setCount(d.count);
      })
      .catch(() => showToast("Couldn't load leads.", "error"))
      .finally(() => setLoading(false));
  }, [buildQuery, page, showToast]);

  useEffect(() => {
    if (!hasAccess) return;
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [hasAccess, load]);

  useEffect(() => setPage(1), [search, status, source, service, follow, owner, stage, hasValue, added, band, sort]);

  useEffect(() => {
    if (isSuperadmin) api<{ id: number; name: string }[]>("/api/bd/leads/owners").then(setOwners).catch(() => {});
  }, [isSuperadmin]);

  const exportCsv = async () => {
    try {
      const d = await api<Page>(`/api/bd/leads?${buildQuery(1, 200)}`);
      const head = ["Company", "Contact", "Phone", "Email", "Website", "Source", "Stage", "Value", "Currency", "Owner", "Next follow-up", "Created"];
      const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = d.results.map((l) =>
        [l.company, l.contact_name, l.phone, l.email, l.website, SOURCE_LABEL[l.source] ?? l.source, STAGE_LABEL[stageOf(l)] ?? stageOf(l), l.deal ? l.deal.value : l.est_value, l.deal ? l.deal.currency : l.currency, l.owner_name, l.next_follow_up_at ?? "", l.created_at]
          .map((v) => esc(String(v)))
          .join(",")
      );
      const blob = new Blob(["﻿" + [head.map(esc).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      if (d.count > 200) showToast(`Exported the first 200 of ${d.count} leads — narrow the filters for the rest.`, "info");
    } catch {
      showToast("Couldn't export.", "error");
    }
  };

  const reassign = async () => {
    try {
      await api("/api/bd/leads/reassign", { method: "POST", body: JSON.stringify({ lead_ids: selected, owner: Number(reassignTo) }) });
      showToast(`${selected.length} lead${selected.length === 1 ? "" : "s"} reassigned.`);
      setSelected([]);
      setReassignOpen(false);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't reassign.", "error");
    }
  };

  if (!user) return null;
  if (!hasAccess) return <p className="muted">You don&apos;t have access to Business Development.</p>;

  const filterCount = [source, service, follow, owner, stage, hasValue, added, band].filter(Boolean).length;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const canWork = (l: BDLead) => !l.deal && (l.status === "new" || l.status === "contacted");
  const selectedLeads = rows.filter((l) => selected.includes(l.id));
  const allOnPage = rows.length > 0 && rows.every((l) => selected.includes(l.id));
  const toggleAll = () => setSelected(allOnPage ? [] : rows.map((l) => l.id));
  const afterChange = () => {
    setSelected([]);
    load();
  };
  /** Delete leads (any stage: new, won, closed...) and everything on them, after a confirmation. */
  const deleteLeads = async (ids: number[], name?: string) => {
    const n = ids.length;
    if (n === 0) return;
    const won = rows.filter((l) => ids.includes(l.id) && l.status === "converted").length;
    const what = name ? `"${name}"` : `${n} lead${n === 1 ? "" : "s"}`;
    const ok = await confirm(
      `Delete ${what} and everything on ${n === 1 ? "it" : "them"}: notes, calls, follow-ups, the deal and proposal links? This cannot be undone.` +
        (won ? ` ${won === 1 ? "A won lead's" : "Won leads'"} client or invoice already created in Sales is not deleted.` : ""),
      { title: name ? "Delete lead" : `Delete ${n} lead${n === 1 ? "" : "s"}`, danger: true, confirmLabel: "Delete" }
    );
    if (ok !== true) return;
    try {
      const r = await api<{ deleted: number }>("/api/bd/leads/bulk-delete", { method: "POST", body: JSON.stringify({ lead_ids: ids }) });
      showToast(`${r.deleted} lead${r.deleted === 1 ? "" : "s"} deleted.`);
      setSelected((s) => s.filter((x) => !ids.includes(x)));
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't delete.", "error");
    }
  };
  const deleteSelected = () => deleteLeads(selected);
  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const followCell = (l: BDLead) =>
    l.next_follow_up_at ? (
      <span className={isOverdue(l.next_follow_up_at) ? "is-late" : ""} style={isOverdue(l.next_follow_up_at) ? { color: "var(--danger)", fontWeight: 650 } : undefined}>
        {fmtWhen(l.next_follow_up_at)}
      </span>
    ) : (
      <span className="muted">—</span>
    );

  return (
    <div className="bd-page">
      {ConfirmDialog}
      <div className="bd-head">
        <div>
          <h1>Leads</h1>
          <div className="bd-sub">
            {count} lead{count === 1 ? "" : "s"}
            {status === "work" ? " to work — qualify a lead to move it to the Pipeline" : ""}
          </div>
        </div>
        <div className="bd-head__actions">
          <button className="bd-link" onClick={() => setImportOpen(true)}>
            <i className="bi bi-upload" /> Import
          </button>
          <button className="bd-link" onClick={exportCsv}>
            <i className="bi bi-download" /> Export
          </button>
          <button className="btn" onClick={() => setAddOpen(true)}>
            <i className="bi bi-plus-lg" /> Add lead
          </button>
        </div>
      </div>

      <div className="bd-toolbar">
        <div className="bd-search">
          <i className="bi bi-search" />
          <input className="input" type="search" placeholder="Search company, name, phone, email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-ghost" onClick={() => setFiltersOpen(true)}>
          <i className="bi bi-sliders" /> Filters{filterCount ? ` (${filterCount})` : ""}
        </button>
        <div className="bd-toolbar__sort">
          <Select value={sort} onChange={setSort} options={SORTS} ariaLabel="Sort leads" />
        </div>
      </div>
      <div className="bd-chips bd-chips--scroll">
        {STATUS_FILTERS.map((s) => (
          <button key={s.value} className={`bd-chip${status === s.value ? " is-on" : ""}`} onClick={() => setStatus(s.value)}>
            {s.label}
          </button>
        ))}
      </div>

      {selected.length > 0 && (
        <div className="bd-alert is-ok" style={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span>
            <b>{selected.length}</b> selected
          </span>
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="bd-iconbtn" title="Deselect all" aria-label="Deselect all" onClick={() => setSelected([])}>
              <i className="bi bi-x-lg" />
            </button>
            <button className="btn btn-sm" onClick={() => setQualifyFor(selectedLeads.filter(canWork))} disabled={!selectedLeads.some(canWork)}>
              <i className="bi bi-patch-check" /> Qualify
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setDisqualifyIds({ ids: selectedLeads.filter(canWork).map((l) => l.id) })} disabled={!selectedLeads.some(canWork)}>
              Disqualify
            </button>
            {isSuperadmin && (
              <button className="btn btn-sm btn-ghost" onClick={() => setReassignOpen(true)}>
                Reassign…
              </button>
            )}
            <button className="btn btn-sm btn-ghost" style={{ color: "var(--danger)" }} onClick={deleteSelected}>
              <i className="bi bi-trash3" /> Delete
            </button>
          </span>
        </div>
      )}

      {loading ? (
        <Loader />
      ) : rows.length === 0 ? (
        <div className="bd-list">
          <div className="bd-empty">
            <i className="bi bi-people" />
            {search || filterCount || (status && status !== "work" && status !== "all")
              ? "No leads match these filters."
              : status === "work"
                ? "Nothing to work on — every lead has been qualified or closed. Add one, or import a sheet."
                : "No leads yet. Add one, or import your existing sheet."}
          </div>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="bd-table-only bd-tablecard">
            <div className="table-wrap">
              <table className="kwick-table">
                <thead>
                  <tr>
                    <th>
                      <input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Select all leads on this page" />
                    </th>
                    <th>Lead</th>
                    <th>Contact</th>
                    <th>Source</th>
                    <th>Stage</th>
                    <th>Score</th>
                    <th>Value</th>
                    <th>Next follow-up</th>
                    {isSuperadmin && <th>Owner</th>}
                    <th>Reach</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.id} onClick={() => router.push(`/bd/leads/${l.id}`)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.includes(l.id)} onChange={() => toggle(l.id)} aria-label="Select lead" />
                      </td>
                      <td>
                        <b>{l.display_name}</b>
                        <div className="muted" style={{ fontSize: 12 }}>Added {timeAgo(l.created_at)}</div>
                      </td>
                      <td>
                        {l.contact_name || "—"}
                        <div className="muted" style={{ fontSize: 12 }}>{l.phone || l.email}</div>
                      </td>
                      <td>{SOURCE_LABEL[l.source] ?? l.source}</td>
                      <td>
                        <span className={`badge ${STAGE_BADGE[stageOf(l)] ?? "badge-muted"}`}>{STAGE_LABEL[stageOf(l)] ?? stageOf(l)}</span>
                      </td>
                      <td>
                        <ScoreBadge score={l.score} label={l.score_label} />
                      </td>
                      <td>{fmtMoney(l.deal ? l.deal.value : l.est_value, l.deal ? l.deal.currency : l.currency)}</td>
                      <td>{followCell(l)}</td>
                      {isSuperadmin && <td>{l.owner_name}</td>}
                      <td onClick={(e) => e.stopPropagation()}>
                        <ContactBar lead={l} compact onLogged={load} />
                      </td>
                      <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {canWork(l) ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <button className="btn btn-sm" onClick={() => setQualifyFor([l])}>
                              <i className="bi bi-patch-check" /> Qualify
                            </button>
                            <button className="bd-iconbtn" title="Disqualify" aria-label={`Disqualify ${l.display_name}`} onClick={() => setDisqualifyIds({ ids: [l.id], name: l.display_name })}>
                              <i className="bi bi-x-circle" />
                            </button>
                          </span>
                        ) : l.deal && l.status === "qualified" ? (
                          <a className="bd-link" href="/bd/pipeline">
                            In pipeline <i className="bi bi-arrow-right" />
                          </a>
                        ) : null}
                        <button className="bd-iconbtn bd-iconbtn--danger" title="Delete" aria-label={`Delete ${l.display_name}`} onClick={() => deleteLeads([l.id], l.display_name)}>
                          <i className="bi bi-trash3" />
                        </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Phone cards */}
          <div className="bd-cards-only bd-list">
            {rows.map((l) => (
              <div className="bd-leadcard" key={l.id} onClick={() => router.push(`/bd/leads/${l.id}`)}>
                <div className="bd-leadcard__top">
                  <div style={{ minWidth: 0 }}>
                    <div className="bd-leadcard__name">{l.display_name}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {[l.contact_name, SOURCE_LABEL[l.source]].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <ScoreBadge score={l.score} label={l.score_label} />
                    <span className={`badge ${STAGE_BADGE[stageOf(l)] ?? "badge-muted"}`}>{STAGE_LABEL[stageOf(l)] ?? stageOf(l)}</span>
                  </span>
                </div>
                <div className="bd-leadcard__foot">
                  <span>{followCell(l)}</span>
                  <span>{Number(l.deal ? l.deal.value : l.est_value) > 0 ? fmtMoney(l.deal ? l.deal.value : l.est_value, l.deal ? l.deal.currency : l.currency) : ""}</span>
                </div>
                <div style={{ marginLeft: -8 }} onClick={(e) => e.stopPropagation()}>
                  <ContactBar lead={l} compact onLogged={load} />
                </div>
                <div style={{ display: "flex", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                {canWork(l) && (
                  <>
                    <button className="btn btn-sm" onClick={() => setQualifyFor([l])}>
                      <i className="bi bi-patch-check" /> Qualify
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setDisqualifyIds({ ids: [l.id], name: l.display_name })}>
                      Disqualify
                    </button>
                  </>
                )}
                  <button className="btn btn-sm btn-ghost" style={{ color: "var(--danger)" }} onClick={() => deleteLeads([l.id], l.display_name)}>
                    <i className="bi bi-trash3" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {pages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12 }}>
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <i className="bi bi-chevron-left" /> Prev
              </button>
              <span className="muted" style={{ fontSize: 13 }}>
                Page {page} of {pages}
              </span>
              <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next <i className="bi bi-chevron-right" />
              </button>
            </div>
          )}
        </>
      )}

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        footer={
          <>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setSource("");
                setService("");
                setFollow("");
                setOwner("");
                setStage("");
                setHasValue("");
                setAdded("");
                setBand("");
              }}
            >
              Reset
            </button>
            <button className="btn" onClick={() => setFiltersOpen(false)}>
              Done
            </button>
          </>
        }
      >
        <div className="bd-field">
          <span className="bd-label">Stage</span>
          <Select value={stage} onChange={setStage} options={STAGE_FILTERS} ariaLabel="Stage" />
        </div>
        <div className="bd-field">
          <span className="bd-label">Lead score</span>
          <Select value={band} onChange={setBand} options={SCORE_FILTERS} ariaLabel="Lead score" />
        </div>
        <div className="bd-field">
          <span className="bd-label">Source</span>
          <Select value={source} onChange={setSource} options={[{ value: "", label: "Any source" }, ...SOURCES]} ariaLabel="Source" />
        </div>
        <div className="bd-field">
          <span className="bd-label">Service</span>
          <Select value={service} onChange={setService} options={[{ value: "", label: "Any service" }, ...SERVICES]} ariaLabel="Service" />
        </div>
        <div className="bd-field">
          <span className="bd-label">Follow-up</span>
          <Select value={follow} onChange={setFollow} options={FOLLOW_FILTERS} ariaLabel="Follow-up" />
        </div>
        <div className="bd-grid2">
          <div className="bd-field">
            <span className="bd-label">Value</span>
            <Select value={hasValue} onChange={setHasValue} options={VALUE_FILTERS} ariaLabel="Value" />
          </div>
          <div className="bd-field">
            <span className="bd-label">Added</span>
            <Select value={added} onChange={setAdded} options={ADDED_FILTERS} ariaLabel="Added" />
          </div>
        </div>
        {isSuperadmin && (
          <div className="bd-field">
            <span className="bd-label">Owner</span>
            <Select value={owner} onChange={setOwner} options={[{ value: "", label: "All BDEs" }, ...owners.map((o) => ({ value: String(o.id), label: o.name }))]} ariaLabel="Owner" />
          </div>
        )}
      </Sheet>

      <Sheet
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
        title={`Reassign ${selected.length} lead${selected.length === 1 ? "" : "s"}`}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setReassignOpen(false)}>
              Cancel
            </button>
            <button className="btn" disabled={!reassignTo} onClick={reassign}>
              Reassign
            </button>
          </>
        }
      >
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Their deals, open follow-ups and linked proposals &amp; estimates move with them.
        </p>
        <Select value={reassignTo} onChange={setReassignTo} options={[{ value: "", label: "Choose a BDE…" }, ...owners.map((o) => ({ value: String(o.id), label: o.name }))]} ariaLabel="New owner" />
      </Sheet>

      <LeadForm open={addOpen} onClose={() => setAddOpen(false)} onSaved={(l) => router.push(`/bd/leads/${l.id}`)} />
      <QualifySheet open={!!qualifyFor} onClose={() => setQualifyFor(null)} leads={qualifyFor ?? []} onDone={afterChange} />
      <BulkDisqualifySheet
        open={!!disqualifyIds}
        onClose={() => setDisqualifyIds(null)}
        leadIds={disqualifyIds?.ids ?? []}
        name={disqualifyIds?.name}
        onDone={afterChange}
      />
      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} onDone={load} />
    </div>
  );
}
