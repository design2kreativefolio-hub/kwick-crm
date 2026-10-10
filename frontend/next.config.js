/** Baseline security headers. A full script-src CSP is deliberately not set: the
 * root layout uses an inline theme script. These cover clickjacking, MIME
 * sniffing, referrer leakage and plugin/base-URI injection. */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for the VPS deploy: `node server.js` from a standalone build (spec §1).
  output: "standalone",
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

module.exports = nextConfig;
