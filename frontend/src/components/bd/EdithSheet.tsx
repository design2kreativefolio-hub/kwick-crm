"use client";

import { useEffect, useState } from "react";

import { Sheet } from "@/components/bd/Sheet";
import { api, ApiError, formatApiError } from "@/lib/api";
import { mailUrl, waUrl, type BDLead } from "@/lib/bd";
import { useToast } from "@/lib/toast";

type Mode = "summary" | "draft" | "next_step";

const MODES: { key: Mode; label: string; icon: string; hint: string }[] = [
  { key: "summary", label: "Summarise", icon: "bi-card-text", hint: "A few lines on where this lead stands." },
  { key: "draft", label: "Draft a message", icon: "bi-chat-left-text", hint: "A follow-up you can edit before sending." },
  { key: "next_step", label: "Next step", icon: "bi-signpost-split", hint: "What to do next, and why." },
];

/**
 * EDITH on one lead. It only writes text for you to read and edit: nothing is sent
 * or saved until you do it yourself.
 */
export function EdithSheet({
  open,
  onClose,
  lead,
  canEmail,
  onUseEmail,
}: {
  open: boolean;
  onClose: () => void;
  lead: BDLead;
  /** The in-app email composer is available (opens with the draft filled in). */
  canEmail: boolean;
  onUseEmail: (subject: string, body: string) => void;
}) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<Mode>("summary");
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode("summary");
    setText("");
    setSubject("");
    setError("");
  }, [open]);

  const run = async (m: Mode = mode) => {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ text?: string; subject?: string; body?: string }>(`/api/bd/leads/${lead.id}/edith`, {
        method: "POST",
        body: JSON.stringify({ action: m, channel }),
      });
      if (m === "draft") {
        setSubject(r.subject ?? "");
        setText(r.body ?? "");
      } else {
        setText(r.text ?? "");
      }
    } catch (err) {
      setError(err instanceof ApiError ? formatApiError(err.data) : "EDITH couldn't answer right now.");
    } finally {
      setBusy(false);
    }
  };

  const pick = (m: Mode) => {
    setMode(m);
    setText("");
    setSubject("");
    setError("");
    if (m !== "draft") void run(m); // summary and next step run straight away; a draft asks for the channel first
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(mode === "draft" && channel === "email" ? `Subject: ${subject}\n\n${text}` : text);
      showToast("Copied.");
    } catch {
      showToast("Couldn't copy. Select the text and copy it.", "error");
    }
  };

  const phone = lead.whatsapp || lead.phone;
  const current = MODES.find((x) => x.key === mode)!;

  return (
    <Sheet open={open} onClose={onClose} wide title={`EDITH · ${lead.display_name}`}>
      <div className="bd-chips">
        {MODES.map((m) => (
          <button key={m.key} type="button" className={`bd-chip${mode === m.key && (text || busy || m.key === "draft") ? " is-on" : ""}`} onClick={() => pick(m.key)} disabled={busy}>
            <i className={`bi ${m.icon}`} /> {m.label}
          </button>
        ))}
      </div>

      {mode === "draft" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div className="bd-chips">
            <button type="button" className={`bd-chip${channel === "whatsapp" ? " is-on" : ""}`} onClick={() => setChannel("whatsapp")}>
              <i className="bi bi-whatsapp" /> WhatsApp
            </button>
            <button type="button" className={`bd-chip${channel === "email" ? " is-on" : ""}`} onClick={() => setChannel("email")}>
              <i className="bi bi-envelope" /> Email
            </button>
          </div>
          <button className="btn btn-sm" onClick={() => run("draft")} disabled={busy}>
            {busy ? "Writing…" : text ? "Write another" : "Write the draft"}
          </button>
        </div>
      )}

      {busy && mode !== "draft" && <p className="muted" style={{ margin: 0 }}>EDITH is reading the timeline…</p>}
      {error && (
        <div className="bd-alert is-danger" role="alert">
          <i className="bi bi-exclamation-triangle-fill" />
          <span style={{ flex: 1 }}>{error}</span>
          <button className="bd-link" onClick={() => run()}>
            Try again
          </button>
        </div>
      )}

      {!busy && !text && !error && <p className="muted" style={{ margin: 0 }}>{current.hint}</p>}

      {text && mode !== "draft" && (
        <div className="bd-doc" style={{ display: "block", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
          {text}
        </div>
      )}

      {text && mode === "draft" && (
        <>
          {channel === "email" && (
            <div className="bd-field">
              <label htmlFor="ed-subject">Subject</label>
              <input id="ed-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
            </div>
          )}
          <div className="bd-field">
            <label htmlFor="ed-body">{channel === "email" ? "Email" : "WhatsApp message"} (edit it before you send)</label>
            <textarea id="ed-body" className="input" rows={channel === "email" ? 9 : 5} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="bd-actions">
            <button className="btn btn-sm btn-ghost" onClick={copy}>
              <i className="bi bi-clipboard" /> Copy
            </button>
            {channel === "whatsapp" && phone && (
              <a className="btn btn-sm" href={waUrl(phone, text)} target="_blank" rel="noopener noreferrer">
                <i className="bi bi-whatsapp" /> Open in WhatsApp
              </a>
            )}
            {channel === "email" && lead.email && canEmail && (
              <button className="btn btn-sm" onClick={() => onUseEmail(subject, text)}>
                <i className="bi bi-send" /> Use in email
              </button>
            )}
            {channel === "email" && lead.email && !canEmail && (
              <a className="btn btn-sm" href={mailUrl(lead.email, subject, text)}>
                <i className="bi bi-envelope" /> Open in mail app
              </a>
            )}
          </div>
        </>
      )}

      {text && mode !== "draft" && (
        <div className="bd-actions">
          <button className="btn btn-sm btn-ghost" onClick={copy}>
            <i className="bi bi-clipboard" /> Copy
          </button>
          <button className="bd-link" onClick={() => run()} disabled={busy}>
            <i className="bi bi-arrow-repeat" /> Ask again
          </button>
        </div>
      )}
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>EDITH only suggests. Check facts and wording before you act on it.</p>
    </Sheet>
  );
}
