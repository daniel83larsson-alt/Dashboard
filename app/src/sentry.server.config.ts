import * as Sentry from '@sentry/nextjs'

// Silently no-ops if NEXT_PUBLIC_SENTRY_DSN isn't set (e.g. CI's dummy-env
// build) — Sentry.init() with an empty dsn just disables the SDK.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
})
