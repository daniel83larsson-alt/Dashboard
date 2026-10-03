import { test, expect } from '@playwright/test'

// Utloggad startsida + SEO. Fångar sådant som enhetstester inte ser: att sidan
// faktiskt renderar, att zoom är tillåten (tillgänglighet), att strukturerad data
// och metadata finns i den renderade sidan (inte bara i koden).

test.describe('välkomstsidan (utloggad)', () => {
  test('har en H1, rätt metadata och strukturerad data', async ({ page }) => {
    const res = await page.goto('/')
    expect(res?.ok()).toBeTruthy()

    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page).toHaveTitle(/DL Trainer/)

    const description = await page.locator('meta[name=description]').getAttribute('content')
    expect(description?.length ?? 0).toBeGreaterThan(50)
    expect(description?.length ?? 0).toBeLessThanOrEqual(165)

    await expect(page.locator('link[rel=canonical]')).toHaveCount(1)
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1)

    const types = await page.locator('script[type="application/ld+json"]').evaluateAll(
      els => els.map(e => JSON.parse(e.textContent ?? '{}')['@type']),
    )
    expect(types).toEqual(expect.arrayContaining(['SoftwareApplication', 'FAQPage']))
  })

  test('zoom är tillåten (ingen maximum-scale / user-scalable=no)', async ({ page }) => {
    await page.goto('/')
    const viewport = await page.locator('meta[name=viewport]').getAttribute('content')
    expect(viewport).not.toMatch(/maximum-scale|user-scalable\s*=\s*no/)
  })

  test('inget horisontellt scroll på mobilbredd', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow).toBe(false)
  })

  test('FAQ-svaren går att fälla upp', async ({ page }) => {
    await page.goto('/')
    const first = page.locator('details').first()
    await first.locator('summary').click()
    await expect(first).toHaveJSProperty('open', true)
  })

  test('robots.txt och sitemap.xml svarar', async ({ request }) => {
    expect((await request.get('/robots.txt')).ok()).toBeTruthy()
    expect((await request.get('/sitemap.xml')).ok()).toBeTruthy()
  })
})
