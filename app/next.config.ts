import type { NextConfig } from "next";

// Every page is rendered per request so it can carry a fresh CSP nonce (see src/proxy.ts).
// Partial prerendering is incompatible with nonce-based CSP, so it stays off.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
