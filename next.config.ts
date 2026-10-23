import type { NextConfig } from "next";
const uploadBucket = "agentshield-claim-documents-gj2026";
const dev = process.env.NODE_ENV !== "production";
// Next.js App Router emits inline bootstrap scripts, so script-src needs
// 'unsafe-inline' without per-request nonces; external scripts stay blocked.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' https://${uploadBucket}.s3.ap-southeast-2.amazonaws.com https://${uploadBucket}.s3.amazonaws.com${dev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
const https = (process.env.APP_ORIGIN ?? "").startsWith("https://");
const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingExcludes: {
    "/*": ["./.auth/**/*", "./.env*", "./tests/**/*", "./work/**/*"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: csp },
          ...(https
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]
            : []),
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
