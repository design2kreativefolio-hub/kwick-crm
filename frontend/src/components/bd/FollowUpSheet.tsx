"use client";

import { useEffect, useState } from "react";

import { Sheet } from "@/components/bd/Sheet";
import { WhenPicker } from "@/components/bd/WhenPicker";
import { api, ApiError, formatApiError } from "@/lib/api";
import { FOLLOW_UP_KINDS } from "@/lib/bd";
import { useToast } from "@/lib/toast";

/** Schedule a follow-up or a meeting. Both land on the Kwick calendar. */
export function FollowUpSheet({
  open,
  onClose,
  leadId,
  leadName,
  initialKind = "follow_up",
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  leadId: number;
  leadName: string;
  initialKind?: string;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [kind, setKind] = useState(initialKind);
  const [when, setWhen] = useState<Date | null>(null);
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setWhen(null);
    setNote("");
    setUrl("");
  }, [open, initialKind]);

  const submit = async () => {
    if (!when) {
      showToast("Pick when it's due.", "error");
      return;
    }
    setSaving(true);
    try {
      await api("/api/bd/follow-ups", {
        method: "POST",
        body: JSON.stringify({
          lead: leadId,
          kind,
          due_at: when.toISOString(),
          note: note.trim(),
          meeting_url: kind === "meeting" ? url.trim() : "",
        }),
      });
      showToast(kind === "meeting" ? "Meeting scheduled." : "Follow-up scheduled.");
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
      title={`Schedule · ${leadName}`}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Schedule"}
          </button>
        </>
      }
    >
      <div className="bd-field">
        <span className="bd-label">Type</span>
        <div className="bd-chips bd-chips--scroll">
          {FOLLOW_UP_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              className={`bd-chip${kind === k.value ? " is-on" : ""}`}
              onClick={() => setKind(k.value)}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>
      <div className="bd-field">
        <span className="bd-label">When</span>
        <WhenPicker value={when} onChange={setWhen} allowNone={false} />
      </div>
      <div className="bd-field">
        <label htmlFor="bd-fu-note">Note</label>
        <input
          id="bd-fu-note"
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What to do? e.g. Walk through the proposal"
          maxLength={300}
        />
      </div>
      {kind === "meeting" && (
        <div className="bd-field">
          <label htmlFor="bd-fu-url">Meeting link (optional)</label>
          <input
            id="bd-fu-url"
            className="input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://teams.microsoft.com/…"
          />
        </div>
      )}
    </Sheet>
  );
}
