"use client";

import { useEffect, useRef, useState } from "react";

import { Modal } from "@/components/Modal";
import { useToast } from "@/lib/toast";

/**
 * "Add image" popup: browse the system, paste from the clipboard (button or
 * Ctrl/Cmd+V while it's open), or drag-and-drop a file onto the drop zone.
 * All three paths hand a single File back to `onFile`.
 */
export function ImagePickerDialog({
  open,
  onClose,
  onFile,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onFile: (file: File) => void;
  busy?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const { showToast } = useToast();

  const take = (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("That doesn't look like an image file.", "error");
      return;
    }
    onFile(file);
  };

  // Ctrl/Cmd+V anywhere while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.items || [])
        .find((it) => it.kind === "file" && it.type.startsWith("image/"))
        ?.getAsFile();
      if (file) {
        e.preventDefault();
        take(file);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) {
          const blob = await item.getType(type);
          const ext = type.split("/")[1] || "png";
          take(new File([blob], `pasted.${ext}`, { type }));
          return;
        }
      }
      showToast("No image found on the clipboard. Copy an image, then try again.", "error");
    } catch {
      showToast("Couldn't read the clipboard — press Ctrl+V (Cmd+V on Mac) instead.", "error");
    }
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth={460}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Add image</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            take(e.dataTransfer.files?.[0]);
          }}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? "var(--gold)" : "var(--border)"}`,
            background: dragOver ? "var(--surface-2, rgba(0,0,0,0.03))" : "transparent",
            borderRadius: 12,
            padding: "32px 16px",
            textAlign: "center",
            cursor: "pointer",
            transition: "border-color .15s, background .15s",
          }}
        >
          <i className="bi bi-cloud-arrow-up" style={{ fontSize: 28, color: "var(--text-muted)" }} />
          <p style={{ margin: "8px 0 0", fontSize: 13.5 }}>
            {busy ? "Uploading…" : "Drag & drop an image here"}
          </p>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
            or use the options below
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            <i className="bi bi-folder2-open" /> Browse files
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={pasteFromClipboard}>
            <i className="bi bi-clipboard" /> Paste from clipboard
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          take(file);
        }}
      />
    </Modal>
  );
}
