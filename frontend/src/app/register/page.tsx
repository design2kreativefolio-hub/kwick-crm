"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AuthBackdrop } from "@/components/AuthBackdrop";
import { Logo } from "@/components/Logo";
import { MaintenanceNotice } from "@/components/MaintenanceNotice";
import { PasswordField } from "@/components/PasswordField";
import { ThemeToggle } from "@/components/ThemeToggle";
import { api, ApiError, formatApiError } from "@/lib/api";
import { fetchMaintenance, isMaintenanceError } from "@/lib/maintenance";

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
  const capped = Math.min(score, 4);
  if (capped <= 1) return { score: capped, label: "Weak", color: "var(--danger)" };
  if (capped === 2) return { score: capped, label: "Fair", color: "#d4a017" };
  if (capped === 3) return { score: capped, label: "Strong", color: "var(--success)" };
  return { score: capped, label: "Very strong", color: "var(--success)" };
}

export default function RegisterPage() {
  const reduceMotion = useReducedMotion();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    password_confirm: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [maintenance, setMaintenance] = useState(false);

  useEffect(() => {
    fetchMaintenance(false)
      .then((s) => setMaintenance(s.enabled))
      .catch(() => {});
  }, []);

  const strength = useMemo(() => passwordStrength(form.password), [form.password]);
  const mismatch =
    form.password_confirm.length > 0 && form.password !== form.password_confirm;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

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
      await api<{ detail: string; status: string }>("/api/auth/register", {
        method: "POST",
        auth: false,
        body: JSON.stringify({
          full_name: form.full_name,
          email: form.email,
          password: form.password,
        }),
      });
      setAwaitingApproval(true);
    } catch (err: any) {
      if (isMaintenanceError(err)) {
        setMaintenance(true);
        setError("Kwick is under maintenance. Registration is paused.");
      } else {
        setError(err instanceof ApiError ? formatApiError(err.data) : err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (awaitingApproval) {
    return (
      <div className="auth-screen">
        <AuthBackdrop />
        <div className="auth-screen__theme">
          <ThemeToggle />
        </div>
        <div className="auth-screen__stack">
          <motion.div
            className="card"
            style={{ width: "min(420px, 100%)", textAlign: "center", padding: "36px 28px" }}
            initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <div style={{ marginBottom: 18 }}>
              <Logo height={40} />
            </div>
            <motion.div
              aria-hidden
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                margin: "0 auto 16px",
                display: "grid",
                placeItems: "center",
                background: "var(--gold-soft)",
                color: "var(--gold)",
                fontSize: 28,
              }}
              animate={reduceMotion ? undefined : { scale: [1, 1.06, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            >
              <i className="bi bi-hourglass-split" />
            </motion.div>
            <h2 style={{ margin: "0 0 8px", fontSize: 22 }}>Waiting for approval</h2>
            <p className="muted" style={{ margin: "0 0 22px", fontSize: 14, lineHeight: 1.5 }}>
              Your account was created. A superadmin will approve it before you can sign in.
            </p>
            <Link href="/login" className="btn" style={{ display: "inline-flex", width: "100%", justifyContent: "center" }}>
              Sign in
            </Link>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <AuthBackdrop />
      <div className="auth-screen__theme">
        <ThemeToggle />
      </div>
      <div className="auth-screen__stack">
        <form onSubmit={onSubmit} className="card" style={{ width: "min(420px, 100%)" }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <Logo height={40} />
          </div>
          <h2 style={{ margin: "0 0 4px" }}>Create your account</h2>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            The superadmin will approve your account before you can log in.
          </p>
          {maintenance && <MaintenanceNotice />}
          <label className="field-label">Full name</label>
          <input className="input" value={form.full_name} onChange={set("full_name")} required />
          <label className="field-label">Email</label>
          <input className="input" type="email" value={form.email} onChange={set("email")} required />
          <label className="field-label">Password</label>
          <PasswordField
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
            </div>
          )}
          <label className="field-label">Re-enter password</label>
          <PasswordField
            value={form.password_confirm}
            onChange={set("password_confirm")}
            required
            minLength={8}
            autoComplete="new-password"
          />
          {mismatch && (
            <p style={{ color: "var(--danger)", fontSize: 12.5, margin: "6px 0 0" }}>
              Passwords don&apos;t match.
            </p>
          )}
          {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
          <button
            className="btn"
            style={{ width: "100%", marginTop: 16 }}
            disabled={busy || maintenance || mismatch || (!!form.password && strength.score < 2)}
          >
            {busy ? "Creating…" : maintenance ? "Registration paused" : "Register"}
          </button>
          <p className="muted" style={{ textAlign: "center", marginTop: 16, fontSize: 13 }}>
            Already have an account?{" "}
            <Link href="/login" style={{ color: "var(--gold)" }}>
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

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
