"use client";

import { useEffect, useRef, useState } from "react";

import { api, ApiError, formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

const SUPPORT_EMAIL = "design@kreativefolio.com";
const WHATSAPP_DISPLAY = "+971 50 521 1969";
const WHATSAPP_LINK = "https://wa.me/971505211969";

export default function SupportPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.full_name || "");
    setEmail(user.email || "");
  }, [user]);

  useEffect(() => {
    const urls = images.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [images]);

  const addImages = (files: FileList | null) => {
    if (!files?.length) return;
    const next = [...images, ...Array.from(files).filter((f) => f.type.startsWith("image/"))].slice(0, 5);
    setImages(next);
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      showToast("Please enter your message.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const body = new FormData();
      body.append("name", name.trim());
      body.append("email", email.trim());
      body.append("message", message.trim());
      images.forEach((f) => body.append("images", f));
      await api("/api/dashboard/support", { method: "POST", body });
      showToast("Support request sent. We'll get back to you soon.");
      setMessage("");
      setImages([]);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err: any) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 880 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22 }}>Support</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Need help with Kwick? Send a message or reach us directly by email or WhatsApp.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="card" style={contactCard}>
          <i className="bi bi-envelope-fill" style={contactIcon} />
          <div>
            <div style={{ fontWeight: 700, color: "var(--navy)" }}>Email</div>
            <div className="muted" style={{ fontSize: 13.5 }}>{SUPPORT_EMAIL}</div>
          </div>
        </a>
        <a href={WHATSAPP_LINK} target="_blank" rel="noreferrer" className="card" style={contactCard}>
          <i className="bi bi-whatsapp" style={{ ...contactIcon, color: "#25D366" }} />
          <div>
            <div style={{ fontWeight: 700, color: "var(--navy)" }}>WhatsApp</div>
            <div className="muted" style={{ fontSize: 13.5 }}>{WHATSAPP_DISPLAY}</div>
          </div>
        </a>
      </div>

      <form className="card" onSubmit={submit}>
        <span className="card-title">
          <i className="bi bi-headset" style={{ color: "var(--gold)" }} />
          Contact Support
        </span>
        <p className="muted" style={{ marginTop: -8, marginBottom: 12, fontSize: 13 }}>
          Your request is sent to {SUPPORT_EMAIL}.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>

        <label className="field-label">Grievance / Message</label>
        <textarea
          className="input"
          rows={6}
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe the issue or assistance you need…"
          style={{ resize: "vertical", fontFamily: "inherit" }}
        />

        <label className="field-label">Attach Images</label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            addImages(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => fileRef.current?.click()}
          disabled={images.length >= 5}
        >
          <i className="bi bi-paperclip" /> Choose Files
        </button>
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Up to 5 images, 5 MB each.
        </p>
        {previews.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            {previews.map((src, idx) => (
              <div key={src} style={{ position: "relative" }}>
                <img
                  src={src}
                  alt={`Attachment ${idx + 1}`}
                  style={{ width: 88, height: 88, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)" }}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ position: "absolute", top: -6, right: -6, padding: "2px 6px" }}
                  onClick={() => removeImage(idx)}
                  aria-label="Remove image"
                >
                  <i className="bi bi-x-lg" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <button className="btn btn-accent" disabled={submitting}>
            {submitting ? "Sending…" : "Submit Request"}
          </button>
        </div>
      </form>
    </div>
  );
}

const contactCard: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: 16,
  textDecoration: "none",
  color: "inherit",
};

const contactIcon: React.CSSProperties = {
  fontSize: 22,
  color: "var(--gold)",
  width: 42,
  height: 42,
  borderRadius: 12,
  display: "grid",
  placeItems: "center",
  background: "var(--gold-soft)",
};
