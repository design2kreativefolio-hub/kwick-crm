"use client";

import { useRef, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

export type ProfileHeaderTab = { key: string; label: string; icon: string };

export function ProfileHeader({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs?: ProfileHeaderTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
}) {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      await api("/api/auth/me/avatar", { method: "POST", body });
      await refreshUser();
      showToast("Photo updated.");
    } catch (err: any) {
      setError(err instanceof ApiError ? JSON.stringify(err.data) : err.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={banner} />
      <div style={{ textAlign: "center", padding: "0 20px 20px" }}>
        <div style={avatarSlot}>
          <div style={avatarWrap}>
            {user?.profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.profile.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: 30, fontWeight: 700, color: "#fff" }}>
                {(user?.full_name || user?.email || "?")[0].toUpperCase()}
              </span>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onAvatarChange} style={{ display: "none" }} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            style={cameraBtn}
            aria-label="Change photo"
          >
            <i className="bi bi-camera-fill" />
          </button>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)", marginTop: 12 }}>
          {user?.full_name || user?.email}
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
          {user?.email}
        </div>
        <div className="muted" style={{ fontSize: 11.5, textTransform: "capitalize", marginTop: 4 }}>
          {user?.role}
          {user?.profile?.job_title ? ` · ${user.profile.job_title}` : ""}
        </div>
        {error && <p style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{error}</p>}
      </div>

      {tabs && tabs.length > 0 && (
        <div style={tabBar}>
          {tabs.map((t) => {
            const active = t.key === activeTab;
            return (
              <button
                key={t.key}
                onClick={() => onTabChange?.(t.key)}
                style={{ ...tabItem, color: active ? "var(--navy)" : "var(--text-muted)", borderBottomColor: active ? "var(--gold)" : "transparent" }}
              >
                <i className={`bi ${t.icon}`} /> {t.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const banner: React.CSSProperties = {
  height: 130,
  background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-soft) 100%)",
};
const avatarSlot: React.CSSProperties = {
  position: "relative",
  display: "inline-block",
  marginTop: -48,
};
const avatarWrap: React.CSSProperties = {
  width: 96,
  height: 96,
  borderRadius: "50%",
  background: "var(--navy)",
  border: "4px solid var(--surface)",
  boxShadow: "var(--shadow)",
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
};
const cameraBtn: React.CSSProperties = {
  position: "absolute",
  bottom: 2,
  right: 2,
  width: 30,
  height: 30,
  borderRadius: "50%",
  background: "var(--gold)",
  color: "#fff",
  border: "2px solid var(--surface)",
  display: "grid",
  placeItems: "center",
  fontSize: 12.5,
  cursor: "pointer",
};
const tabBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: 28,
  borderTop: "1px solid var(--border)",
};
const tabItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  padding: "14px 4px",
  fontSize: 13.5,
  fontWeight: 600,
  background: "none",
  border: "none",
  borderBottom: "2px solid transparent",
  cursor: "pointer",
};
