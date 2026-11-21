"use client";

import { useEffect, useState } from "react";

import { Sheet } from "@/components/bd/Sheet";
import { api, ApiError, formatApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";

const QUICK = ["Not interested", "Wrong number", "No answer after several tries", "Not our service", "Spam / fake", "Budget too low"];

/** Close one or many leads with a reason (kept on each lead's timeline). */
export function BulkDisqualifySheet({
  open,
  onClose,
  leadIds,
  name,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  leadIds: number[];
  name?: string;
  onDone: () => void;
}) {
  const { showToast } = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api<{ disqualified: number; skipped: number }>("/api/bd/leads/bulk-disqualify", {
        method: "POST",
        body: JSON.stringify({ lead_ids: leadIds, reason: reason.trim() }),
      });
      showToast(`${r.disqualified} lead${r.disqualified === 1 ? "" : "s"} closed${r.skipped ? ` · ${r.skipped} skipped` : ""}.`);
      onDone();
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't close the leads.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={name ? `Disqualify · ${name}` : `Disqualify ${leadIds.length} lead${leadIds.length === 1 ? "" : "s"}`}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn" onClick={submit} disabled={busy || !reason.trim() || leadIds.length === 0}>
            {busy ? "Working…" : "Disqualify"}
          </button>
        </>
      }
    >
      <div className="bd-chips">
        {QUICK.map((q) => (
          <button key={q} type="button" className={`bd-chip${reason === q ? " is-on" : ""}`} onClick={() => setReason(q)}>
            {q}
          </button>
        ))}
      </div>
      <div className="bd-field">
        <label htmlFor="bdq-reason">Reason (required)</label>
        <input id="bdq-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      </div>
    </Sheet>
  );
}
