"use client";

import Link from "next/link";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="back-link">
      <i className="bi bi-arrow-left" />
      {label}
    </Link>
  );
}
