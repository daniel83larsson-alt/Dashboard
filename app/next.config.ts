import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  org: "larsson-40",
  project: "dl-trainer",
  silent: true,
  // No SENTRY_AUTH_TOKEN is set (would need one more secret from Daniel for
  // readable stack traces) — sourcemap upload is skipped either way since
  // this app builds with Turbopack, which the plugin doesn't upload for yet.
  sourcemaps: { disable: true },
  disableLogger: true,
});
