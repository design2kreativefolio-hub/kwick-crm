"use client";

import { useEffect, useRef } from "react";

/**
 * A single-line-looking field that is really a <textarea>: pressing Enter
 * inserts a real line break (kept in the preview + PDF via `white-space:
 * pre-line`), and the box auto-grows to fit its content. Used for the plain
 * proposal-builder fields that feed document text (cover title, QTN No,
 * client name, pricing labels, ...) so any of them can be multi-line.
 */
export function GrowTextarea({
  value,
  onChange,
  className = "input",
  placeholder,
  ariaLabel,
  autoFocus,
  style,
  onBlur,
  onKeyDown,
  onClick,
  onMouseDown,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  style?: React.CSSProperties;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onClick?: (e: React.MouseEvent<HTMLTextAreaElement>) => void;
  onMouseDown?: (e: React.MouseEvent<HTMLTextAreaElement>) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  // Re-fit on every value change (covers external updates, e.g. picking a
  // client fills the name field).
  useEffect(resize, [value]);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      rows={1}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      onInput={resize}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      onClick={onClick}
      onMouseDown={onMouseDown}
      style={{ resize: "none", overflow: "hidden", ...style }}
    />
  );
}
