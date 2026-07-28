import type { Metadata } from "next";
import { Onest } from "next/font/google";

import "@/styles/globals.css";
import { Providers } from "./providers";

// Self-hosted at build time (no runtime call to Google's CDN — matches the
// self-contained VPS deploy). Exposed as a CSS variable, applied in globals.css.
const onest = Onest({ subsets: ["latin"], variable: "--font-onest" });

export const metadata: Metadata = {
  title: "Kwick Kreativefolio",
  description: "Internal operations platform",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={onest.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
