import { test, expect, type Page } from "@playwright/test";
import path from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const FIXTURE_IMAGE = path.join(__dirname, "fixtures", "bird.jpg");

// Blåmes has rarity_score 1 in the seed data, and BIRDSPOT_MOCK_AI=1 (set in
// playwright.config.ts's webServer env) makes the server always "identify"
// this species without ever calling the real iNaturalist API.
const MOCK_SPECIES_NAME = "Blåmes";
const MOCK_SPECIES_SCORE = 1;

function uniqueEmail(tag: string) {
  return `pw-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function restSignup(email: string, password: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`REST signup failed: ${JSON.stringify(body)}`);
  return body as { access_token: string; user: { id: string; email: string } };
}

async function restInsertSighting(accessToken: string, userId: string, speciesName: string, score: number) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/birdspot_sightings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      user_id: userId,
      species_name: speciesName,
      photo_url: "seed/not-a-real-photo.jpg",
      score_awarded: score,
    }),
  });
  if (!res.ok) throw new Error(`REST seed insert failed: ${await res.text()}`);
}

async function managementQuery(managementToken: string, projectRef: string, query: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${managementToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

async function cleanupTestUsers(managementToken: string, projectRef: string, serviceRoleKey?: string) {
  // Storage objects aren't cascade-deleted by removing the auth.users row
  // (same gap noted in bokforing's receipts bucket) -- find the test users'
  // ids BEFORE deleting them so their photo folders can be purged too,
  // otherwise every run of this suite leaks a few KB of orphaned photos.
  if (serviceRoleKey) {
    const ids: { id: string }[] = await managementQuery(
      managementToken,
      projectRef,
      "select id from auth.users where email like 'pw-%@example.com';"
    );
    for (const { id } of ids) {
      const listRes = await fetch(`${SUPABASE_URL}/storage/v1/object/list/birdspot-photos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: `${id}/`, limit: 100 }),
      });
      const files: { name: string }[] = await listRes.json();
      if (files.length > 0) {
        await fetch(`${SUPABASE_URL}/storage/v1/object/birdspot-photos`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json" },
          body: JSON.stringify({ prefixes: files.map((f) => `${id}/${f.name}`) }),
        });
      }
    }
  }

  await managementQuery(
    managementToken,
    projectRef,
    `
      delete from birdspot_sightings where user_id in (select id from auth.users where email like 'pw-%@example.com');
      delete from auth.users where email like 'pw-%@example.com';
    `
  );
}

test.describe("Fågelspotting POC", () => {
  const pageErrors: Error[] = [];

  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) => pageErrors.push(err));
  });

  test.afterAll(async () => {
    // Definition of Done requires zero unhandled JS exceptions across the
    // whole run -- checked once at the end so every test's page contributes.
    expect(pageErrors, `Unhandled JS exceptions: ${pageErrors.map((e) => e.message).join("; ")}`).toHaveLength(0);

    const managementToken = process.env.SUPABASE_MANAGEMENT_TOKEN;
    const projectRef = process.env.SUPABASE_PROJECT_REF;
    if (managementToken && projectRef) {
      await cleanupTestUsers(managementToken, projectRef, process.env.SUPABASE_SERVICE_ROLE_KEY);
    }
  });

  test("1-5: signup, spot a bird (mocked AI), score computed + persisted", async ({ page }) => {
    const email = uniqueEmail("journey");
    const password = "TestPassword123!";

    await page.goto("/login");
    await page.getByRole("link", { name: "Skapa ett" }).click();
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /Skapa konto|Ett ögonblick/ }).click();

    // 1. Registration succeeds and lands on the authenticated home page.
    await expect(page).toHaveURL("/", { timeout: 10_000 });
    await expect(page.getByTestId("total-score")).toHaveText("0");

    // 2. Upload a fixture photo (same image every run).
    const fileInput = page.getByTestId("photo-input");
    await fileInput.setInputFiles(FIXTURE_IMAGE);

    // 3 + 4. AI call is mocked server-side (BIRDSPOT_MOCK_AI=1) and returns a
    // deterministic species name; a score is computed and shown.
    await expect(page.getByTestId("identify-result")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".result-species")).toHaveText(MOCK_SPECIES_NAME);
    await expect(page.getByTestId("identify-score")).toHaveText(`+${MOCK_SPECIES_SCORE} poäng`);

    // 5. Total score on the home page increased by exactly the right amount,
    // and survives a full reload (proves it was actually saved to the DB,
    // not just held in client state).
    await expect(page.getByTestId("total-score")).toHaveText(String(MOCK_SPECIES_SCORE));
    await page.reload();
    await expect(page.getByTestId("total-score")).toHaveText(String(MOCK_SPECIES_SCORE));
  });

  test("6-7: leaderboards show users in descending score order", async ({ page, browser }) => {
    // Seed two throwaway users directly via REST with deliberately different,
    // easy-to-compare scores so "descending order" is a meaningful check,
    // not trivially true with a single user.
    const passwordA = "TestPassword123!";
    const passwordB = "TestPassword123!";
    const emailA = uniqueEmail("high-scorer");
    const emailB = uniqueEmail("low-scorer");

    const userA = await restSignup(emailA, passwordA);
    const userB = await restSignup(emailB, passwordB);
    await restInsertSighting(userA.access_token, userA.user.id, "Lappuggla", 20);
    await restInsertSighting(userB.access_token, userB.user.id, "Gråsparv", 1);

    // View the leaderboard as a third, fresh, logged-in user (via the real UI).
    const context = await browser.newContext();
    const viewerPage = await context.newPage();
    viewerPage.on("pageerror", (err) => pageErrors.push(err));

    const viewerEmail = uniqueEmail("viewer");
    await viewerPage.goto("/login");
    await viewerPage.getByRole("link", { name: "Skapa ett" }).click();
    await viewerPage.locator("#email").fill(viewerEmail);
    await viewerPage.locator("#password").fill("TestPassword123!");
    await viewerPage.getByRole("button", { name: /Skapa konto|Ett ögonblick/ }).click();
    await expect(viewerPage).toHaveURL("/", { timeout: 10_000 });

    await viewerPage.goto("/leaderboard");

    async function assertDescending(testId: string) {
      const list = viewerPage.getByTestId(testId);
      await expect(list).toBeVisible();
      const scoreTexts = await list.locator(".status-line > div:last-child").allTextContents();
      const scores = scoreTexts.map((t) => parseInt(t.replace(/[^\d]/g, ""), 10));
      const sorted = [...scores].sort((a, b) => b - a);
      expect(scores).toEqual(sorted);

      // Confirm our two seeded users actually appear, in the right relative
      // order, not just that SOME list happens to be sorted.
      const rowTexts = await list.locator(".status-line").allTextContents();
      const indexA = rowTexts.findIndex((t) => t.includes(emailA));
      const indexB = rowTexts.findIndex((t) => t.includes(emailB));
      expect(indexA).toBeGreaterThanOrEqual(0);
      expect(indexB).toBeGreaterThanOrEqual(0);
      expect(indexA).toBeLessThan(indexB);
    }

    await assertDescending("leaderboard-alltime");
    await assertDescending("leaderboard-weekly");

    await context.close();
  });
});
