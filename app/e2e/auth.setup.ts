import { test as setup, expect } from '@playwright/test'
import path from 'path'

// Runs once before the smoke tests (see the `setup` → `chromium` project
// dependency in playwright.config.ts) and reuses the exact same public
// "Prova demo" flow a real visitor uses — no direct Supabase session
// minting, so a regression in the login page itself would fail this too.
const authFile = path.join(__dirname, '.auth', 'demo.json')

setup('authenticate as demo account', async ({ page }) => {
  await page.goto('/login')
  const demoButton = page.getByRole('button', { name: /prova demo/i })
  await expect(demoButton).toBeVisible()
  await demoButton.click()
  await page.waitForURL('**/dashboard', { timeout: 15_000 })
  await page.context().storageState({ path: authFile })
})
