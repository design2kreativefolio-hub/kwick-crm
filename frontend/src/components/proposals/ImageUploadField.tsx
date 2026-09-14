"use client";

import { useState } from "react";

import { api, ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";

import { ImagePickerDialog } from "./ImagePickerDialog";

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
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
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
        <button type="button" className="btn btn-ghost btn-sm" disabled={uploading} onClick={() => setPickerOpen(true)}>
          <i className="bi bi-image-fill" /> {uploading ? "Uploading…" : "Add image"}
        </button>
      )}
      <ImagePickerDialog
        open={pickerOpen}
        busy={uploading}
        onClose={() => setPickerOpen(false)}
        onFile={(file) => {
          setPickerOpen(false);
          void upload(file);
        }}
      />
    </div>
  );
}
