import { expect, test } from "@playwright/test";

test("verified code evidence never grants cross-repo, email or production rights", async ({ page }) => {
  const companyResponse = await page.request.post("/api/companies", {
    data: { name: `Boundaries E2E ${Date.now()}`, country: "DE" },
  });
  expect(companyResponse.ok()).toBeTruthy();
  const company = await companyResponse.json() as { id: string };
  const cid = company.id;

  const agentResponse = await page.request.post(`/api/companies/${cid}/agents`, {
    data: { name: "Review-only coder", role: "Developer", task_types: ["code_change"] },
  });
  expect(agentResponse.ok()).toBeTruthy();
  const agent = await agentResponse.json() as { id: string };
  const aid = agent.id;
  const base = `/api/companies/${cid}/agents/${aid}/capabilities`;

  const denied = await page.request.post(`/api/companies/${cid}/tasks`, {
    data: {
      title: "Denied before grant", task_type: "code_change", assignee_id: aid,
      resource_scope: "repo:Kirby54/Select",
    },
  });
  expect(denied.status()).toBe(403);

  const issued = await page.request.post(base, {
    data: { scope: "repo:Kirby54/Select", days: 30 },
  });
  expect(issued.status()).toBe(201);
  const grant = await issued.json() as { id: string };

  const taskResponse = await page.request.post(`/api/companies/${cid}/tasks`, {
    data: {
      title: "Review a safe diff", task_type: "code_change", assignee_id: aid,
      resource_scope: "repo:Kirby54/Select",
    },
  });
  expect(taskResponse.status()).toBe(201);
  const task = await taskResponse.json() as { id: string };
  const anotherTaskResponse = await page.request.post(`/api/companies/${cid}/tasks`, {
    data: {
      title: "Will be blocked after revoke", task_type: "code_change", assignee_id: aid,
      resource_scope: "repo:Kirby54/Select",
    },
  });
  expect(anotherTaskResponse.status()).toBe(201);
  const anotherTask = await anotherTaskResponse.json() as { id: string };

  const diff = [
    "diff --git a/src/app.py b/src/app.py", "--- a/src/app.py", "+++ b/src/app.py",
    "@@ -1 +1 @@", "-print(1)", "+print(2)", "",
  ].join("\n");
  const submitted = await page.request.post(`/api/companies/${cid}/tasks/${task.id}/submit`, {
    data: { output: { summary: "One line change proposal", diff } },
  });
  expect(submitted.status()).toBe(200);
  const result = await submitted.json() as {
    outcome: string;
    receipts: { body: { capability_boundary: { scope: string; unlocks: string[] } } }[];
  };
  expect(result.outcome).toBe("awaiting_approval");
  expect(result.receipts[0]?.body.capability_boundary).toMatchObject({
    scope: "repo:Kirby54/Select", unlocks: [],
  });

  await page.goto(`/c/${cid}/agents/${aid}`);
  await expect(page.getByText("Permissions & Evidence")).toBeVisible();
  await expect(page.getByText("repo:Kirby54/Select", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Check code proposal" }).click();
  await expect(page.getByText("Allowed: proposal submission only")).toBeVisible();
  await page.getByRole("button", { name: "Check another repository" }).click();
  await expect(page.getByText("Denied by server")).toBeVisible();
  await page.getByRole("button", { name: "Attempt customer email" }).click();
  await expect(page.getByText("Denied by server")).toBeVisible();
  await page.getByRole("button", { name: "Attempt production change" }).click();
  await expect(page.getByText("Denied by server")).toBeVisible();

  await page.getByRole("button", { name: "Revoke access" }).click();
  await expect(page.getByText("revoked", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Check code proposal" }).click();
  await expect(page.getByText("Denied by server")).toBeVisible();

  const rejected = await page.request.post(`/api/companies/${cid}/tasks/${anotherTask.id}/submit`, {
    data: { output: { summary: "Should not be accepted", diff } },
  });
  expect(rejected.status()).toBe(403);
  const otherRepo = await page.request.post(`/api/companies/${cid}/tasks`, {
    data: {
      title: "Wrong repo", task_type: "code_change", assignee_id: aid,
      resource_scope: "repo:AnotherOrg/AnotherRepo",
    },
  });
  expect(otherRepo.status()).toBe(403);

  const grants = await page.request.get(base);
  expect(grants.ok()).toBeTruthy();
  const listing = await grants.json() as { grants: { id: string; status: string }[] };
  expect(listing.grants.find((g) => g.id === grant.id)?.status).toBe("revoked");
});
