"use client";

import { useState } from "react";

import { Sheet } from "@/components/bd/Sheet";
import { api, ApiError, formatApiError } from "@/lib/api";
import { LOST_REASONS, STAGES, STAGE_LABEL, type StageKey } from "@/lib/bd";
import { useToast } from "@/lib/toast";

function LostSheet({
  open,
  title,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onConfirm: (reason: string, note: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const needNote = reason === "other";
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Mark as lost · ${title}`}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn"
            disabled={busy || !reason || (needNote && !note.trim())}
            onClick={async () => {
              setBusy(true);
              await onConfirm(reason, note.trim());
              setBusy(false);
              setReason("");
              setNote("");
            }}
          >
            {busy ? "Saving…" : "Mark as lost"}
          </button>
        </>
      }
    >
      <div className="bd-field">
        <span className="bd-label">Why was it lost?</span>
        <div className="bd-chips">
          {LOST_REASONS.map((r) => (
            <button key={r.value} type="button" className={`bd-chip${reason === r.value ? " is-on" : ""}`} onClick={() => setReason(r.value)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="bd-field">
        <label htmlFor="lost-note">{needNote ? "Tell us more (required)" : "Note (optional)"}</label>
        <textarea id="lost-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
        We&apos;ll remind you to get back in touch in 90 days.
      </p>
    </Sheet>
  );
}

function WinSheet({
  open,
  title,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`🎉 Won · ${title}`}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm();
              setBusy(false);
            }}
          >
            {busy ? "Saving…" : "Mark as won"}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 13.5 }}>
        Nothing is created automatically. The admin adds the client from Sales and can draft the invoice from this deal when ready. You can move the deal back to an
        earlier stage later if needed.
      </p>
    </Sheet>
  );
}

/** "Move to…" stage picker (phones have no drag and drop). */
export function MoveSheet({
  open,
  onClose,
  current,
  title,
  allowEarly,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  current: StageKey;
  title: string;
  /** New / Contacted are only valid for leads that aren't deals yet. */
  allowEarly: boolean;
  onPick: (stage: StageKey) => void;
}) {
  // A won deal can only go back to an open stage.
  const OPEN: StageKey[] = ["qualified", "meeting", "proposal_sent", "negotiation"];
  const stages = STAGES.filter((s) =>
    current === "won" ? OPEN.includes(s.key) : allowEarly ? true : s.key !== "new" && s.key !== "contacted"
  );
  return (
    <Sheet open={open} onClose={onClose} title={current === "won" ? `Move back · ${title}` : `Move · ${title}`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {stages.map((s) => (
          <button
            key={s.key}
            type="button"
            className="bd-doc"
            style={{ cursor: s.key === current ? "default" : "pointer", font: "inherit", color: "inherit", textAlign: "left", opacity: s.key === current ? 0.5 : 1 }}
            disabled={s.key === current}
            onClick={() => onPick(s.key)}
          >
            <i className={`bi ${s.icon}`} />
            <b style={{ flex: 1 }}>{s.label}</b>
            {s.key === current && <span className="muted">current</span>}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/**
 * One place that knows how to move a lead between stages: plain stages go
 * straight through; Lost asks for a reason; Won asks for the handover options.
 */
export function useStageMove(onMoved: () => void) {
  const { showToast } = useToast();
  const [pending, setPending] = useState<{ leadId: number; target: "lost" | "won"; title: string } | null>(null);

  const call = async (leadId: number, body: Record<string, unknown>): Promise<boolean> => {
    try {
      await api(`/api/bd/leads/${leadId}/move`, { method: "POST", body: JSON.stringify(body) });
      onMoved();
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't move it.", "error");
      return false;
    }
  };

  const requestMove = async (leadId: number, stage: StageKey, title: string): Promise<boolean> => {
    if (stage === "lost" || stage === "won") {
      setPending({ leadId, target: stage, title });
      return false;
    }
    const ok = await call(leadId, { stage });
    if (ok) showToast(`Moved to ${STAGE_LABEL[stage]}.`);
    return ok;
  };

  const dialogs = (
    <>
      <LostSheet
        open={pending?.target === "lost"}
        title={pending?.title ?? ""}
        onClose={() => setPending(null)}
        onConfirm={async (reason, note) => {
          if (pending && (await call(pending.leadId, { stage: "lost", lost_reason: reason, lost_note: note }))) {
            showToast("Marked as lost.");
            setPending(null);
          }
        }}
      />
      <WinSheet
        open={pending?.target === "won"}
        title={pending?.title ?? ""}
        onClose={() => setPending(null)}
        onConfirm={async () => {
          if (pending && (await call(pending.leadId, { stage: "won" }))) {
            showToast("Deal won. 🎉");
            setPending(null);
          }
        }}
      />
    </>
  );

  return { requestMove, dialogs };
}
