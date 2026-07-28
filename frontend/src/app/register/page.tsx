"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Logo } from "@/components/Logo";
import { api } from "@/lib/api";

// Both roles self-register via invite code (spec §4). Manager codes activate
// immediately; employee codes leave the account awaiting manager approval —
// approval fires an email (with a set-password link if needed).
export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "employee",
    invite_code: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
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
      if (res.status === "active") {
        router.push("/login");
      } else {
        setMsg(res.detail);
      }
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
          Requires an invite code from a manager. Managers are active immediately; employees
          need manager approval before they can log in.
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
        <label className="field-label">Role</label>
        <select className="input" value={form.role} onChange={set("role")}>
          <option value="employee">Employee</option>
          <option value="manager">Manager</option>
        </select>
        <label className="field-label">Invite code</label>
        <input className="input" value={form.invite_code} onChange={set("invite_code")} required />
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
  background: "var(--bg)",
  padding: 20,
};
