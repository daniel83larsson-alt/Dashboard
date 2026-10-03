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
    // Bara för sandlådor där all trafik går via en proxy med eget certifikat.
    ignoreHTTPSErrors: process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS === '1',
    screenshot: 'only-on-failure',
    // Optional escape hatch for a locally pre-installed Chromium build whose
    // version doesn't match this repo's pinned @playwright/test (e.g. a
    // shared dev-container browser cache) — unset in CI, which always
    // installs its own matching browser via `playwright install`.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, args: ['--no-sandbox'] }
      : undefined,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      testIgnore: [/public\.spec\.ts/, /mobile\.spec\.ts/],
      use: { ...devices['Desktop Chrome'], storageState: authFile },
      dependencies: ['setup'],
    },
    // Inloggad mobilvy (Pixel 5 = Chromium med mobil skärm/touch): bottenmeny, coachens
    // skrivfält mot menyn, fältstorlek mot iOS-zoom, etiketter.
    {
      name: 'mobile',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['Pixel 5'], storageState: authFile },
      dependencies: ['setup'],
    },
    // Utloggad välkomstsida + SEO — behöver ingen inloggning.
    {
      name: 'public',
      testMatch: /public\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
