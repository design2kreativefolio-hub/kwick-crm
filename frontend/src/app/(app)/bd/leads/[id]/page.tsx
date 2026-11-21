"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ContactBar } from "@/components/bd/ContactBar";
import { EdithSheet } from "@/components/bd/EdithSheet";
import { EmailSheet } from "@/components/bd/EmailSheet";
import { FollowUpSheet } from "@/components/bd/FollowUpSheet";
import { LeadForm } from "@/components/bd/LeadForm";
import { LogSheet } from "@/components/bd/LogSheet";
import { Sheet } from "@/components/bd/Sheet";
import { ScoreBadge } from "@/components/bd/ScoreBadge";
import { MoveSheet, useStageMove } from "@/components/bd/StageDialogs";
import { useConfirm } from "@/components/ConfirmDialog";
import { DatePicker } from "@/components/DatePicker";
import { Loader } from "@/components/Loader";
import { Select } from "@/components/Select";
import { api, ApiError, formatApiError, unwrapList } from "@/lib/api";
import { hasModuleAccess, useAuth } from "@/lib/auth";
import {
  KIND_ICON,
  LOST_REASONS,
  OUTCOME_BADGE,
  OUTCOME_LABEL,
  SERVICES,
  ACTIVITY_KINDS,
  SOURCE_LABEL,
  STAGE_BADGE,
  STAGE_LABEL,
  fmtMoney,
  fmtWhen,
  isOverdue,
  loadMailStatus,
  type BDActivity,
  type BDFollowUp,
  type BDLead,
  type MailStatus,
  type ProposalLinkInfo,
  type StageKey,
} from "@/lib/bd";
import { defaultEstimateContent } from "@/lib/estimateContent";
import { timeAgo } from "@/lib/notifications";
import { defaultContent } from "@/lib/proposalContent";
import { useToast } from "@/lib/toast";

type Doc = { id: number; title: string; status: string; client_name?: string };

