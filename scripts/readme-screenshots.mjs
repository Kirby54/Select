// The README's screenshots: real captures of a running Select, showing the sample company that
// scripts/sample-company.py creates through the public API (results submitted by the script, no model called).
//
//   node scripts/readme-screenshots.mjs [baseUrl] [outDir] [companyName]
//
// Defaults: http://localhost:3000, docs/screenshots, "Brightloop Studio". The stack runs in local auth mode.
// Uses the Chromium that Playwright finds; set CHROME_PATH to use another Chrome.
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? "docs/screenshots";
const companyName = process.argv[4] ?? "Brightloop Studio";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
const page = await desktop.newPage();

async function api(path) {
  const response = await page.request.get(`${base}/api${path}`);
  if (!response.ok()) throw new Error(`GET /api${path}: ${response.status()} ${await response.text()}`);
  return response.json();
}

const company = (await api("/companies")).find((c) => c.name === companyName);
if (!company) throw new Error(`No company called "${companyName}": run scripts/sample-company.py first.`);
const cid = company.id;
const c = `/companies/${cid}`;
const agents = await api(`${c}/agents`);
const tasks = (await api(`${c}/tasks?limit=200`)).items;
const messages = (await api(`${c}/messages?limit=50`)).items;
const byName = (name) => agents.find((a) => a.name === name);
const task = (title) => tasks.find((t) => t.title === title);

/** Open a page, wait until its data is in, and give animations time to settle. */
async function open(p, path) {
  await p.goto(`${base}/c/${cid}/${path}`);
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(500);
}

async function shoot(p, name) {
  await p.screenshot({ path: `${out}/${name}.png` });
  console.log(`  ${name}.png`);
}

await open(page, "overview");
await shoot(page, "home");

await open(page, "approvals");
await page.getByRole("button", { name: /Quote for a new landing page/ }).first().click();
await page.waitForTimeout(400);
await shoot(page, "approvals");

await open(page, "tasks");
await shoot(page, "tasks");

await open(page, `agents/${byName("Sam").id}`);
await shoot(page, "agent");

await open(page, "organization");
await shoot(page, "team");

const clara = messages.find((m) => m.subject === "Quote for a new landing page");
await open(page, `messages${clara ? `?m=${clara.id}` : ""}`);
await shoot(page, "messages");

await open(page, "autonomy");
await shoot(page, "autonomy");

// The quote whose quantity the customer never wrote: verification fails and nothing reaches an approval.
await open(page, `tasks/${task("Quote for Jan Richter").id}`);
await page.getByRole("tab", { name: /Verification/ }).click();
await page.waitForTimeout(400);
await shoot(page, "receipt");

await open(page, "routines");
await shoot(page, "routines");

const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "dark" });
const mobile = await phone.newPage();
for (const [path, name] of [["overview", "mobile-home"], ["approvals", "mobile-approvals"]]) {
  await open(mobile, path);
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`${path} overflows a phone screen by ${overflow}px`);
  await shoot(mobile, name);
}

await browser.close();
console.log(`Screenshots of ${companyName} written to ${out}.`);
