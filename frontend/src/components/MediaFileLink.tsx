"use client";

import type { AnchorHTMLAttributes, CSSProperties, MouseEvent, ReactNode } from "react";

import { openUploadedFile } from "@/lib/files";

/** Opens a CRM media URL in a new tab. Requires a logged-in session. */
export function MediaFileLink({
  url,
  className,
  style,
  title,
  children,
  onClick,
  ...rest
}: {
  url: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick">) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={className}
      style={style}
      title={title}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
        void openUploadedFile(url);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
