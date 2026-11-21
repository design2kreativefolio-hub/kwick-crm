"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { PagedPreview } from "@/components/proposals/PagedPreview";
import { API_BASE } from "@/lib/api";
import type { ProposalContent } from "@/lib/proposalContent";

type Shared = {
  title: string;
  content: ProposalContent;
  accepted_at: string | null;
  accepted_name: string;
  expires_at: string | null;
};

/** Public, login-free proposal page. The link itself is the credential. */
export default function SharedProposalPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Shared | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "gone">("loading");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [justAccepted, setJustAccepted] = useState(false);

  useEffect(() => {
    // ?p=1 is the owner previewing — the server doesn't count that as a client view.
    const preview = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("p") === "1";
    fetch(`${API_BASE}/api/public/proposals/${encodeURIComponent(token)}${preview ? "?p=1" : ""}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("gone");
        setData(await r.json());
        setState("ready");
      })
      .catch(() => setState("gone"));
  }, [token]);

  const accept = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/public/proposals/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || "Couldn't record your acceptance. Please try again.");
      }
      setJustAccepted(true);
      setData((d) => (d ? { ...d, accepted_at: new Date().toISOString(), accepted_name: name.trim() } : d));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading") return <div className="pp-center">Loading proposal…</div>;
  if (state === "gone" || !data)
    return (
      <div className="pp-center">
        <div>
          <h2 style={{ margin: "0 0 8px" }}>This link isn&apos;t available</h2>
          <p style={{ margin: 0 }}>It may have expired or been replaced. Please ask your contact at Kreativefolio for a new one.</p>
        </div>
      </div>
    );

  const accepted = !!data.accepted_at;

  return (
    <div className="pp-wrap">
      <div className="pp-bar">
        <b>{data.title || "Proposal"}</b>
        <span style={{ fontSize: 13, color: "#6b7280" }}>Kreativefolio</span>
      </div>
      {accepted && (
        <div className="pp-done">
          <i className="bi bi-check-circle-fill" /> {justAccepted ? "Thank you — " : ""}Accepted{data.accepted_name ? ` by ${data.accepted_name}` : ""}. We&apos;ll be in touch shortly.
        </div>
      )}
      <div className="pp-body">
        <PagedPreview content={data.content} />
      </div>
      {!accepted && (
        <div className="pp-accept">
          <input placeholder="Type your full name to accept" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} aria-label="Your full name" />
          <button onClick={accept} disabled={busy || name.trim().length < 2}>
            {busy ? "Saving…" : "Accept proposal"}
          </button>
          {error && <span style={{ color: "#b91c1c", fontSize: 13, width: "100%", textAlign: "center" }}>{error}</span>}
        </div>
      )}
    </div>
  );
}
