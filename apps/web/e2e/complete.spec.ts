/**
 * The complete version, through the interface, on a stack started with SELECT_AUTH_MODE=password
 * and the local mail servers of scripts/dev-mail.py (real IMAP and SMTP servers on this machine):
 * first owner, guided setup, a real mailbox, an e-mail read, triaged, routed, quoted, approved and
 * sent once, then an invited colleague joins.
 *
 * Agent outputs are submitted through the API, as an external agent runtime would: no model is
 * called by this test.
 *
 *   E2E_PASSWORD_BASE_URL=http://localhost:3101 E2E_SENT_DIR=/path/to/sent npx playwright test complete
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

const BASE = process.env.E2E_PASSWORD_BASE_URL;
const IMAP_PORT = process.env.E2E_IMAP_PORT ?? "1143";
const SMTP_PORT = process.env.E2E_SMTP_PORT ?? "1025";
const SENT_DIR = process.env.E2E_SENT_DIR;
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CSRF = { "x-select-csrf": "1" };
const stamp = Date.now();
const COMPANY = `Menuiserie Martin ${stamp}`;
const OWNER = { name: "Ahmed", email: `owner-${stamp}@example.com`, password: "a long owner password" };
const s = (value: string, ref: string) => ({ value, source_ref: ref });

test.skip(!BASE, "needs a stack in password mode (E2E_PASSWORD_BASE_URL) and scripts/dev-mail.py serve");
test.use({ baseURL: BASE });
test.describe.configure({ mode: "serial" });

let cid = "";

function dropMail(subject: string, body: string) {
  execFileSync("uv", ["run", "python", "scripts/dev-mail.py", "--imap-port", IMAP_PORT, "drop", "--subject", subject, "--body", body], {
    cwd: ROOT,
    stdio: "pipe",
  });
}

async function json<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`/api${path}`);
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as T;
}

async function submit(page: Page, taskId: string, output: unknown) {
  const response = await page.request.post(`/api/companies/${cid}/tasks/${taskId}/submit`, { data: { output }, headers: CSRF });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test("first visit creates the owner and opens the guided setup", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL(/\/setup/);
  await page.getByLabel("Your name").fill(OWNER.name);
  await page.getByLabel("E-mail").fill(OWNER.email);
  await page.getByLabel("Password", { exact: true }).fill(OWNER.password);
  await page.getByLabel("Password again").fill(OWNER.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/new/);

  // Company: France fills EUR, the French VAT rates, Europe/Paris and French.
  await page.getByLabel("Company name").fill(COMPANY);
  await expect(page.getByLabel("VAT rates (%)")).toHaveValue("20, 10, 5.5, 2.1, 0");
  await page.getByRole("button", { name: "Create the company" }).click();
  await page.waitForURL(/step=team/);
  cid = new URL(page.url()).searchParams.get("c")!;

  // Team: the craft template, in French.
  await expect(page.getByRole("radio", { name: /Artisan ou atelier/ })).toBeVisible();
  await page.getByRole("button", { name: "Create this team" }).click();
  await page.waitForURL(/step=model/);
  await page.getByRole("button", { name: "Later" }).click();

  // Mailbox: the local IMAP and SMTP servers; the test logs in and sends nothing.
  await page.waitForURL(/step=mailbox/);
  await page.getByLabel("E-mail address").fill(`contact-${stamp}@menuiserie-martin.test`);
  await page.locator("#imap-sec").selectOption("none");
  await page.locator("#imap-host").fill("127.0.0.1");
  await page.locator("#imap-port").fill(IMAP_PORT);
  await page.locator("#imap-user").fill("demouser");
  await page.locator("#imap-pass").fill("demopass");
  await page.locator("#smtp-sec").selectOption("none");
  await page.locator("#smtp-host").fill("127.0.0.1");
  await page.locator("#smtp-port").fill(SMTP_PORT);
  await expect(page.getByText("Without encryption the password travels in clear text.")).toBeVisible();
  await page.getByRole("button", { name: "Connect and test" }).click();
  await expect(page.getByText(/Reading \(IMAP\):.*message\(s\) in INBOX/)).toBeVisible();
  await expect(page.getByText("Sending (SMTP): signed in; nothing was sent")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // Catalog pasted from a French spreadsheet.
  await page.waitForURL(/step=catalog/);
  await page.getByLabel("Catalog lines").fill("Référence;Libellé;Unité;Prix unitaire;TVA\nPT-CHENE;Plan de travail chêne;m;189,00;20 %\nETAGERE;Étagère murale;pc;64,50;20 %");
  await expect(page.getByRole("cell", { name: "Plan de travail chêne" })).toBeVisible();
  await page.getByRole("button", { name: "Save 2 items" }).click();

  await page.waitForURL(/step=done/);
  await expect(page.getByText("3 agents", { exact: true })).toBeVisible();
  await expect(page.getByText("2 catalog items", { exact: true })).toBeVisible();
  await expect(page.getByText("No model connected")).toBeVisible();
  await page.getByRole("button", { name: `Open ${COMPANY}` }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});

test("an e-mail is read, triaged, routed, quoted, approved and sent once", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));

  // Wait until the worker has read the mailbox once: mail older than that is never answered.
  await expect.poll(async () => (await json<{ last_poll_at: string | null }[]>(page, `/companies/${cid}/mailboxes`))[0]?.last_poll_at, { timeout: 60_000 }).not.toBeNull();
  dropMail("Devis plan de travail", "Bonjour, pourriez-vous me faire un devis pour 3.2 m de plan de travail chêne et 2 étagères murales ?\nJonas Weber");

  await page.goto(`/c/${cid}/connections`);
  await page.getByRole("button", { name: "Read now" }).click();
  await page.goto(`/c/${cid}/messages`);
  await expect(page.getByText("Devis plan de travail").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Being triaged").first()).toBeVisible();

  // The triage agent has no model: its classification arrives through the submission API.
  const triage = (await json<{ items: { id: string }[] }>(page, `/companies/${cid}/tasks?task_type=message_triage`)).items[0]!;
  await submit(page, triage.id, { category: "quote_request", priority: "normal", summary: "Devis pour un plan de travail et deux étagères" });
  await page.goto(`/c/${cid}/approvals`);
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Decision recorded")).toBeVisible();

  // Code routed the verified triage to the quotes agent.
  const quote = (await json<{ items: { id: string; assignee_name: string }[] }>(page, `/companies/${cid}/tasks?task_type=quote`)).items[0]!;
  expect(quote.assignee_name).toBe("Devis");
  const detail = await json<{ inputs: { sources: { id: string }[] } }>(page, `/companies/${cid}/tasks/${quote.id}`);
  const src = `source:${detail.inputs.sources[0]!.id}`;
  await submit(page, quote.id, {
    customer: { name: s("Jonas Weber", src), email: s("jonas.weber@example.org", src) },
    lines: [
      { catalog_ref: "PT-CHENE", quantity: s("3.2", src), unit_price: s("189.00", "catalog:PT-CHENE"), vat_rate: s("0.20", "catalog:PT-CHENE"), line_total: s("604.80", "calc:q*p") },
      { catalog_ref: "ETAGERE", quantity: s("2", src), unit_price: s("64.50", "catalog:ETAGERE"), vat_rate: s("0.20", "catalog:ETAGERE"), line_total: s("129.00", "calc:q*p") },
    ],
    totals: { net: s("733.80", "calc:sum"), vat: s("146.76", "calc:vat"), gross: s("880.56", "calc:gross") },
  });

  await page.goto(`/c/${cid}/approvals`);
  await expect(page.getByText("Exactly the e-mail that would be sent")).toBeVisible();
  await expect(page.getByText(/Total TTC\s*: 880,56 €/)).toBeVisible();
  await expect(page.getByText(/Sent once by e-mail from contact-/)).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Decision recorded")).toBeVisible();

  await page.goto(`/c/${cid}/messages?view=outbox`);
  await expect(page.getByLabel("Sent e-mails").getByText("Sent", { exact: true })).toBeVisible({ timeout: 30_000 });
  if (SENT_DIR) {
    const read = () => readdirSync(SENT_DIR).map((f) => readFileSync(join(SENT_DIR, f), "utf8")).filter((m) => m.includes(`contact-${stamp}`));
    await expect.poll(() => read().length).toBe(1);
    const sent = read();
    expect(sent[0]).toContain("Subject: Re: Devis plan de travail");
    expect(sent[0]).toContain("X-Select-Review: human-approved");
  }
  await page.goto(`/c/${cid}/messages`);
  await page.getByRole("radio", { name: "All" }).click();
  await expect(page.getByText("Handled").first()).toBeVisible();
});

test("an invited colleague chooses a password and joins", async ({ page, browser }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.goto(`/c/${cid}/settings?section=people`);
  await page.getByLabel("E-mail address to invite").fill(`lea-${stamp}@example.com`);
  await page.getByRole("button", { name: "Create link" }).click();
  const link = (await page.locator("code").filter({ hasText: "/invite/" }).textContent())!;

  const guest = await browser.newContext({ baseURL: BASE });
  const other = await guest.newPage();
  await other.goto(new URL(link).pathname);
  await expect(other.getByRole("heading", { name: `Join ${COMPANY} on Select` })).toBeVisible();
  await other.getByLabel("Your name").fill("Léa");
  await other.getByLabel("Choose a password").fill("another long password");
  await other.getByRole("button", { name: "Create my account and join" }).click();
  await other.waitForURL(new RegExp(`/c/${cid}/overview`));
  await other.goto(`/c/${cid}/settings`);
  await expect(other.getByText("Read-only: only an owner or admin can change these settings.")).toBeVisible();
  await guest.close();

  await page.reload();
  await expect(page.getByText(`lea-${stamp}@example.com`)).toBeVisible();

  // Signing out ends the session: the company is no longer reachable.
  await page.getByRole("button", { name: /Signed in as Ahmed\. Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
  await page.goto(`/c/${cid}/overview`);
  await page.waitForURL(/\/login\?next=/);
});
