import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";

import "@/styles/globals.css";
import { Providers } from "./providers";

// Self-hosted at build time (no runtime call to Google's CDN — matches the
// self-contained VPS deploy). Exposed as a CSS variable, applied in globals.css.
const onest = Onest({ subsets: ["latin"], variable: "--font-onest" });

export const metadata: Metadata = {
  title: "Kwick Kreativefolio",
  description: "Internal operations platform",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.png", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    // iOS only treats the site as an installable "app" (hides Safari chrome,
    // allows push after Add to Home Screen) with these tags present.
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kwick",
  },
};

export const viewport: Viewport = {
  themeColor: "#1933b4",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={onest.variable}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("kwick-theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);document.documentElement.style.colorScheme=t;}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
