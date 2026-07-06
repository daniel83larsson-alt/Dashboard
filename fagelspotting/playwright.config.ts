import { defineConfig, devices } from "@playwright/test";
import fs from "fs";
import path from "path";

// The Playwright test runner is a separate Node process from Next.js's own
// dev/start server, which loads .env.local automatically -- this doesn't.
// Load it here too so tests/*.spec.ts can read the same Supabase creds.
const envPath = path.join(__dirname, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3610",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: "/opt/pw-browsers/chromium" } },
    },
  ],
  webServer: {
    command: "npm run start -- -p 3610",
    url: "http://localhost:3610/login",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      BIRDSPOT_MOCK_AI: "1",
    },
  },
});
