// Real screenshots of a running Select instance (used for the README and visual review).
// Usage: node scripts/screenshots.mjs [baseUrl] [outDir]
// Needs Chrome/Chromium; set CHROME_PATH if it is not at /usr/bin/google-chrome.
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? "docs/screenshots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome" });
const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

await desktop.goto(`${base}/?demo=1`);
await desktop.waitForURL(/\/c\/[^/]+\/overview/, { timeout: 30_000, waitUntil: "commit" });
const cid = desktop.url().split("/c/")[1].split("/")[0];

if (process.env.SKIP_DEMO !== "1") {
  await desktop.getByRole("button", { name: /Run demo week/ }).click();
  // Wait for the toast (role=status), not the activity entry left by a previous run.
  await desktop.getByRole("status").filter({ hasText: "Demo week finished" }).waitFor({ timeout: 240_000 });
}

const shots = [
  ["overview", "overview"],
  ["autonomy", "autonomy"],
  ["approvals", "approvals"],
  ["tasks", "tasks"],
  ["organization", "organization"],
  ["verification", "verification"],
  ["agents", "agents"],
  ["costs", "costs"],
  ["activity", "activity"],
  ["connections", "connections"],
  ["settings", "settings"],
  ["inbox", "inbox"],
  ["goals", "goals"],
];
for (const [path, name] of shots) {
  await desktop.goto(`${base}/c/${cid}/${path}`);
  await desktop.waitForLoadState("networkidle");
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: `${out}/${name}.png` });
}
// A task with a correction and its receipts.
const rows = await desktop.evaluate(async (c) => (await (await fetch(`/api/companies/${c}/tasks?limit=200`)).json()).items, cid);
const corrected = rows.find((t) => t.attempts > 1) ?? rows[0];
await desktop.goto(`${base}/c/${cid}/tasks/${corrected.id}`);
await desktop.waitForLoadState("networkidle");
await desktop.getByRole("tab", { name: /Verification/ }).click();
await desktop.waitForTimeout(300);
await desktop.screenshot({ path: `${out}/task-receipts.png` });

const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
for (const path of ["overview", "approvals", "tasks", "autonomy"]) {
  await phone.goto(`${base}/c/${cid}/${path}`);
  await phone.waitForLoadState("networkidle");
  await phone.waitForTimeout(300);
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) console.warn(`horizontal overflow on ${path}: ${overflow}px`);
  await phone.screenshot({ path: `${out}/mobile-${path}.png`, fullPage: false });
}
await browser.close();
console.log(`screenshots written to ${out} (company ${cid})`);
