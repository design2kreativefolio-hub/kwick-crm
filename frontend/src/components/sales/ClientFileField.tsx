"use client";

import { useRef, useState } from "react";

import { MediaFileLink } from "@/components/MediaFileLink";
import { api, ApiError } from "@/lib/api";
import { displayUploadedFileName } from "@/lib/files";
import { useToast } from "@/lib/toast";

/** Upload any file for a sales client; stores URL via onChange. */
export function ClientFileField({
  clientId,
  value,
  onChange,
  label,
  accept = ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx",
}: {
  clientId: number | null;
  value: string;
  onChange: (url: string) => void;
  label?: string;
  accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { showToast } = useToast();

  const upload = async (file: File) => {
    if (!clientId) {
      showToast("Save the client first, then upload files.", "error");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api<{ url: string }>(`/api/sales/clients/${clientId}/upload_file`, {
        method: "POST",
        body: fd,
      });
      onChange(res.url);
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't upload file." : err.message, "error");
    } finally {
      setUploading(false);
    }
  };

  const fileName = value ? displayUploadedFileName(value) : "";

  return (
    <div>
      {label && (
        <label className="field-label" style={{ marginTop: 0 }}>
          {label}
        </label>
      )}
      {value ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <MediaFileLink url={value} className="btn btn-ghost btn-sm">
            <i className="bi bi-paperclip" /> {fileName.length > 36 ? `${fileName.slice(0, 34)}…` : fileName}
          </MediaFileLink>
          <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => onChange("")}>
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={uploading || !clientId}
          onClick={() => inputRef.current?.click()}
          title={!clientId ? "Save the client first to enable uploads" : undefined}
        >
          <i className="bi bi-upload" /> {uploading ? "Uploading…" : "Upload file"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
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
