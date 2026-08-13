"use client";

import { useCallback, useRef, useState } from "react";

import { AvatarCropModal } from "@/components/AvatarCropModal";
import { useConfirm } from "@/components/ConfirmDialog";
import { UserAvatar } from "@/components/UserAvatar";
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
  const { confirm, ConfirmDialog } = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const cropSrcRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const hasAvatar = Boolean(user?.profile?.avatar_url?.trim());

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (cropSrcRef.current) URL.revokeObjectURL(cropSrcRef.current);
    const url = URL.createObjectURL(file);
    cropSrcRef.current = url;
    setCropSrc(url);
    if (fileRef.current) fileRef.current.value = "";
  };

  const closeCrop = useCallback(() => {
    if (cropSrcRef.current) {
      URL.revokeObjectURL(cropSrcRef.current);
      cropSrcRef.current = null;
    }
    setCropSrc(null);
  }, []);

  const uploadCropped = useCallback(
    async (file: File) => {
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
        showToast("Couldn't update photo.", "error");
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [refreshUser, showToast]
  );

  const removePhoto = async () => {
    const ok = await confirm("Remove your profile photo and use the default initial?", {
      title: "Remove photo",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/me/avatar", { method: "DELETE" });
      await refreshUser();
      showToast("Photo removed.");
    } catch (err: any) {
      setError(err instanceof ApiError ? JSON.stringify(err.data) : err.message);
      showToast("Couldn't remove photo.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {ConfirmDialog}
      <AvatarCropModal
        open={!!cropSrc}
        imageSrc={cropSrc}
        onClose={closeCrop}
        onCropped={uploadCropped}
      />
      <div style={banner} />
      <div style={{ textAlign: "center", padding: "0 20px 20px" }}>
        <div style={avatarSlot}>
          <div style={avatarWrap}>
            <UserAvatar user={user} size={88} fontSize={30} style={{ border: "none" }} />
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onFilePicked} style={{ display: "none" }} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            style={cameraBtn}
            aria-label="Change photo"
            title="Change photo"
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
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: 12.5, padding: "6px 12px" }}
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {hasAvatar ? "Change photo" : "Upload photo"}
          </button>
          {hasAvatar && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12.5, padding: "6px 12px", color: "var(--danger)" }}
              disabled={busy}
              onClick={removePhoto}
            >
              Remove photo
            </button>
          )}
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
                style={{
                  ...tabItem,
                  color: active ? "var(--navy)" : "var(--text-muted)",
                  borderBottomColor: active ? "var(--gold)" : "transparent",
                }}
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
  background: "linear-gradient(135deg, var(--brand-fill-soft) 0%, var(--brand-fill) 100%)",
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
  background: "var(--brand-fill)",
  border: "4px solid var(--surface)",
  boxShadow: "var(--shadow)",
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
  color: "var(--on-brand)",
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
