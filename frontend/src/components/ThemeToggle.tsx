"use client";

import { useTheme } from "@/lib/theme";

/** Shared sun/moon theme switch used in Topbar and auth screens. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      <span className="theme-toggle__track" aria-hidden>
        <i className="bi bi-sun-fill" />
        <i className="bi bi-moon-stars-fill" />
      </span>
      <span className="theme-toggle__thumb" aria-hidden>
        <i className={`bi ${theme === "dark" ? "bi-moon-stars-fill" : "bi-sun-fill"}`} />
      </span>
    </button>
  );
}
