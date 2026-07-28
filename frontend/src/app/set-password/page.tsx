"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Logo } from "@/components/Logo";
import { api } from "@/lib/api";

function SetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/set-password", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ uid, token, password }),
      });
      setDone(true);
      setTimeout(() => router.push("/login"), 1500);
    } catch (err: any) {
      setError(err.data?.token?.[0] || err.data?.uid?.[0] || err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!uid || !token) {
    return (
      <p style={{ color: "var(--danger)" }}>
        This link is missing required details. Ask your manager to resend the approval email.
      </p>
    );
  }

  if (done) {
    return <p style={{ color: "var(--gold)" }}>Password set — redirecting to login…</p>;
  }

  return (
    <form onSubmit={onSubmit}>
      <label className="field-label">New password</label>
      <input
        className="input"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={8}
        required
      />
      <label className="field-label">Confirm password</label>
      <input
        className="input"
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        minLength={8}
        required
      />
      {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
      <button className="btn" style={{ width: "100%", marginTop: 16 }} disabled={busy}>
        {busy ? "Saving…" : "Set password"}
      </button>
    </form>
  );
}

export default function SetPasswordPage() {
  return (
    <div style={wrap}>
      <div className="card" style={{ width: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <Logo height={40} />
        </div>
        <h2 style={{ margin: "0 0 4px" }}>Set your password</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Your account was approved — choose a password to finish setting it up.
        </p>
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <SetPasswordForm />
        </Suspense>
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
  background: "var(--bg)",
  padding: 20,
};
