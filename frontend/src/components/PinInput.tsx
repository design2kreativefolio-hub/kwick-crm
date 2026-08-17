"use client";

import { useEffect, useRef } from "react";

type PinInputProps = {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  ariaLabel?: string;
};

export function PinInput({
  length = 4,
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  ariaLabel = "PIN",
}: PinInputProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");
  const half = Math.ceil(length / 2);

  useEffect(() => {
    if (autoFocus) inputs.current[0]?.focus();
  }, [autoFocus]);

  const commit = (nextDigits: string[]) => {
    onChange(nextDigits.join("").slice(0, length));
  };

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    commit(next);
    if (digit && index < length - 1) inputs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (digits[index]) {
        const next = [...digits];
        next[index] = "";
        commit(next);
      } else if (index > 0) {
        inputs.current[index - 1]?.focus();
        const next = [...digits];
        next[index - 1] = "";
        commit(next);
      }
      e.preventDefault();
    }
    if (e.key === "ArrowLeft" && index > 0) inputs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < length - 1) inputs.current[index + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    onChange(pasted);
    inputs.current[Math.min(pasted.length, length - 1)]?.focus();
  };

  const renderCell = (index: number) => (
    <input
      key={index}
      ref={(el) => {
        inputs.current[index] = el;
      }}
      className="pin-input__cell"
      type="password"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={1}
      value={digits[index]}
      disabled={disabled}
      aria-label={`${ariaLabel} digit ${index + 1}`}
      onChange={(e) => handleChange(index, e.target.value)}
      onKeyDown={(e) => handleKeyDown(index, e)}
      onPaste={handlePaste}
      onFocus={(e) => e.target.select()}
    />
  );

  return (
    <div className="pin-input" role="group" aria-label={ariaLabel}>
      <div className="pin-input__group">{Array.from({ length: half }, (_, i) => renderCell(i))}</div>
      <span className="pin-input__sep" aria-hidden>
        –
      </span>
      <div className="pin-input__group">
        {Array.from({ length: length - half }, (_, i) => renderCell(half + i))}
      </div>
    </div>
  );
}
