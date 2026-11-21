"use client";

import Link from "next/link";

export type NextUpAction = {
  label: string;
  icon?: string;
  onClick?: () => void;
  href?: string;
  /** The one main thing to do (white button). */
  primary?: boolean;
  disabled?: boolean;
};

export type NextUpChip = { text: string; icon?: string };

function ActionButton({ a }: { a: NextUpAction }) {
  const cls = `bd-pillbtn${a.primary ? " is-ok" : ""}`;
  const inner = (
    <>
      {a.icon && <i className={`bi ${a.icon}`} />} <span>{a.label}</span>
    </>
  );
  return a.href ? (
    <Link href={a.href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" className={cls} onClick={a.onClick} disabled={a.disabled}>
      {inner}
    </button>
  );
}

/**
 * "Do this first": the one most useful next step on a page, in a highlighted card, so people do not
 * have to scan a list to decide. Same look as My Day in Business Development.
 */
export function NextUpCard({
  eyebrow = "Do this first",
  icon = "bi-lightning-charge-fill",
  title,
  subtitle,
  chips = [],
  actions = [],
}: {
  eyebrow?: string;
  icon?: string;
  title: string;
  subtitle?: string;
  chips?: NextUpChip[];
  actions?: NextUpAction[];
}) {
  return (
    <div className="bd-first nu-card">
      <div className="bd-first__top">
        <span className="bd-first__eyebrow">
          <i className="bi bi-lightning-charge-fill" /> {eyebrow}
        </span>
      </div>
      <div className="bd-first__body">
        <span className="nu-icon" aria-hidden>
          <i className={`bi ${icon}`} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="bd-first__title nu-title">{title}</div>
          {subtitle && <div className="bd-first__why">{subtitle}</div>}
          {chips.length > 0 && (
            <div className="bd-first__chips">
              {chips.map((c) => (
                <span key={c.text} className="bd-chip-lite">
                  {c.icon && <i className={`bi ${c.icon}`} />} {c.text}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {actions.length > 0 && (
        <div className="bd-first__more">
          {actions.map((a) => (
            <ActionButton key={a.label} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A slim one-line version for pages that are mostly one big view (the calendar). */
export function NextUpStrip({
  label = "Up next",
  title,
  when,
  actionLabel = "Open",
  onAction,
  icon = "bi-lightning-charge-fill",
}: {
  label?: string;
  title: string;
  when?: string;
  actionLabel?: string;
  onAction: () => void;
  icon?: string;
}) {
  return (
    <div className="nu-strip">
      <span className="nu-strip__icon">
        <i className={`bi ${icon}`} />
      </span>
      <span className="nu-strip__text">
        <span className="nu-strip__label">{label}</span>
        <b>{title}</b>
        {when && <span className="muted"> · {when}</span>}
      </span>
      <button type="button" className="btn btn-accent btn-sm" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}
