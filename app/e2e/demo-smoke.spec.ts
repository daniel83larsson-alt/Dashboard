import { test, expect } from '@playwright/test'
import { NAV_ITEMS } from '../src/lib/nav'

// Phase 5 of the regression-test strategy: a real browser walking every page
// a logged-in user can reach, against the real deployed app — catches the
// class of bug none of the other layers can (a client component crashing on
// render, a broken import, real CSS/layout breakage) that unit tests and API
// smoke checks (prod-smoke) don't touch. Uses the shared public demo account
// (see auth.setup.ts) so it never needs real user credentials.
//
// Deliberately only asserts "did this crash" (uncaught exceptions, Next's
// error boundary text, non-2xx navigation), not pixel-perfect content —
// content correctness is Insikter/Coach's job and would make this brittle
// against normal copy changes. A failed page here means something is
// actually broken, not that a headline changed.
for (const item of NAV_ITEMS) {
  test(`${item.label} (${item.href}) loads without crashing`, async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    const response = await page.goto(item.href)
    expect(response?.ok(), `navigation to ${item.href} returned ${response?.status()}`).toBeTruthy()

    // Next's default client-error boundary renders this exact string.
    await expect(page.getByText('Application error', { exact: false })).toHaveCount(0)

    expect(pageErrors, `uncaught client-side exception(s) on ${item.href}`).toEqual([])
  })
}
