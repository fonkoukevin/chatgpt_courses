import { resolve } from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  // Container builds run on Linux; native Windows development keeps its
  // existing output and does not need relocatable standalone symlinks.
  output: process.env.COURSES_BUILD_STANDALONE === "1" ? "standalone" : undefined,
  outputFileTracingRoot: resolve(__dirname, "../.."),
  turbopack: {
    root: resolve(__dirname, "../.."),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
