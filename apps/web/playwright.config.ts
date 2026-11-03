import { defineConfig } from "@playwright/test";

// Runs against an already started stack (docker compose, or scripts/dev-up.sh).
// CHROME_PATH lets you use an installed Chrome instead of `npx playwright install chromium`.
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  },
});
