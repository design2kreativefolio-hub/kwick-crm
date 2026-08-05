"use client";

import { useRef, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";

export function ImageUploadField({
  proposalId,
  value,
  onChange,
  label,
}: {
  proposalId: number;
  value: string;
  onChange: (url: string) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { showToast } = useToast();

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api<{ url: string }>(`/api/sales/proposals/${proposalId}/upload_image`, {
        method: "POST",
        body: fd,
      });
      onChange(res.url);
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't upload image." : err.message, "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      {label && (
        <label className="field-label" style={{ marginTop: 0 }}>
          {label}
        </label>
      )}
      {value ? (
        <div style={{ position: "relative", display: "inline-block" }}>
          <img
            src={value}
            alt=""
            style={{ maxWidth: 220, maxHeight: 140, borderRadius: 8, display: "block", border: "1px solid var(--border)" }}
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ position: "absolute", top: 6, right: 6, background: "rgba(255,255,255,0.9)" }}
            onClick={() => onChange("")}
            aria-label="Remove image"
          >
            <i className="bi bi-trash-fill" style={{ color: "var(--danger)" }} />
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          <i className="bi bi-image-fill" /> {uploading ? "Uploading…" : "Add image"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
