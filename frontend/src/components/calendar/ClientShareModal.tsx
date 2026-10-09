"use client";

import { useEffect, useState } from "react";

import { DatePicker } from "@/components/DatePicker";
import { Modal } from "@/components/Modal";
import { api, ApiError, formatApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";

type Share = { active: boolean; token: string; expires_at: string | null; expired: boolean };

function isoDay(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

/** Create / copy / expire / turn off the read-only client calendar link. */
export function ClientShareModal({
  open,
  onClose,
  clientId,
  clientName,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
}) {
  const { showToast } = useToast();
  const [share, setShare] = useState<Share | null>(null);
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    api<Share>(`/api/projects/content-calendar/share?client=${clientId}`)
      .then((s) => {
        setShare(s);
        setExpiry(isoDay(s.expires_at));
      })
      .catch(() => setError("Couldn't load the share link."));
  }, [open, clientId]);

  const link =
    share?.token && typeof window !== "undefined" ? `${window.location.origin}/client-view/${share.token}` : "";

  const run = async (fn: () => Promise<Share>) => {
    setBusy(true);
    setError(null);
    try {
      const s = await fn();
      setShare(s);
      setExpiry(isoDay(s.expires_at));
    } catch (err) {
      setError(err instanceof ApiError ? formatApiError(err.data) : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const save = (regenerate: boolean) =>
    run(() =>
      api<Share>(`/api/projects/content-calendar/share?client=${clientId}`, {
        method: "POST",
        body: JSON.stringify({ expires_at: expiry || null, regenerate }),
      })
    );

  const turnOff = () =>
    run(() => api<Share>(`/api/projects/content-calendar/share?client=${clientId}`, { method: "DELETE" }));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      showToast("Link copied.", "success");
    } catch {
      showToast("Couldn't copy — select the link and copy it manually.", "error");
    }
  };

  const on = !!share?.active;

  return (
    <Modal open={open} onClose={onClose} maxWidth={520}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="card-title" style={{ margin: 0 }}>
          Share calendar with client
        </span>
        <button type="button" className="icon-btn-anim" onClick={onClose} aria-label="Close" style={closeBtn}>
          <i className="bi bi-x-lg" />
        </button>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: "8px 0 14px" }}>
        Anyone with this link can view {clientName}&apos;s content calendar (dates, what we&apos;re posting, and the
        approved posts) and leave comments. They can&apos;t see anything else in the CRM.
      </p>

      {share?.expired && (
        <p style={{ color: "var(--danger)", fontSize: 13, margin: "0 0 10px" }}>
          This link has expired. Set a new expiry date and save to re-enable it.
        </p>
      )}

      {on && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input className="input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn" onClick={copy}>
            <i className="bi bi-clipboard" /> Copy
          </button>
        </div>
      )}

      <div style={{ display: "grid", gap: 6, marginBottom: 14 }}>
        <span className="muted" style={{ fontSize: 12 }}>
          Link expires on (optional)
        </span>
        <DatePicker value={expiry} onChange={setExpiry} placeholder="Never expires" />
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: "0 0 10px" }}>{error}</p>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {on ? (
          <>
            <button type="button" className="btn" disabled={busy} onClick={() => save(false)}>
              Save expiry
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => save(true)}>
              <i className="bi bi-arrow-repeat" /> New link
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ color: "var(--danger)", marginLeft: "auto" }}
              disabled={busy}
              onClick={turnOff}
            >
              Turn off sharing
            </button>
          </>
        ) : (
          <button type="button" className="btn" disabled={busy || !share} onClick={() => save(false)}>
            <i className="bi bi-link-45deg" /> Create share link
          </button>
        )}
      </div>
      {on && (
        <p className="muted" style={{ fontSize: 12, margin: "10px 0 0" }}>
          &quot;New link&quot; stops the old link from working.
        </p>
      )}
    </Modal>
  );
}

const closeBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "var(--bg)",
  border: "none",
  color: "var(--text-muted)",
};
