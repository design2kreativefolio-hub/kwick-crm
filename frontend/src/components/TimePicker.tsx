"use client";

function toInputValue(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 5);
}

export function TimePicker({
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="time"
      className="input"
      value={toInputValue(value)}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      disabled={disabled}
      style={{ width: "100%" }}
    />
  );
}
