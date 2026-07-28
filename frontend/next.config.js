/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for the VPS deploy: `node server.js` from a standalone build (spec §1).
  output: "standalone",
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
