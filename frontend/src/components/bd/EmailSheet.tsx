"use client";

import { useEffect, useState } from "react";

import { Sheet } from "@/components/bd/Sheet";
import { api, ApiError, formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { EMAIL_TEMPLATES, type ProposalLinkInfo } from "@/lib/bd";
import { useToast } from "@/lib/toast";

export type EmailLead = { id: number; email: string; contact_name: string; company: string };

function fill(text: string, v: { name?: string; company?: string; me?: string; link?: string }) {
  return text
    .replace(/\{name\}/g, (v.name || "there").split(" ")[0])
    .replace(/\{company\}/g, v.company || "your business")
    .replace(/\{me\}/g, v.me || "the Kreativefolio team")
    .replace(/\{link\}/g, v.link || "");
}

/**
 * Compose a one-to-one email from the sales mailbox. The server sends it and
 * logs it on the lead's timeline. Templates that point at the proposal create
 * (or reuse) the tracked link, so we see when it's opened.
 */
export function EmailSheet({
  open,
  onClose,
  lead,
  from,
  dealId,
  hasProposal,
  initialTemplate,
  initialSubject,
  initialBody,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  lead: EmailLead;
  from?: string;
  dealId?: number | null;
  hasProposal?: boolean;
  initialTemplate?: string;
  /** Start with this text instead of a template (e.g. a draft written by EDITH). */
  initialSubject?: string;
  initialBody?: string;
  onSent?: () => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tpl, setTpl] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const canLink = !!dealId && !!hasProposal;
  const templates = EMAIL_TEMPLATES.filter((t) => !t.needsLink || canLink);

  const apply = async (id: string) => {
    const t = EMAIL_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    let link = "";
    if (t.needsLink && dealId) {
      try {
        const info = await api<ProposalLinkInfo>(`/api/bd/deals/${dealId}/proposal-link`, { method: "POST" });
        link = info.url;
      } catch (err) {
        showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't create the proposal link.", "error");
        return;
      }
    }
    const vars = { name: lead.contact_name, company: lead.company, me: user?.full_name, link };
    setTpl(id);
    setSubject(fill(t.subject, vars));
    setBody(fill(t.body, vars));
  };

  useEffect(() => {
    if (!open) return;
    setTpl("");
    setSubject(initialSubject ?? "");
    setBody(initialBody ?? "");
    if (initialTemplate && initialBody == null) void apply(initialTemplate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTemplate, initialSubject, initialBody]);

  const send = async () => {
    setBusy(true);
    try {
      await api(`/api/bd/leads/${lead.id}/send-email`, { method: "POST", body: JSON.stringify({ subject, body }) });
      showToast(`Email sent to ${lead.email}.`);
      onSent?.();
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't send the email.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Send an email"
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn" onClick={send} disabled={busy || !subject.trim() || !body.trim()}>
            <i className="bi bi-send" /> {busy ? "Sending…" : "Send"}
          </button>
        </>
      }
    >
      <div className="bd-sub" style={{ marginTop: -4 }}>
        To <b style={{ color: "var(--text)" }}>{lead.email}</b>
        {from ? <> · from {from}</> : null}
      </div>
      <div className="bd-chips bd-chips--scroll">
        {templates.map((t) => (
          <button key={t.id} className={`bd-chip${tpl === t.id ? " is-on" : ""}`} onClick={() => void apply(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="bd-field">
        <label htmlFor="em-subject">Subject</label>
        <input id="em-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
      </div>
      <div className="bd-field">
        <label htmlFor="em-body">Message</label>
        <textarea id="em-body" className="input" rows={10} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />
      </div>
      <div className="bd-sub">Replies land in the sales inbox and show on this lead&apos;s timeline once inbox sync is on.</div>
    </Sheet>
  );
}
