"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A piece of document text (a section heading, a sub-heading, a table column
 * title) that is shown as plain text with a pencil icon; clicking the pencil
 * turns it into an editable box. Enter inserts a line break (kept in the
 * preview + PDF); Escape or clicking away commits. Used across the proposal
 * builder so every title that ends up in the preview + PDF can be renamed
 * per-proposal (stored in Proposal.content, no schema/migration).
 *
 * stopPropagation on every interactive part so it can live inside the
 * SectionCard header, whose own onClick toggles the card open/closed.
 */
export function EditableLabel({
  value,
  onChange,
  fallback = "",
  className,
  style,
  inputStyle,
  ariaLabel = "Edit title",
}: {
  value: string;
  onChange: (v: string) => void;
  fallback?: string;
  className?: string;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  ariaLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      const el = inputRef.current;
      el?.focus();
      if (el) {
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      }
    }
  }, [editing]);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  if (editing) {
    return (
      <textarea
        ref={inputRef}
        className="input"
        value={value}
        placeholder={fallback}
        rows={1}
        onClick={stop}
        onMouseDown={stop}
        onChange={(e) => onChange(e.target.value)}
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = "auto";
          el.style.height = `${el.scrollHeight}px`;
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          // Enter now inserts a newline (default textarea behavior); Escape commits.
          if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
        style={{ minHeight: 30, padding: "4px 8px", font: "inherit", resize: "none", overflow: "hidden", ...inputStyle }}
      />
    );
  }

  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, ...style }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value || fallback}
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ padding: "2px 6px", color: "var(--text-muted)", flexShrink: 0 }}
        onClick={(e) => {
          stop(e);
          setEditing(true);
        }}
        onMouseDown={stop}
        aria-label={ariaLabel}
      >
        <i className="bi bi-pencil" style={{ fontSize: 12 }} />
      </button>
    </span>
  );
}
