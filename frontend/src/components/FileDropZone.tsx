"use client";

import { useRef, useState } from "react";

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function sizeLabel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Drag-and-drop (or click / keyboard) file picker with a removable file list.
 * Controlled: pass `files` and `onChange`. `accept` is the same comma list used
 * by <input accept> (extensions only, e.g. ".pdf,.png").
 */
export function FileDropZone({
  files,
  onChange,
  max = 5,
  accept,
  hint,
  ariaLabel = "Attachments",
}: {
  files: File[];
  onChange: (files: File[]) => void;
  max?: number;
  accept?: string;
  hint?: string;
  ariaLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // dragenter/leave fire for every child element; count them to avoid flicker.
  const depth = useRef(0);

  const allowed = accept
    ? accept
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : null;
  const full = files.length >= max;

  const addFiles = (incoming: File[]) => {
    if (!incoming.length) return;
    const problems: string[] = [];
    const ok: File[] = [];
    for (const f of incoming) {
      if (allowed && !allowed.includes(extOf(f.name))) {
        problems.push(`"${f.name}" isn't a supported file type`);
        continue;
      }
      if (files.some((x) => x.name === f.name && x.size === f.size) || ok.some((x) => x.name === f.name && x.size === f.size)) {
        continue;
      }
      ok.push(f);
    }
    const room = max - files.length;
    if (ok.length > room) problems.push(`Only ${max} files allowed — extra files were skipped`);
    if (ok.length) onChange([...files, ...ok.slice(0, Math.max(0, room))]);
    setNotice(problems.length ? problems.join(". ") + "." : null);
  };

  const open = () => {
    if (!full) inputRef.current?.click();
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept={accept}
        onChange={(e) => {
          const picked = Array.from(e.target.files || []);
          e.target.value = "";
          addFiles(picked);
        }}
      />
      <div
        role="button"
        tabIndex={0}
        aria-label={`${ariaLabel}: drop files here or press Enter to browse`}
        aria-disabled={full}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          depth.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = full ? "none" : "copy";
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          depth.current = 0;
          setDragging(false);
          if (full) {
            setNotice(`Only ${max} files allowed.`);
            return;
          }
          addFiles(Array.from(e.dataTransfer.files || []));
        }}
        style={{
          border: `2px dashed ${dragging ? "var(--gold)" : "var(--border, #d1d5db)"}`,
          background: dragging ? "color-mix(in srgb, var(--gold) 10%, transparent)" : "var(--bg)",
          borderRadius: 12,
          padding: "16px 12px",
          textAlign: "center",
          cursor: full ? "not-allowed" : "pointer",
          opacity: full ? 0.6 : 1,
          transition: "border-color .15s, background .15s",
        }}
      >
        <i className="bi bi-cloud-arrow-up" style={{ fontSize: 24, color: "var(--gold)" }} />
        <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 4 }}>
          {dragging ? "Drop to add files" : full ? "File limit reached" : "Drag & drop files here, or click to browse"}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
          {hint ?? `Up to ${max} files`}
          {files.length ? ` · ${files.length}/${max} selected` : ""}
        </div>
      </div>

      {notice && <p style={{ color: "var(--danger)", fontSize: 12.5, margin: "6px 0 0" }}>{notice}</p>}

      {files.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "flex", flexDirection: "column", gap: 6 }}>
          {files.map((f, idx) => (
            <li key={`${f.name}-${f.size}-${idx}`} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
              <i className="bi bi-file-earmark" style={{ color: "var(--gold)" }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
              <span className="muted" style={{ fontSize: 11.5 }}>{sizeLabel(f.size)}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: "2px 8px", color: "var(--danger)" }}
                onClick={() => {
                  onChange(files.filter((_, i) => i !== idx));
                  setNotice(null);
                }}
                aria-label={`Remove ${f.name}`}
              >
                <i className="bi bi-x-lg" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
