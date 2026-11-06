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

const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});
const desktop = await browser.newPage({
  viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2,
  colorScheme: "dark", reducedMotion: "reduce",
});

await desktop.goto(`${base}/?demo=1`);
await desktop.waitForURL(/\/c\/[^/]+\/overview/, { timeout: 30_000, waitUntil: "commit" });
const cid = desktop.url().split("/c/")[1].split("/")[0];

if (process.env.SKIP_DEMO !== "1") {
  await desktop.getByRole("button", { name: /Run demo week/ }).click();
  // The toast is ephemeral. Use the committed event as the authoritative signal.
  // This stays reliable on slow CI runners and avoids publishing incomplete screens.
  let finished = false;
  const started = Date.now();
  while (Date.now() - started < 240_000) {
    const response = await desktop.request.get(`${base}/api/companies/${cid}/overview?days=30`);
    if (response.ok()) {
      const overview = await response.json();
      if (overview.recent?.some((event) => event.kind === "demo.finished")) {
        finished = true;
        break;
      }
    }
    await desktop.waitForTimeout(1000);
  }
  if (!finished) throw new Error("Demo week did not finish: refusing to publish partial screenshots.");
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
  await desktop.evaluate(() => document.fonts.ready);
  await desktop.waitForTimeout(250);
  await desktop.screenshot({ path: `${out}/${name}.png`, animations: "disabled", caret: "hide" });
}
// A task with a correction and its receipts.
const rows = await desktop.evaluate(async (c) => (await (await fetch(`/api/companies/${c}/tasks?limit=200`)).json()).items, cid);
const corrected = rows.find((t) => t.attempts > 1) ?? rows[0];
await desktop.goto(`${base}/c/${cid}/tasks/${corrected.id}`);
await desktop.waitForLoadState("networkidle");
await desktop.getByRole("tab", { name: /Verification/ }).click();
await desktop.evaluate(() => document.fonts.ready);
await desktop.screenshot({ path: `${out}/task-receipts.png`, animations: "disabled", caret: "hide" });

const phone = await browser.newPage({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, colorScheme: "dark", reducedMotion: "reduce",
});
for (const path of ["overview", "approvals", "tasks", "autonomy"]) {
  await phone.goto(`${base}/c/${cid}/${path}`);
  await phone.waitForLoadState("networkidle");
  await phone.evaluate(() => document.fonts.ready);
  await phone.waitForTimeout(200);
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`horizontal overflow on ${path}: ${overflow}px`);
  await phone.screenshot({ path: `${out}/mobile-${path}.png`, fullPage: false, animations: "disabled", caret: "hide" });
}
await browser.close();
console.log(`screenshots written to ${out} (company ${cid})`);
