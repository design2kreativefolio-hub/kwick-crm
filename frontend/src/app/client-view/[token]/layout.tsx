import type { Metadata } from "next";

// Private share link: keep it out of search engines and don't leak the token
// through the Referer header.
export const metadata: Metadata = {
  title: "Content Calendar",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ClientViewLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
