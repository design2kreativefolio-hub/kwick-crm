"use client";

import Link from "next/link";

export type EmptyAction = {
  label: string;
  icon?: string;
  onClick?: () => void;
  href?: string;
  /** Defaults to true; pass false for a quieter secondary button. */
  primary?: boolean;
};

/**
 * What a page shows when there is nothing to list yet. It says what the page is for and gives the
 * next step as a button, so a first-time user is never left looking at a blank table.
 */
export function EmptyState({
  icon,
  title,
  hint,
  actions = [],
}: {
  icon: string;
  title: string;
  hint?: string;
  actions?: EmptyAction[];
}) {
  return (
    <div className="es">
      <span className="es__icon">
        <i className={`bi ${icon}`} />
      </span>
      <b className="es__title">{title}</b>
      {hint && <span className="es__hint">{hint}</span>}
      {actions.length > 0 && (
        <div className="es__actions">
          {actions.map((a) => {
            const cls = a.primary === false ? "btn btn-ghost" : "btn btn-accent";
            const inner = (
              <>
                {a.icon && <i className={`bi ${a.icon}`} />} {a.label}
              </>
            );
            return a.href ? (
              <Link key={a.label} href={a.href} className={cls}>
                {inner}
              </Link>
            ) : (
              <button key={a.label} type="button" className={cls} onClick={a.onClick}>
                {inner}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
