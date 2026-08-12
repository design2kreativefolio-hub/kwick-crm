"use client";

import { useRef, type CSSProperties } from "react";

/** Editable document name with a pencil rename affordance (focuses the input). */
export function DocNameField({
  value,
  onChange,
  placeholder = "Untitled",
  ariaLabel = "Document name",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, marginLeft: -8, maxWidth: "min(100%, 560px)" }}>
      <input
        ref={inputRef}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        placeholder={placeholder}
        style={{
          flex: 1,
          fontSize: 22,
          fontWeight: 700,
          color: "var(--navy)",
          border: "1px solid transparent",
          background: "transparent",
          padding: "4px 8px",
          minWidth: 0,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.background = "var(--surface)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "transparent";
          e.currentTarget.style.background = "transparent";
        }}
      />
      <button
        type="button"
        className="icon-btn-anim"
        title="Rename"
        aria-label="Rename"
        onClick={() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }}
        style={renameBtn}
      >
        <i className="bi bi-pencil-fill" style={{ fontSize: 13 }} />
      </button>
    </div>
  );
}

const renameBtn: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  display: "grid",
  placeItems: "center",
  background: "var(--panel-muted)",
  border: "1px solid var(--border)",
  color: "var(--text-muted)",
  flexShrink: 0,
};
