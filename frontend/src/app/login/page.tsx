"use client";

import Link from "next/link";
import { useState } from "react";

import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message ?? "Login failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={wrap}>
      <form onSubmit={onSubmit} className="card" style={{ width: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Logo height={40} />
        </div>
        <h2 style={{ margin: "0 0 4px" }}>Welcome back</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Sign in to your Kwick account
        </p>
        <label className="field-label">Email</label>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label className="field-label">Password</label>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
        <button className="btn" style={{ width: "100%", marginTop: 16 }} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="muted" style={{ textAlign: "center", marginTop: 16, fontSize: 13 }}>
          New here?{" "}
          <Link href="/register" style={{ color: "var(--gold)" }}>Create an account</Link>
        </p>
      </form>
    </div>
  );
}

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--sidebar-bg)", // same navy gradient as the sidebar/hero card
  padding: 20,
};
