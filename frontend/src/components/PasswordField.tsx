"use client";

import { InputHTMLAttributes, useState } from "react";

export function PasswordField({
  className,
  style,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-field">
      <input
        {...props}
        className={className ? `input ${className}` : "input"}
        type={visible ? "text" : "password"}
        style={style}
      />
      <button
        type="button"
        className="password-field__toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        title={visible ? "Hide password" : "Show password"}
      >
        <i className={visible ? "bi bi-eye-slash" : "bi bi-eye"} aria-hidden />
      </button>
    </div>
  );
}
