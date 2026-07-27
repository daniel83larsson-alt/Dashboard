import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Production (Vercel) and CI both run in UTC, but the app and all its
    // users are Europe/Stockholm — defaulting to UTC here catches any test
    // that silently assumes local time equals UTC. Falls back to whatever
    // TZ is already set in the shell (rather than hardcoding 'UTC'
    // unconditionally) so CI's second step, which re-runs the whole suite
    // with `TZ=Europe/Stockholm npx vitest run` (see .github/workflows/ci.yml),
    // actually exercises Stockholm time instead of being silently
    // overridden back to UTC.
    env: { TZ: process.env.TZ ?? 'UTC' },
  },
})
