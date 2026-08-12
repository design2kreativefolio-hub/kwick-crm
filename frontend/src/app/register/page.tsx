"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Logo } from "@/components/Logo";
import { api, ApiError, formatApiError } from "@/lib/api";

type Strength = {
  score: number; // 0–4
  label: "Too weak" | "Weak" | "Fair" | "Strong" | "Very strong";
  color: string;
};

function passwordStrength(password: string): Strength {
  if (!password) {
    return { score: 0, label: "Too weak", color: "var(--danger)" };
  }
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  // Cap at 4 for the meter bars.
  const capped = Math.min(score, 4);
  if (capped <= 1) return { score: capped, label: "Weak", color: "var(--danger)" };
  if (capped === 2) return { score: capped, label: "Fair", color: "#d4a017" };
  if (capped === 3) return { score: capped, label: "Strong", color: "var(--success)" };
  return { score: capped, label: "Very strong", color: "var(--success)" };
}

// Everyone self-registers as an employee — there is only one superadmin
// (the company owner), created via the bootstrap_superadmin management
// command. Every self-registered account lands in awaiting_approval until
// the superadmin approves it.
export default function RegisterPage() {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    password_confirm: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const strength = useMemo(() => passwordStrength(form.password), [form.password]);
  const mismatch =
    form.password_confirm.length > 0 && form.password !== form.password_confirm;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMsg(null);

    if (form.password !== form.password_confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (strength.score < 2) {
      setError("Choose a stronger password (8+ characters with mixed case, a number, or a symbol).");
      return;
    }

    setBusy(true);
    try {
      const res = await api<{ detail: string; status: string }>("/api/auth/register", {
        method: "POST",
        auth: false,
        body: JSON.stringify({
          full_name: form.full_name,
          email: form.email,
          password: form.password,
        }),
      });
      setMsg(res.detail);
    } catch (err: any) {
      setError(err instanceof ApiError ? formatApiError(err.data) : err.message);
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
          autoComplete="new-password"
        />
        {form.password.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={meterRow} aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  style={{
                    ...meterBar,
                    background: i < strength.score ? strength.color : "var(--border)",
                  }}
                />
              ))}
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: strength.color, fontWeight: 600 }}>
              {strength.label} password
            </p>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
              Use 8+ characters with upper &amp; lower case, a number, and a symbol.
            </p>
          </div>
        )}
        <label className="field-label">Re-enter password</label>
        <input
          className="input"
          type="password"
          value={form.password_confirm}
          onChange={set("password_confirm")}
          required
          minLength={8}
          autoComplete="new-password"
        />
        {mismatch && (
          <p style={{ color: "var(--danger)", fontSize: 12.5, margin: "6px 0 0" }}>
            Passwords don't match.
          </p>
        )}
        {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
        {msg && <p style={{ color: "var(--gold)", fontSize: 13 }}>{msg}</p>}
        <button
          className="btn"
          style={{ width: "100%", marginTop: 16 }}
          disabled={busy || mismatch || (!!form.password && strength.score < 2)}
        >
          {busy ? "Creating…" : "Register"}
        </button>
        <p className="muted" style={{ textAlign: "center", marginTop: 16, fontSize: 13 }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--gold)" }}>
            Sign in
          </Link>
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
  background: "var(--sidebar-bg)",
  padding: 20,
};

const meterRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 6,
};

const meterBar: React.CSSProperties = {
  height: 6,
  borderRadius: 999,
  transition: "background 0.15s ease",
};
