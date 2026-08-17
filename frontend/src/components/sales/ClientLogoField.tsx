"use client";

import { useEffect, useRef, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";

/**
 * Client logo upload. When `clientId` is set, uploads immediately to
 * `/api/sales/clients/{id}/logo`. On Add Client (no id yet), holds a local
 * preview via `onPendingFile` until the parent creates the client.
 */
export function ClientLogoField({
  clientId,
  logoUrl,
  onLogoUrlChange,
  pendingFile,
  onPendingFile,
}: {
  clientId: number | null;
  logoUrl: string;
  onLogoUrlChange: (url: string) => void;
  pendingFile?: File | null;
  onPendingFile?: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string>("");
  const { showToast } = useToast();

  useEffect(() => {
    if (!pendingFile) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const displayUrl = preview || logoUrl;

  const pick = async (file: File) => {
    if (!clientId) {
      onPendingFile?.(file);
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api<{ logo_url: string }>(`/api/sales/clients/${clientId}/logo`, {
        method: "POST",
        body: fd,
      });
      onLogoUrlChange(res.logo_url);
      onPendingFile?.(null);
      showToast("Logo updated.");
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't upload logo." : err.message, "error");
    } finally {
      setUploading(false);
    }
  };

  const clearPending = () => {
    onPendingFile?.(null);
  };

  return (
    <div>
      <label className="field-label" style={{ marginTop: 0 }}>
        Logo
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--panel-muted)",
            overflow: "hidden",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          {displayUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={displayUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <i className="bi bi-image" style={{ color: "var(--text-muted)", fontSize: 18 }} />
          )}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <i className="bi bi-upload" />{" "}
          {uploading ? "Uploading…" : displayUrl ? "Change logo" : "Upload logo"}
        </button>
        {pendingFile && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ color: "var(--danger)" }}
            onClick={clearPending}
          >
            Remove
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) pick(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
