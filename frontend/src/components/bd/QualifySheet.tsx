"use client";

import { useEffect, useState } from "react";

import { Sheet } from "@/components/bd/Sheet";
import { Select } from "@/components/Select";
import { api, ApiError, formatApiError } from "@/lib/api";
import { followUpPresets, type BDLead } from "@/lib/bd";
import { useToast } from "@/lib/toast";

/**
 * Qualify one lead (name, value and an optional first follow-up) or several at
 * once. A qualified lead becomes a deal and appears in the Pipeline.
 */
export function QualifySheet({
  open,
  onClose,
  leads,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  leads: BDLead[];
  onDone: () => void;
}) {
  const { showToast } = useToast();
  const one = leads.length === 1 ? leads[0] : null;
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("AED");
  const [preset, setPreset] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const presets = followUpPresets();

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setValue(one && Number(one.est_value) > 0 ? String(Number(one.est_value)) : "");
    setCurrency(one?.currency ?? "AED");
    setPreset(null);
  }, [open, one]);

  const submit = async () => {
    setBusy(true);
    try {
      if (one) {
        await api(`/api/bd/leads/${one.id}/qualify`, {
          method: "POST",
          body: JSON.stringify({ title: title.trim(), value: value ? Number(value) : undefined, currency }),
        });
        if (preset !== null) {
          await api("/api/bd/follow-ups", {
            method: "POST",
            body: JSON.stringify({ lead: one.id, due_at: presets[preset].at().toISOString(), kind: "follow_up", note: "First follow-up" }),
          });
        }
        showToast("Qualified — it's now in the Pipeline.");
      } else {
        const r = await api<{ qualified: number; skipped: number }>("/api/bd/leads/bulk-qualify", {
          method: "POST",
          body: JSON.stringify({ lead_ids: leads.map((l) => l.id) }),
        });
        showToast(`${r.qualified} qualified and added to the Pipeline${r.skipped ? ` · ${r.skipped} skipped` : ""}.`);
      }
      onDone();
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't qualify.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={one ? `Qualify · ${one.display_name}` : `Qualify ${leads.length} leads`}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn" onClick={submit} disabled={busy || leads.length === 0}>
            {busy ? "Working…" : one ? "Qualify" : `Qualify ${leads.length}`}
          </button>
        </>
      }
    >
      {one ? (
        <>
          <div className="bd-field">
            <label htmlFor="q-title">Deal name (optional)</label>
            <input id="q-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${one.display_name} — service`} maxLength={200} />
          </div>
          <div className="bd-grid2">
            <div className="bd-field">
              <label htmlFor="q-value">Value</label>
              <input id="q-value" className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" />
            </div>
            <div className="bd-field">
              <span className="bd-label">Currency</span>
              <Select value={currency} onChange={setCurrency} options={[{ value: "AED", label: "AED" }, { value: "USD", label: "USD" }]} ariaLabel="Currency" />
            </div>
          </div>
          <div className="bd-field">
            <span className="bd-label">First follow-up (optional)</span>
            <div className="bd-chips">
              {presets.map((p, i) => (
                <button key={p.label} type="button" className={`bd-chip${preset === i ? " is-on" : ""}`} onClick={() => setPreset(preset === i ? null : i)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          These leads become deals at <b>Qualified</b> and move to the Pipeline. Leads that already have a deal, or are closed, are skipped.
        </p>
      )}
    </Sheet>
  );
}