const OPEN_STAGES: StageKey[] = ["qualified", "meeting", "proposal_sent", "negotiation"];
const TRACK: StageKey[] = ["new", "contacted", ...OPEN_STAGES];
type LeadTab = "timeline" | "followups" | "documents" | "details";

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const isSuperadmin = user?.role === "superadmin";
  const hasAccess = isSuperadmin || hasModuleAccess(user?.module_access, "bd");

  const [lead, setLead] = useState<BDLead | null>(null);
  const [activities, setActivities] = useState<BDActivity[]>([]);
  const [followUps, setFollowUps] = useState<BDFollowUp[]>([]);
  const [proposal, setProposal] = useState<Doc | null>(null);
  const [estimate, setEstimate] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  const [logOpen, setLogOpen] = useState(false);
  const [logKind, setLogKind] = useState<BDActivity["kind"]>("call");
  const [followOpen, setFollowOpen] = useState<"follow_up" | "meeting" | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [dealOpen, setDealOpen] = useState(false);
  const [disqualifyOpen, setDisqualifyOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [edithOpen, setEdithOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState<{ subject: string; body: string } | null>(null);
  const [showScore, setShowScore] = useState(false);
  const [scoreNote, setScoreNote] = useState("");
  const [scoreBusy, setScoreBusy] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [clients, setClients] = useState<{ id: number; name: string; client_id?: string }[]>([]);
  const [clientPick, setClientPick] = useState("");
  const [handoverBusy, setHandoverBusy] = useState(false);
  const [tab, setTab] = useState<LeadTab>("timeline");
  const [link, setLink] = useState<ProposalLinkInfo | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [mailStatus, setMailStatus] = useState<MailStatus | null>(null);
  const [emailProposal, setEmailProposal] = useState(false);
  const [note, setNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [l, a, f] = await Promise.all([
        api<BDLead>(`/api/bd/leads/${id}`),
        api<{ results: BDActivity[] }>(`/api/bd/activities?lead=${id}&page_size=200`),
        api<{ results: BDFollowUp[] }>(`/api/bd/follow-ups?lead=${id}&state=open&page_size=50`),
      ]);
      setLead(l);
      setActivities(unwrapList(a));
      setFollowUps(unwrapList(f));
      setMissing(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setMissing(true);
      else showToast("Couldn't load this lead.", "error");
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    if (hasAccess) load();
  }, [hasAccess, load]);

  // Titles of the linked proposal / estimate (a failed fetch just hides the title).
  useEffect(() => {
    const d = lead?.deal;
    setProposal(null);
    setEstimate(null);
    if (d?.proposal) api<Doc>(`/api/sales/proposals/${d.proposal}`).then(setProposal).catch(() => {});
    if (d?.estimate) api<Doc>(`/api/sales/estimates/${d.estimate}`).then(setEstimate).catch(() => {});
  }, [lead?.deal?.proposal, lead?.deal?.estimate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadMailStatus(() => api<MailStatus>("/api/bd/mail-status")).then(setMailStatus);
  }, []);

  // The tracked link for this deal's proposal (null until one is created).
  useEffect(() => {
    const d = lead?.deal;
    setLink(null);
    if (d?.proposal) api<ProposalLinkInfo | null>(`/api/bd/deals/${d.id}/proposal-link`).then(setLink).catch(() => {});
  }, [lead?.deal?.id, lead?.deal?.proposal]); // eslint-disable-line react-hooks/exhaustive-deps

  const createLink = async () => {
    if (!lead?.deal) return;
    setLinkBusy(true);
    try {
      setLink(await api<ProposalLinkInfo>(`/api/bd/deals/${lead.deal.id}/proposal-link`, { method: "POST" }));
    } catch (err) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't create the link.", "error");
    } finally {
      setLinkBusy(false);
    }
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      showToast("Link copied.");
    } catch {
      showToast(link.url, "info");
    }
  };

  const explainScore = async () => {
    if (!lead) return;
    setScoreBusy(true);
    try {
      const r = await api<{ text: string }>(`/api/bd/leads/${lead.id}/edith`, { method: "POST", body: JSON.stringify({ action: "score" }) });
      setScoreNote(r.text);
    } catch (err) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "EDITH couldn't answer right now.", "error");
    } finally {
      setScoreBusy(false);
    }
  };

  const openClientPicker = () => {
    setClientPick("");
    setClientOpen(true);
    api<{ id: number; name: string; client_id?: string }[] | { results: { id: number; name: string; client_id?: string }[] }>("/api/sales/clients")
      .then((d) => setClients(unwrapList(d)))
      .catch(() => showToast("Couldn't load the clients.", "error"));
  };

  const linkClient = async () => {
    if (!deal || !clientPick) return;
    setHandoverBusy(true);
    try {
      await api(`/api/bd/deals/${deal.id}/link-client`, { method: "POST", body: JSON.stringify({ client_id: Number(clientPick) }) });
      showToast("Client linked.");
      setClientOpen(false);
      void load();
    } catch (err) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't link the client.", "error");
    } finally {
      setHandoverBusy(false);
    }
  };

  const createInvoice = async () => {
    if (!deal) return;
    setHandoverBusy(true);
    try {
      await api(`/api/bd/deals/${deal.id}/create-invoice`, { method: "POST" });
      showToast("Draft invoice created.");
      void load();
    } catch (err) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't create the invoice.", "error");
    } finally {
      setHandoverBusy(false);
    }
  };

  const stage: StageKey | "disqualified" = lead ? (lead.deal ? lead.deal.stage : (lead.status as StageKey)) : "new";
  const { requestMove, dialogs } = useStageMove(load);

  const act = async (fn: () => Promise<unknown>, ok: string, fail = "Something went wrong.") => {
    try {
      await fn();
      if (ok) showToast(ok);
      await load();
    } catch (err) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : fail, "error");
    }
  };

  const post = (path: string, body: object = {}) => api(path, { method: "POST", body: JSON.stringify(body) });

  const saveNote = async () => {
    const body = note.trim();
    if (!body || noteBusy) return;
    setNoteBusy(true);
    try {
      await api("/api/bd/activities", { method: "POST", body: JSON.stringify({ lead: Number(id), kind: "note", direction: "out", body }) });
      setNote("");
      await load();
    } catch (err) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't save the note.", "error");
    } finally {
      setNoteBusy(false);
    }
  };

  const completeFollowUp = (f: BDFollowUp) => act(() => post(`/api/bd/follow-ups/${f.id}/complete`), "");
  const deleteFollowUp = (f: BDFollowUp) => act(() => api(`/api/bd/follow-ups/${f.id}`, { method: "DELETE" }), "Removed.");

  const createDoc = async (kind: "proposal" | "estimate") => {
    if (!lead?.deal) return;
    const name = lead.company || lead.contact_name;
    try {
      let created: { id: number };
      if (kind === "proposal") {
        const content = defaultContent();
        content.home.client_name = name;
        content.home.client_email = lead.email;
        content.home.client_phone = lead.phone;
        created = await api<{ id: number }>("/api/sales/proposals", {
          method: "POST",
          body: JSON.stringify({ title: `${name} — Proposal`, content }),
        });
      } else {
        const content = defaultEstimateContent();
        content.bill_to = name;
        content.currency = lead.deal.currency;
        created = await api<{ id: number }>("/api/sales/estimates", {
          method: "POST",
          body: JSON.stringify({ title: `${name} — Estimate`, content }),
        });
      }
      await api(`/api/bd/deals/${lead.deal.id}`, { method: "PATCH", body: JSON.stringify({ [kind]: created.id }) });
      router.push(kind === "proposal" ? `/sales/proposals/${created.id}` : `/sales/estimates/${created.id}`);
    } catch (err) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : `Couldn't create the ${kind}.`, "error");
    }
  };

  const deleteLead = async () => {
    if (!lead) return;
    const ok = await confirm(
      `Delete "${lead.display_name}" and everything on it: notes, calls, follow-ups, the deal and proposal links? This cannot be undone.` +
        (won ? " Its client or invoice already created in Sales is not deleted." : ""),
      {
      title: "Delete lead",
      danger: true,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await api(`/api/bd/leads/${lead.id}`, { method: "DELETE" });
      showToast("Lead deleted.");
      router.push("/bd/leads");
    } catch {
      showToast("Couldn't delete.", "error");
    }
  };

  if (!user) return null;
  if (!hasAccess) return <p className="muted">You don&apos;t have access to Business Development.</p>;
  if (loading) return <Loader />;
  if (missing || !lead)
    return (
      <div className="bd-page">
        <p className="muted">This lead doesn&apos;t exist, or isn&apos;t yours.</p>
        <Link href="/bd/leads" className="back-link">
          <i className="bi bi-arrow-left" /> Back to Leads
        </Link>
      </div>
    );

  const deal = lead.deal;
  const isOpenDeal = !!deal && OPEN_STAGES.includes(deal.stage);
  const earlyLead = !deal && (lead.status === "new" || lead.status === "contacted");
  const closedLead = lead.status === "disqualified";
  const won = deal?.stage === "won";
  const lostLabel = deal?.stage === "lost" ? LOST_REASONS.find((r) => r.value === deal.lost_reason)?.label : "";
  const money = deal ? fmtMoney(deal.value, deal.currency) : Number(lead.est_value) > 0 ? fmtMoney(lead.est_value, lead.currency) : "";
  const serviceLabels = lead.services.map((s) => SERVICES.find((x) => x.value === s)?.label ?? s);
  const title = lead.display_name;

  // Share the proposal as a trackable link: we see views and the client can accept online.
  const proposalShare = (
    <div className="bd-doc" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <i className="bi bi-link-45deg" />
        <b style={{ flex: 1 }}>Share the proposal</b>
        {link?.accepted_at && <span className="badge badge-success">Accepted</span>}
      </div>
      {link ? (
        <>
          <div className="bd-sub" style={{ margin: 0 }}>
            {link.views === 0
              ? "Not opened yet."
              : `Opened ${link.views} time${link.views === 1 ? "" : "s"}${link.last_viewed_at ? ` · last ${timeAgo(link.last_viewed_at)}` : ""}.`}
            {link.accepted_at ? ` Accepted by ${link.accepted_name} ${timeAgo(link.accepted_at)}.` : ""}
          </div>
          <div className="bd-actions">
            <button className="btn btn-sm" onClick={copyLink}>
              <i className="bi bi-clipboard" /> Copy link
            </button>
            {mailStatus?.can_send && lead.email && !won && (
              <button className="btn btn-sm btn-ghost" onClick={() => setEmailProposal(true)}>
                <i className="bi bi-send" /> Email it
              </button>
            )}
            <a className="bd-link" href={`${link.url}?p=1`} target="_blank" rel="noopener noreferrer">
              <i className="bi bi-box-arrow-up-right" /> Preview
            </a>
          </div>
        </>
      ) : (
        <div className="bd-actions">
          <button className="btn btn-sm" onClick={createLink} disabled={linkBusy}>
            {linkBusy ? "Creating…" : "Create tracked link"}
          </button>
          <span className="bd-sub" style={{ margin: 0 }}>Anyone with the link can view and accept it.</span>
        </div>
      )}
    </div>
  );

  const docRow = (kind: "proposal" | "estimate", doc: Doc | null, docId: number | null) =>
    docId ? (
      <div className="bd-doc">
        <i className={`bi ${kind === "proposal" ? "bi-file-earmark-text-fill" : "bi-receipt-cutoff"}`} />
        <Link href={kind === "proposal" ? `/sales/proposals/${docId}` : `/sales/estimates/${docId}`}>
          {doc?.title || (kind === "proposal" ? "Proposal" : "Estimate")}
        </Link>
        {doc && <span className="badge badge-muted">{doc.status}</span>}
      </div>
    ) : (
      <div className="bd-doc" style={{ borderStyle: "dashed" }}>
        <i className={`bi ${kind === "proposal" ? "bi-file-earmark-text" : "bi-receipt"}`} />
        <span className="muted" style={{ flex: 1 }}>
          No {kind} yet
        </span>
        <button className="btn btn-sm btn-ghost" onClick={() => createDoc(kind)}>
          <i className="bi bi-plus-lg" /> New
        </button>
      </div>
    );

  return (
    <div className="bd-page">
      {ConfirmDialog}
      {dialogs}
      <div>
        <Link href="/bd/leads" className="back-link">
          <i className="bi bi-arrow-left" /> Leads
        </Link>
      </div>

      <div className="bd-lead">
        <div className="bd-lead__top">
          <div style={{ minWidth: 0 }}>
            <h1 className="bd-lead__name">{title}</h1>
            <div className="bd-sub">
              {[lead.contact_name, lead.designation].filter(Boolean).join(" · ") || "No contact person"}
              {money && <> · <b style={{ color: "var(--text)" }}>{money}</b></>}
            </div>
          </div>
          <div className="bd-lead__tools">
            <ScoreBadge score={lead.score} label={lead.score_label} onClick={() => setShowScore((v) => !v)} />
            <span className={`badge ${STAGE_BADGE[stage] ?? "badge-muted"}`} style={{ marginRight: 6 }}>
              {STAGE_LABEL[stage] ?? (closedLead ? "Closed" : stage)}
              {deal && isOpenDeal ? ` · ${deal.probability}%` : ""}
            </span>
            {mailStatus?.ai && (
              <button className="btn btn-sm btn-ghost" onClick={() => setEdithOpen(true)} title="Summarise, draft a message, or suggest the next step">
                <i className="bi bi-stars" /> EDITH
              </button>
            )}
            <button className="bd-iconbtn" onClick={() => setEditOpen(true)} aria-label="Edit lead" title="Edit lead">
              <i className="bi bi-pencil" />
            </button>
          </div>
        </div>

        {showScore && lead.score_reasons.length > 0 && (
          <div className="bd-alert" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
            <b style={{ fontSize: 13.5 }}>
              Lead score {lead.score}/100 · {lead.score_label}
            </b>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
              {lead.score_reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            {scoreNote && <div style={{ fontSize: 13, fontStyle: "italic" }}>{scoreNote}</div>}
            {mailStatus?.ai && !scoreNote && (
              <button className="bd-link" style={{ alignSelf: "flex-start" }} onClick={explainScore} disabled={scoreBusy}>
                <i className="bi bi-stars" /> {scoreBusy ? "Asking EDITH…" : "Explain with EDITH"}
              </button>
            )}
          </div>
        )}

        <ContactBar lead={lead} display={title} deal={lead.deal} onLogged={load} />

        {/* ---- where it is in the pipeline (tap a step to move) ---- */}
        {!won && !closedLead && deal?.stage !== "lost" && (
          <div className="bd-track" role="group" aria-label="Pipeline stage">
            {TRACK.map((s, i) => {
              const nowIdx = TRACK.indexOf(stage as StageKey);
              const canMove = earlyLead ? s === "new" || s === "contacted" : isOpenDeal && OPEN_STAGES.includes(s);
              return (
                <button
                  key={s}
                  className={`bd-step${i === nowIdx ? " is-now" : i < nowIdx ? " is-past" : ""}`}
                  disabled={!canMove || i === nowIdx}
                  onClick={() => requestMove(lead.id, s, title)}
                  title={canMove ? `Move to ${STAGE_LABEL[s]}` : STAGE_LABEL[s]}
                >
                  <span className="bd-step__bar" />
                  <span className="bd-step__label">{STAGE_LABEL[s]}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="bd-actions">
          {earlyLead && (
            <>
              <button className="btn" onClick={() => act(() => post(`/api/bd/leads/${lead.id}/qualify`), "Qualified — it's now a deal.")}>
                <i className="bi bi-patch-check" /> Qualify
              </button>
              <button className="bd-link is-danger" onClick={() => setDisqualifyOpen(true)}>
                Disqualify
              </button>
            </>
          )}
          {isOpenDeal && deal && (
            <>
              <button className="btn btn-won" onClick={() => requestMove(lead.id, "won", title)}>
                <i className="bi bi-trophy" /> Won
              </button>
              <button className="btn btn-ghost" onClick={() => requestMove(lead.id, "lost", title)}>
                Lost
              </button>
              <button className="bd-link" onClick={() => setDealOpen(true)}>
                <i className="bi bi-sliders" /> Deal details
              </button>
              <button className="bd-link phone-only-btn" onClick={() => setMoveOpen(true)}>
                Move to…
              </button>
            </>
          )}
        </div>

        {isOpenDeal && deal && (deal.expected_close_date || deal.stage_changed_at) && (
          <div className="bd-sub" style={{ marginTop: -6 }}>
            {deal.expected_close_date ? `Expected close ${deal.expected_close_date} · ` : ""}in this stage {timeAgo(deal.stage_changed_at).replace(" ago", "")}
          </div>
        )}

        {won && deal && (
          <div className="bd-alert is-ok" style={{ alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <i className="bi bi-trophy-fill" />
            <span style={{ flex: 1, minWidth: 200 }}>
              Won {deal.won_at ? timeAgo(deal.won_at) : ""}.
              {isSuperadmin ? (
                deal.client ? (
                  <>
                    {" "}Client{" "}
                    <Link href={`/sales/clients/${deal.client}`} style={{ fontWeight: 700 }}>
                      {deal.client_code} · {deal.client_name}
                    </Link>
                    .
                  </>
                ) : (
                  " No client linked yet. Add them in Sales → Clients, then link them here."
                )
              ) : (
                " The admin will take it from here."
              )}
            </span>
            <span style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {isSuperadmin && !deal.client && (
                <button className="btn btn-sm" onClick={openClientPicker}>
                  <i className="bi bi-person-plus" /> Link client
                </button>
              )}
              {isSuperadmin && deal.client && !deal.invoice && (
                <button className="btn btn-sm" onClick={createInvoice} disabled={handoverBusy}>
                  <i className="bi bi-receipt" /> {handoverBusy ? "Creating…" : "Create draft invoice"}
                </button>
              )}
              {isSuperadmin && deal.invoice && (
                <Link className="bd-link" href={`/sales/invoices/${deal.invoice}`}>
                  <i className="bi bi-receipt" /> View invoice
                </Link>
              )}
              <button className="bd-link" onClick={() => setMoveOpen(true)}>
                Move back…
              </button>
            </span>
          </div>
        )}

        {(closedLead || deal?.stage === "lost") && (
          <div className="bd-alert is-danger">
            <i className="bi bi-x-octagon-fill" />
            <span style={{ flex: 1 }}>
              {deal?.stage === "lost" ? `Lost — ${lostLabel}${deal.lost_note ? `: ${deal.lost_note}` : ""}. We'll nudge you to get back in touch after 90 days.` : `Disqualified — ${lead.disqualify_reason}`}
            </span>
            <button className="bd-link" onClick={() => act(() => post(`/api/bd/leads/${lead.id}/reopen`), "Re-opened.")}>
              Re-open
            </button>
          </div>
        )}

        {/* ---- tabs ---- */}
        <div className="bd-tabs" role="tablist">
          {(
            [
              ["timeline", "Timeline", activities.length],
              ["followups", "Follow-ups", followUps.length],
              ["documents", "Documents", (deal?.proposal ? 1 : 0) + (deal?.estimate ? 1 : 0)],
              ["details", "Details", null],
            ] as [LeadTab, string, number | null][]
          ).map(([key, label, n]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={`bd-tab${tab === key ? " is-on" : ""}`} onClick={() => setTab(key)}>
              {label}
              {n !== null && n > 0 && <span className="bd-tab__n">{n}</span>}
            </button>
          ))}
        </div>

        {tab === "timeline" && (
          <section className="bd-list">
            <div className="bd-quicklog">
              <span className="bd-quicklog__label">Log an activity</span>
              <div className="bd-quicklog__btns">
                {ACTIVITY_KINDS.filter((k) => k.value !== "note").map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    className="bd-quicklog__btn"
                    onClick={() => {
                      setLogKind(k.value);
                      setLogOpen(true);
                    }}
                  >
                    <i className={`bi ${k.icon}`} /> {k.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="bd-compose">
              <textarea
                className="input"
                rows={1}
                placeholder="Or just add a note…  (Enter to save)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void saveNote();
                  }
                }}
              />
              <button className="btn" disabled={!note.trim() || noteBusy} onClick={saveNote}>
                Save
              </button>
            </div>
            {activities.length === 0 ? (
              <div className="bd-empty">
                <i className="bi bi-clock-history" />
                No activity yet. Tap Call or WhatsApp above — it logs itself.
              </div>
            ) : (
              <div className="bd-timeline">
                {activities.map((a) => {
                  const system = a.kind === "system" || a.kind === "stage_change";
                  return (
                    <div className="bd-tl" key={a.id}>
                      <div className={`bd-tl__icon${system ? " is-system" : ""}`}>
                        <i className={`bi ${KIND_ICON[a.kind] ?? "bi-dot"}`} />
                      </div>
                      <div className="bd-tl__body">
                        <div className="bd-tl__title">
                          {system ? "Update" : `${a.kind[0].toUpperCase()}${a.kind.slice(1)}${a.direction === "in" ? " (received)" : ""}`}
                          {a.outcome && <span className={`badge ${OUTCOME_BADGE[a.outcome] ?? "badge-muted"}`}>{OUTCOME_LABEL[a.outcome] ?? a.outcome}</span>}
                          <span className="bd-tl__time">{fmtWhen(a.occurred_at)}{a.user_name && !system ? ` · ${a.user_name}` : ""}</span>
                        </div>
                        {a.body && <div className="bd-tl__text">{a.body}</div>}
                        {a.meeting_url && (
                          <a href={a.meeting_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--gold)", fontSize: 13 }}>
                            Meeting link
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {tab === "followups" && (
          <section className="bd-list">
            <div className="bd-compose" style={{ justifyContent: "flex-end", borderBottom: followUps.length ? undefined : 0 }}>
              <button className="bd-link" onClick={() => setFollowOpen("follow_up")}>
                <i className="bi bi-alarm" /> Add follow-up
              </button>
              <button className="bd-link" onClick={() => setFollowOpen("meeting")}>
                <i className="bi bi-camera-video" /> Add meeting
              </button>
            </div>
            {followUps.length === 0 ? (
              <div className="bd-empty">
                <i className="bi bi-alarm" />
                Nothing scheduled. Always leave a next step.
              </div>
            ) : (
              followUps.map((f) => (
                <div className="bd-row" key={f.id}>
                  <button className="bd-check" onClick={() => completeFollowUp(f)} aria-label="Mark done" title="Mark done">
                    <i className="bi bi-check-lg" />
                  </button>
                  <div className="bd-row__main" style={{ cursor: "default" }}>
                    <div className="bd-row__title">{f.note || (f.kind === "meeting" ? "Meeting" : f.kind === "recontact" ? "Check back in" : "Follow up")}</div>
                    <div className="bd-row__meta">
                      <span className={isOverdue(f.due_at) && f.kind !== "meeting" ? "is-late" : ""}>
                        <i className={`bi ${KIND_ICON[f.kind] ?? "bi-alarm"}`} /> {fmtWhen(f.due_at)}
                      </span>
                      {f.meeting_url && (
                        <a href={f.meeting_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--gold)" }}>
                          Join
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="bd-row__actions">
                    <button className="bd-iconbtn" onClick={() => deleteFollowUp(f)} aria-label="Remove" title="Remove">
                      <i className="bi bi-trash3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {tab === "documents" && (
          <section className="bd-list" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {deal && !won && !closedLead ? (
              <>
                {docRow("proposal", proposal, deal.proposal)}
                {docRow("estimate", estimate, deal.estimate)}
                <button className="bd-link" style={{ alignSelf: "flex-start" }} onClick={() => setLinkOpen(true)}>
                  <i className="bi bi-link-45deg" /> Link an existing one
                </button>
                {deal.proposal && proposalShare}
              </>
            ) : deal ? (
              <>
                {deal.proposal ? docRow("proposal", proposal, deal.proposal) : null}
                {deal.estimate ? docRow("estimate", estimate, deal.estimate) : null}
                {link && proposalShare}
                {!deal.proposal && !deal.estimate && <span className="muted" style={{ fontSize: 13 }}>None were attached.</span>}
              </>
            ) : (
              <span className="muted" style={{ fontSize: 13.5 }}>Qualify the lead to build a proposal or estimate for it.</span>
            )}
          </section>
        )}

        {tab === "details" && (
          <section className="bd-list" style={{ padding: "6px 18px 14px" }}>
            <div className="bd-facts">
              <div><span className="k">Phone</span><span>{lead.phone || "—"}</span></div>
              <div><span className="k">WhatsApp</span><span>{lead.whatsapp || lead.phone || "—"}</span></div>
              <div><span className="k">Email</span>{lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : <span>—</span>}</div>
              <div>
                <span className="k">Website</span>
                {lead.website ? (
                  <a href={/^https?:/.test(lead.website) ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer">{lead.website}</a>
                ) : (
                  <span>—</span>
                )}
              </div>
              <div><span className="k">Source</span><span>{SOURCE_LABEL[lead.source] ?? lead.source}{lead.source_detail ? ` · ${lead.source_detail}` : ""}</span></div>
              <div><span className="k">Interest</span><span>{serviceLabels.join(", ") || "—"}</span></div>
              <div><span className="k">Location</span><span>{[lead.city, lead.country].filter(Boolean).join(", ") || "—"}</span></div>
              <div><span className="k">Owner</span><span>{lead.owner_name}</span></div>
            </div>
            <div className="bd-actions" style={{ marginTop: 12 }}>
              {isSuperadmin && (
                <button className="bd-link" onClick={() => setReassignOpen(true)}>
                  <i className="bi bi-arrow-left-right" /> Reassign
                </button>
              )}
              <button className="bd-link is-danger" onClick={deleteLead}>
                <i className="bi bi-trash3" /> Delete lead
              </button>
            </div>
          </section>
        )}
      </div>

      {mailStatus?.can_send && lead.email && (
        <EmailSheet
          open={emailProposal}
          onClose={() => setEmailProposal(false)}
          lead={lead}
          from={mailStatus.from}
          dealId={lead.deal?.id}
          hasProposal={!!lead.deal?.proposal}
          initialTemplate="proposal"
          onSent={load}
        />
      )}
      {mailStatus?.ai && (
        <EdithSheet
          open={edithOpen}
          onClose={() => setEdithOpen(false)}
          lead={lead}
          canEmail={!!mailStatus?.can_send}
          onUseEmail={(subject, body) => {
            setEdithOpen(false);
            setEmailDraft({ subject, body });
          }}
        />
      )}
      {mailStatus?.can_send && lead.email && (
        <EmailSheet
          open={!!emailDraft}
          onClose={() => setEmailDraft(null)}
          lead={lead}
          from={mailStatus.from}
          dealId={lead.deal?.id}
          hasProposal={!!lead.deal?.proposal}
          initialSubject={emailDraft?.subject ?? ""}
          initialBody={emailDraft?.body ?? ""}
          onSent={load}
        />
      )}
      <LogSheet open={logOpen} initialKind={logKind} onClose={() => setLogOpen(false)} leadId={lead.id} leadName={title} onSaved={load} />
      <FollowUpSheet open={!!followOpen} onClose={() => setFollowOpen(null)} leadId={lead.id} leadName={title} initialKind={followOpen ?? "follow_up"} onSaved={load} />
      <LeadForm open={editOpen} onClose={() => setEditOpen(false)} lead={lead} onSaved={() => load()} />
      <MoveSheet
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        current={stage as StageKey}
        title={title}
        allowEarly={!deal}
        onPick={(s) => {
          setMoveOpen(false);
          void requestMove(lead.id, s, title);
        }}
      />
      <Sheet
        open={clientOpen}
        onClose={() => setClientOpen(false)}
        title="Link a client"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setClientOpen(false)} disabled={handoverBusy}>
              Cancel
            </button>
            <button className="btn" onClick={linkClient} disabled={handoverBusy || !clientPick}>
              Link
            </button>
          </>
        }
      >
        <div className="bd-field">
          <span className="bd-label">Client</span>
          <Select
            value={clientPick}
            onChange={setClientPick}
            options={[{ value: "", label: "Select client…" }, ...clients.map((c) => ({ value: String(c.id), label: c.client_id ? `${c.client_id} · ${c.name}` : c.name }))]}
            ariaLabel="Client"
          />
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          Not in the list? Add the client in Sales → Clients first. Linking also attaches this deal&apos;s proposal and estimate to them.
        </p>
      </Sheet>
      {deal && isOpenDeal && <DealSheet open={dealOpen} onClose={() => setDealOpen(false)} deal={deal} onSaved={load} />}
      <DisqualifySheet
        open={disqualifyOpen}
        onClose={() => setDisqualifyOpen(false)}
        onConfirm={async (reason) => {
          await act(() => post(`/api/bd/leads/${lead.id}/disqualify`, { reason }), "Lead disqualified.");
          setDisqualifyOpen(false);
        }}
      />
      {deal && (
        <LinkDocSheet
          open={linkOpen}
          onClose={() => setLinkOpen(false)}
          onPick={async (kind, docId) => {
            await act(() => api(`/api/bd/deals/${deal.id}`, { method: "PATCH", body: JSON.stringify({ [kind]: docId }) }), "Linked.");
            setLinkOpen(false);
          }}
        />
      )}
      {isSuperadmin && (
        <ReassignSheet
          open={reassignOpen}
          onClose={() => setReassignOpen(false)}
          onConfirm={async (owner) => {
            await act(() => post("/api/bd/leads/reassign", { lead_ids: [lead.id], owner }), "Reassigned.");
            setReassignOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function DisqualifySheet({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const quick = ["Not interested", "Wrong number", "Not our service", "Student / personal project", "Budget too low"];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Disqualify lead"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            className="btn"
            disabled={busy || !reason.trim()}
            onClick={async () => {
              setBusy(true);
              await onConfirm(reason.trim());
              setBusy(false);
              setReason("");
            }}
          >
            Disqualify
          </button>
        </>
      }
    >
      <div className="bd-chips">
        {quick.map((q) => (
          <button key={q} className={`bd-chip${reason === q ? " is-on" : ""}`} onClick={() => setReason(q)}>{q}</button>
        ))}
      </div>
      <div className="bd-field">
        <label htmlFor="dq-reason">Reason (required)</label>
        <input id="dq-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      </div>
    </Sheet>
  );
}

function DealSheet({ open, onClose, deal, onSaved }: { open: boolean; onClose: () => void; deal: NonNullable<BDLead["deal"]>; onSaved: () => void }) {
  const { showToast } = useToast();
  const [title, setTitle] = useState(deal.title);
  const [value, setValue] = useState(String(Number(deal.value) || ""));
  const [currency, setCurrency] = useState<string>(deal.currency);
  const [close, setClose] = useState(deal.expected_close_date ?? "");
  const [prob, setProb] = useState(String(deal.probability));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(deal.title);
    setValue(String(Number(deal.value) || ""));
    setCurrency(deal.currency);
    setClose(deal.expected_close_date ?? "");
    setProb(String(deal.probability));
  }, [open, deal]);

  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/bd/deals/${deal.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim() || deal.title,
          value: value || "0",
          currency,
          expected_close_date: close || null,
          probability: Number(prob) || 0,
        }),
      });
      showToast("Deal updated.");
      onSaved();
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't save.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Deal details"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn" onClick={save} disabled={busy}>Save</button>
        </>
      }
    >
      <div className="bd-field">
        <label htmlFor="deal-title">Deal title</label>
        <input id="deal-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </div>
      <div className="bd-field">
        <span className="bd-label">Value</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 96px", gap: 8 }}>
          <input className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Deal value" />
          <Select value={currency} onChange={setCurrency} options={[{ value: "AED", label: "AED" }, { value: "USD", label: "USD" }]} ariaLabel="Currency" />
        </div>
      </div>
      <div className="bd-grid2">
        <div className="bd-field">
          <span className="bd-label">Expected close</span>
          <DatePicker value={close} onChange={setClose} ariaLabel="Expected close date" />
        </div>
        <div className="bd-field">
          <label htmlFor="deal-prob">Win probability (%)</label>
          <input id="deal-prob" className="input" inputMode="numeric" value={prob} onChange={(e) => setProb(e.target.value.replace(/\D/g, "").slice(0, 3))} />
        </div>
      </div>
    </Sheet>
  );
}

function LinkDocSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (kind: "proposal" | "estimate", id: number) => Promise<void> }) {
  const [proposals, setProposals] = useState<Doc[]>([]);
  const [estimates, setEstimates] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      api<{ results: Doc[] }>("/api/sales/proposals?page_size=100").then((d) => setProposals(unwrapList(d))),
      api<{ results: Doc[] }>("/api/sales/estimates?page_size=100").then((d) => setEstimates(unwrapList(d))),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);
  const list = (kind: "proposal" | "estimate", docs: Doc[]) =>
    docs.map((d) => (
      <button key={`${kind}${d.id}`} className="bd-doc" style={{ cursor: "pointer", font: "inherit", color: "inherit", textAlign: "left" }} onClick={() => onPick(kind, d.id)}>
        <i className={`bi ${kind === "proposal" ? "bi-file-earmark-text-fill" : "bi-receipt-cutoff"}`} />
        <span style={{ flex: 1, minWidth: 0 }}>{d.title}</span>
        <span className="badge badge-muted">{d.status}</span>
      </button>
    ));
  return (
    <Sheet open={open} onClose={onClose} title="Link an existing document">
      {loading ? (
        <Loader />
      ) : (
        <>
          <span className="bd-label">Proposals</span>
          {proposals.length ? list("proposal", proposals) : <span className="muted">You haven&apos;t built any proposals yet.</span>}
          <span className="bd-label">Estimates</span>
          {estimates.length ? list("estimate", estimates) : <span className="muted">You haven&apos;t built any estimates yet.</span>}
        </>
      )}
    </Sheet>
  );
}

function ReassignSheet({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (owner: number) => Promise<void> }) {
  const [owners, setOwners] = useState<{ id: number; name: string }[]>([]);
  const [to, setTo] = useState("");
  useEffect(() => {
    if (open) api<{ id: number; name: string }[]>("/api/bd/leads/owners").then(setOwners).catch(() => {});
  }, [open]);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Reassign lead"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={!to} onClick={() => onConfirm(Number(to))}>Reassign</button>
        </>
      }
    >
      <Select value={to} onChange={setTo} options={[{ value: "", label: "Choose a BDE…" }, ...owners.map((o) => ({ value: String(o.id), label: o.name }))]} ariaLabel="New owner" />
    </Sheet>
  );
}
