"use client";

import Link from "next/link";
import { useState } from "react";

import { Logo } from "@/components/Logo";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/forgot-password", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ email }),
      });
      setDone(true);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={wrap}>
      <div className="card" style={{ width: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <Logo height={40} />
        </div>
        <h2 style={{ margin: "0 0 4px" }}>Forgot your password?</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Enter your account email and we&apos;ll send you a link to set a new one.
        </p>

        {done ? (
          <p style={{ color: "var(--gold)", fontSize: 13.5 }}>
            <i className="bi bi-envelope-check-fill" style={{ marginRight: 6 }} />
            If an account exists for that email, a reset link is on its way. Check your inbox.
          </p>
        ) : (
          <form onSubmit={onSubmit}>
            <label className="field-label">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
            <button className="btn" style={{ width: "100%", marginTop: 16 }} disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <p className="muted" style={{ textAlign: "center", marginTop: 16, fontSize: 13 }}>
          <Link href="/login" style={{ color: "var(--gold)" }}>Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--sidebar-bg)",
  padding: 20,
};
