"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Logo } from "@/components/Logo";
import { api } from "@/lib/api";

// Everyone self-registers as an employee — there is only one superadmin
// (the company owner), created via the bootstrap_superadmin management
// command. Every self-registered account lands in awaiting_approval until
// the superadmin approves it.
export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await api<{ detail: string; status: string }>("/api/auth/register", {
        method: "POST",
        auth: false,
        body: JSON.stringify(form),
      });
      setMsg(res.detail);
    } catch (err: any) {
      setError(err.data ? JSON.stringify(err.data) : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={wrap}>
      <form onSubmit={onSubmit} className="card" style={{ width: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <Logo height={40} />
        </div>
        <h2 style={{ margin: "0 0 4px" }}>Create your account</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          The superadmin will approve your account before you can log in.
        </p>
        <label className="field-label">Full name</label>
        <input className="input" value={form.full_name} onChange={set("full_name")} required />
        <label className="field-label">Email</label>
        <input className="input" type="email" value={form.email} onChange={set("email")} required />
        <label className="field-label">Password</label>
        <input
          className="input"
          type="password"
          value={form.password}
          onChange={set("password")}
          required
          minLength={8}
        />
        {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
        {msg && <p style={{ color: "var(--gold)", fontSize: 13 }}>{msg}</p>}
        <button className="btn" style={{ width: "100%", marginTop: 16 }} disabled={busy}>
          {busy ? "Creating…" : "Register"}
        </button>
        <p className="muted" style={{ textAlign: "center", marginTop: 16, fontSize: 13 }}>
          Already have an account? <Link href="/login" style={{ color: "var(--gold)" }}>Sign in</Link>
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
