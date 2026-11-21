import type { Metadata } from "next";

// Private proposal link: keep it out of search engines and don't leak the token
// through the Referer header.
export const metadata: Metadata = {
  title: "Proposal",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ProposalLinkLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
