"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AuthBackdrop } from "@/components/AuthBackdrop";
import { Logo } from "@/components/Logo";
import { MaintenanceNotice } from "@/components/MaintenanceNotice";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/lib/auth";
import { fetchMaintenance, isMaintenanceError } from "@/lib/maintenance";

export default function LoginPage() {
  const { login } = useAuth();
  const reduceMotion = useReducedMotion();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [maintenance, setMaintenance] = useState(false);

  useEffect(() => {
    fetchMaintenance(false)
      .then((s) => setMaintenance(s.enabled))
      .catch(() => {});
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err: any) {
      if (isMaintenanceError(err)) {
        setMaintenance(true);
        setError("Kwick is under maintenance. Only the developer account can sign in.");
      } else {
        setError(err.message ?? "Login failed.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <AuthBackdrop />
      <div className="auth-screen__theme">
        <ThemeToggle />
      </div>
      <div className="auth-screen__stack">
        <motion.form
          onSubmit={onSubmit}
          className="card auth-screen__card"
          initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <Logo height={40} />
          </div>
          <h2 style={{ margin: "0 0 4px" }}>Welcome back</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Sign in to your Kwick account
          </p>
          {maintenance && <MaintenanceNotice compact />}
          <label className="field-label">Email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <label className="field-label" style={{ marginBottom: 0 }}>Password</label>
            <Link href="/forgot-password" className="muted" style={{ fontSize: 12, color: "var(--gold)" }}>
              Forgot password?
            </Link>
          </div>
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
        </motion.form>
        <p className="auth-screen__powered">Powered by Kreativefolio</p>
      </div>
    </div>
  );
}
