"use client";

import type { CSSProperties } from "react";

import type { User } from "@/lib/auth";

/** Circular user avatar — photo when set, otherwise initial letter. */
export function UserAvatar({
  user,
  size = 36,
  style,
  fontSize,
}: {
  user: Pick<User, "full_name" | "email"> & { profile?: { avatar_url?: string } | null } | null | undefined;
  size?: number;
  style?: CSSProperties;
  fontSize?: number;
}) {
  const url = user?.profile?.avatar_url?.trim();
  const initial = (user?.full_name || user?.email || "?")[0].toUpperCase();
  const base: CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    borderRadius: "50%",
    background: "var(--brand-fill)",
    color: "var(--on-brand)",
    display: "grid",
    placeItems: "center",
    fontWeight: 700,
    fontSize: fontSize ?? Math.max(12, Math.round(size * 0.4)),
    overflow: "hidden",
    ...style,
  };

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" style={{ ...base, objectFit: "cover", display: "block" }} />
    );
  }

  return <span style={base}>{initial}</span>;
}
