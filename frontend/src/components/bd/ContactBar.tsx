"use client";

import { useEffect, useState } from "react";

import { EmailSheet } from "@/components/bd/EmailSheet";
import { LogSheet } from "@/components/bd/LogSheet";
import { Sheet } from "@/components/bd/Sheet";
import { api, ApiError, formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  WA_TEMPLATES,
  fillTemplate,
  loadMailStatus,
  mailUrl,
  telUrl,
  waDigits,
  waUrl,
  type BDActivity,
  type MailStatus,
} from "@/lib/bd";
import { useToast } from "@/lib/toast";

type ContactLead = {
  id: number;
  phone: string;
  whatsapp: string;
  email: string;
  contact_name: string;
  company: string;
};

const LABEL = { call: "Call", whatsapp: "WhatsApp", email: "Email" } as const;

/**
 * One-tap Call / WhatsApp / Email. Every tap is logged to the lead's timeline
 * automatically (so the first-contact clock and "gone quiet" alerts stay
 * honest); a toast then offers to add the outcome in one more tap.
 */
export function ContactBar({
  lead,
  compact = false,
  onLogged,
  display,
  deal,
}: {
  lead: ContactLead;
  /** Icon-only buttons for list rows. */
  compact?: boolean;
  onLogged?: () => void;
  display?: string;
  /** Lets the email composer offer the tracked proposal link. */
  deal?: { id: number; proposal: number | null } | null;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [waOpen, setWaOpen] = useState(false);
  const [editing, setEditing] = useState<BDActivity | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [mailStatus, setMailStatus] = useState<MailStatus | null>(null);

  useEffect(() => {
    let live = true;
    loadMailStatus(() => api<MailStatus>("/api/bd/mail-status")).then((m) => live && setMailStatus(m));
    return () => {
      live = false;
    };
  }, []);
  const name = display || lead.company || lead.contact_name || "this lead";
  const waNumber = lead.whatsapp || lead.phone;

  const quickLog = async (kind: keyof typeof LABEL, body: string) => {
    try {
      const act = await api<BDActivity>("/api/bd/activities", {
        method: "POST",
        body: JSON.stringify({ lead: lead.id, kind, direction: "out", body }),
      });
      showToast(`${LABEL[kind]} logged — tap to add the outcome`, "success", () => setEditing(act));
      onLogged?.();
      return act;
    } catch (err) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't log that.", "error");
      return null;
    }
  };

  /** Log first (so a call app taking over the screen can't cancel it), then go. */
  const logThen = async (kind: keyof typeof LABEL, body: string, go: () => void) => {
    await Promise.race([quickLog(kind, body), new Promise((r) => setTimeout(r, 700))]);
    go();
  };

  const call = () => {
    const url = telUrl(lead.phone);
    if (!url) return;
    void logThen("call", "Call started", () => {
      window.location.href = url;
    });
  };

  const email = () => {
    if (!lead.email) return;
    // Sending from Kwick (logged automatically) when the server can; otherwise the phone's mail app.
    if (mailStatus?.can_send) {
      setEmailOpen(true);
      return;
    }
    void logThen("email", "Email opened", () => {
      window.location.href = mailUrl(lead.email);
    });
  };

  const sendWhatsApp = (text: string) => {
    const url = waUrl(waNumber, text);
    setWaOpen(false);
    if (!url) return;
    void logThen("whatsapp", text ? `Message: ${text}` : "Chat opened", () => {
      window.open(url, "_blank", "noopener");
    });
  };

  const vars = { name: lead.contact_name, company: lead.company, me: user?.full_name };

  const buttons = [
    { key: "call", icon: "bi-telephone-fill", label: "Call", off: !telUrl(lead.phone), onClick: call, cls: "" },
    {
      key: "wa",
      icon: "bi-whatsapp",
      label: "WhatsApp",
      off: !waDigits(waNumber),
      onClick: () => setWaOpen(true),
      cls: "is-wa",
    },
    { key: "email", icon: "bi-envelope-fill", label: "Email", off: !lead.email, onClick: email, cls: "" },
  ];

  return (
    <>
      {compact ? (
        <div className="bd-row__actions">
          {buttons.map((b) => (
            <button
              key={b.key}
              type="button"
              className={`bd-iconbtn ${b.cls}${b.off ? " is-off" : ""}`}
              onClick={b.onClick}
              aria-label={b.label}
              title={b.label}
            >
              <i className={`bi ${b.icon}`} />
            </button>
          ))}
        </div>
      ) : (
        <div className="bd-contactbar">
          {buttons.map((b) => (
            <button key={b.key} type="button" onClick={b.onClick} disabled={b.off}>
              <i className={`bi ${b.icon}`} style={b.key === "wa" ? { color: "#1fa855" } : undefined} /> {b.label}
            </button>
          ))}
        </div>
      )}

      <Sheet open={waOpen} onClose={() => setWaOpen(false)} title={`WhatsApp · ${name}`}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Pick a ready-made message (opens WhatsApp with it filled in) — you can still edit it before sending.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {WA_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="bd-doc"
              style={{ textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }}
              onClick={() => sendWhatsApp(fillTemplate(t.text, vars))}
            >
              <i className="bi bi-chat-text-fill" />
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: "block", fontSize: 13.5 }}>{t.label}</b>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {fillTemplate(t.text, vars).slice(0, 110)}…
                </span>
              </span>
            </button>
          ))}
          <button type="button" className="btn btn-ghost" onClick={() => sendWhatsApp("")}>
            Open a blank chat
          </button>
        </div>
      </Sheet>

      {mailStatus?.can_send && (
        <EmailSheet
          open={emailOpen}
          onClose={() => setEmailOpen(false)}
          lead={lead}
          from={mailStatus.from}
          dealId={deal?.id}
          hasProposal={!!deal?.proposal}
          onSent={() => onLogged?.()}
        />
      )}

      <LogSheet
        open={!!editing}
        onClose={() => setEditing(null)}
        leadId={lead.id}
        leadName={name}
        editActivity={editing}
        onSaved={() => onLogged?.()}
      />
    </>
  );
}
