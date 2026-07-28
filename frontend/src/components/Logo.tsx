/*
  Placeholder Kwick logo — a simple inline-SVG "K" badge + wordmark in the
  brand blue, built so nothing depends on external image files. Swap this out
  once the real logo artwork is ready; every call site only ever imports
  <Logo />, so the replacement is a one-file change.
*/
export function Logo({ icon = false, height = 32 }: { icon?: boolean; height?: number }) {
  const badgeSize = height;

  const badge = (
    <svg
      width={badgeSize}
      height={badgeSize}
      viewBox="0 0 40 40"
      style={{ display: "block", minWidth: badgeSize }}
    >
      <rect width="40" height="40" rx="11" fill="#0000CD" />
      <text
        x="50%"
        y="53%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="var(--font-sans)"
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
          color: "#0000CD",
          letterSpacing: -0.2,
        }}
      >
        Kwick
      </span>
    </span>
  );
}
