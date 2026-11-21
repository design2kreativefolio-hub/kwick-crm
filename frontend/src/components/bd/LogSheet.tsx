"use client";

import { useEffect, useState } from "react";

import { Sheet } from "@/components/bd/Sheet";
import { WhenPicker } from "@/components/bd/WhenPicker";
import { api, formatApiError, ApiError } from "@/lib/api";
import { ACTIVITY_KINDS, OUTCOMES, type BDActivity } from "@/lib/bd";
import { useToast } from "@/lib/toast";

/**
 * Log what just happened: kind → outcome → note → next follow-up. Also used
 * to complete the entry that a one-tap call / WhatsApp / email auto-logged
 * (pass `editActivity`), so those taps never create duplicate timeline rows.
 */
export function LogSheet({
  open,
  onClose,
  leadId,
  leadName,
  initialKind = "call",
  editActivity,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  leadId: number;
  leadName: string;
  initialKind?: BDActivity["kind"];
  editActivity?: BDActivity | null;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [kind, setKind] = useState<BDActivity["kind"]>(initialKind);
  const [outcome, setOutcome] = useState("");
  const [body, setBody] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [next, setNext] = useState<Date | null>(null);
  const [followNote, setFollowNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(editActivity?.kind ?? initialKind);
    setOutcome(editActivity?.outcome ?? "");
    // The auto-logged placeholder ("Call started") is replaced, not appended to.
    setBody(editActivity && /^(Call started|Chat opened|Email opened)$/.test(editActivity.body) ? "" : editActivity?.body ?? "");
    setMeetingUrl(editActivity?.meeting_url ?? "");
    setNext(null);
    setFollowNote("");
  }, [open, initialKind, editActivity]);

  const showOutcome = kind !== "note";

  const submit = async () => {
    if (!body.trim() && !outcome && kind === "note") {
      showToast("Write a note first.", "error");
      return;
    }
    setSaving(true);
    try {
      if (editActivity) {
        await api(`/api/bd/activities/${editActivity.id}`, {
          method: "PATCH",
          body: JSON.stringify({ outcome, body: body.trim(), meeting_url: meetingUrl }),
        });
        if (next) {
          await api("/api/bd/follow-ups", {
            method: "POST",
            body: JSON.stringify({ lead: leadId, due_at: next.toISOString(), note: followNote.trim() }),
          });
        }
      } else {
        await api("/api/bd/activities", {
          method: "POST",
          body: JSON.stringify({
            lead: leadId,
            kind,
            direction: "out",
            outcome: showOutcome ? outcome : "",
            body: body.trim(),
            meeting_url: kind === "meeting" ? meetingUrl : "",
            ...(next ? { next_follow_up: { due_at: next.toISOString(), note: followNote.trim() } } : {}),
          }),
        });
      }
      showToast("Logged.");
      onSaved();
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't save.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editActivity ? `Add outcome · ${leadName}` : `Log activity · ${leadName}`}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {!editActivity && (
        <div className="bd-field">
          <span className="bd-label">What happened</span>
          <div className="bd-chips bd-chips--scroll">
            {ACTIVITY_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                className={`bd-chip${kind === k.value ? " is-on" : ""}`}
                onClick={() => setKind(k.value)}
              >
                <i className={`bi ${k.icon}`} /> {k.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {showOutcome && (
        <div className="bd-field">
          <span className="bd-label">Outcome</span>
          <div className="bd-chips">
            {OUTCOMES.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`bd-chip${outcome === o.value ? " is-on" : ""}`}
                onClick={() => setOutcome(outcome === o.value ? "" : o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bd-field">
        <label htmlFor="bd-log-note">{kind === "note" ? "Note" : "Notes"}</label>
        <textarea
          id="bd-log-note"
          className="input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={kind === "note" ? "What should be remembered about this lead?" : "What was discussed?"}
          autoFocus={kind === "note"}
        />
      </div>

      {kind === "meeting" && !editActivity && (
        <div className="bd-field">
          <label htmlFor="bd-log-url">Meeting link (optional)</label>
          <input
            id="bd-log-url"
            className="input"
            type="url"
            value={meetingUrl}
            onChange={(e) => setMeetingUrl(e.target.value)}
            placeholder="https://meet.google.com/…"
          />
        </div>
      )}

      <div className="bd-field">
        <span className="bd-label">Next step</span>
        <WhenPicker value={next} onChange={setNext} />
        {next && (
          <input
            className="input"
            value={followNote}
            onChange={(e) => setFollowNote(e.target.value)}
            placeholder="What to do then? e.g. Send revised quote"
            maxLength={300}
          />
        )}
      </div>
    </Sheet>
  );
}
