import { defineConfig, devices } from '@playwright/test'
import path from 'path'

const authFile = path.join(__dirname, 'e2e', '.auth', 'demo.json')

// Nightly demo-account smoke test (Test strategy Phase 5) — walks every page
// in the real nav against the real deployed app using the shared public demo
// login, not a local dev server. baseURL defaults to production since that's
// what this is meant to watch; override with PLAYWRIGHT_BASE_URL for a
// one-off run against a preview deploy.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'https://dltrainer.se',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Optional escape hatch for a locally pre-installed Chromium build whose
    // version doesn't match this repo's pinned @playwright/test (e.g. a
    // shared dev-container browser cache) — unset in CI, which always
    // installs its own matching browser via `playwright install`.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: authFile },
      dependencies: ['setup'],
    },
  ],
})
