import { test, expect } from '@playwright/test'

// Inloggad mobilvy mot demokontot (se auth.setup.ts). Täcker fel som bara syns
// på telefon och som vi redan fått rätta en gång: skrivfältet gömt bakom
// bottenmenyn, fält under 16 px (iOS zoomar), etiketter som inte hör ihop med
// sina fält, och bottenmenyn utan Esc/fokus.

test.describe('mobil', () => {
  test('bottenmenyn öppnas, har namn på stäng-knappen och stängs med Esc', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('button', { name: 'Meny' }).click()
    const dialog = page.getByRole('dialog', { name: 'Meny' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Stäng menyn' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  test('aktiv flik i bottenmenyn markeras för skärmläsare', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.locator('nav a[aria-current="page"]').first()).toBeVisible()
  })

  test('coachens skrivfält ligger ovanför bottenmenyn', async ({ page }) => {
    await page.goto('/dashboard/coach')
    const input = page.getByLabel('Fråga coachen')
    await expect(input).toBeVisible()
    const nav = page.locator('nav.fixed').first()
    const [inputBox, navBox] = [await input.boundingBox(), await nav.boundingBox()]
    expect(inputBox && navBox).toBeTruthy()
    expect(inputBox!.y + inputBox!.height).toBeLessThanOrEqual(navBox!.y + 1)
  })

  test('textfält är minst 16 px (annars zoomar iOS in vid fokus)', async ({ page }) => {
    await page.goto('/dashboard/coach')
    const px = await page.getByLabel('Fråga coachen').evaluate(el => parseFloat(getComputedStyle(el).fontSize))
    expect(px).toBeGreaterThanOrEqual(16)
  })

  test('ingen sida får horisontellt scroll', async ({ page }) => {
    for (const path of ['/dashboard', '/dashboard/mat', '/dashboard/passlogg', '/dashboard/coach']) {
      await page.goto(path)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
      expect(overflow, `horisontellt scroll på ${path}`).toBe(false)
    }
  })
})
