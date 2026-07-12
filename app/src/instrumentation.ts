import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Under Turbopack (this app's build, per next.config.ts) Sentry's webpack
// build-time auto-instrumentation of route handlers/middleware never runs —
// this is Next's own onRequestError hook instead, which fires for any
// uncaught error in Server Components/Route Handlers/Server Actions
// regardless of bundler.
export const onRequestError = Sentry.captureRequestError
