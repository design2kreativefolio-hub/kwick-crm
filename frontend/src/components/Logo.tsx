/*
  Placeholder Kwick logo — plain white "K" badge + wordmark.
  Swap assets later when final artwork is ready; call sites only import <Logo />.
*/
export function Logo({
  icon = false,
  height = 32,
  light = false,
}: {
  icon?: boolean;
  height?: number;
  /** White wordmark text — for dark backgrounds like the sidebar. */
  light?: boolean;
}) {
  const badgeSize = height;

  const badge = (
    <svg
      width={badgeSize}
      height={badgeSize}
      viewBox="0 0 40 40"
      style={{ display: "block", minWidth: badgeSize }}
      aria-label="Kwick"
    >
      <rect width="40" height="40" rx="11" fill="#0000CD" />
      <text
        x="50%"
        y="53%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="var(--font-sans), system-ui, sans-serif"
        fontWeight={700}
        fontSize="22"
        fill="#ffffff"
      >
        K
      </text>
    </svg>
  );

  if (icon) return badge;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: height * 0.28 }}>
      {badge}
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontWeight: 700,
          fontSize: height * 0.62,
          color: light ? "#ffffff" : "#0000CD",
          letterSpacing: -0.2,
        }}
      >
        Kwick
      </span>
    </span>
  );
}
