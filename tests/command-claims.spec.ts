import { test, expect } from "@playwright/test";
import { login, testUser } from "./auth-fixture";

test("Command and Claims display the same authorised first-page IDs", async ({
  page,
}) => {
  await login(page.request);
  const payload = await (await page.request.get("/api/claims")).json();
  await page.goto("/");
  const recent = page.getByRole("region", { name: "Recent claims" });
  await expect(recent.locator(".queue .row")).toHaveCount(
    payload.claims.length,
  );
  const commandLinks = await recent
    .locator(".queue a")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  expect(commandLinks).toEqual(
    payload.claims.map(
      (claim: { claimId: string }) => `/claim/${claim.claimId}`,
    ),
  );
  for (const claim of payload.claims) {
    await expect(recent).toContainText(claim.policyNumber);
    await expect(recent).toContainText(claim.status);
    await expect(
      recent.locator(`time[datetime="${claim.createdAt}"]`),
    ).toBeVisible();
  }
  await expect(recent).toContainText(
    "1 distinct claim across 2 returned pages",
  );
  await expect(recent.getByRole("definition")).toHaveText("1");
  await expect(page.locator(".hero")).toContainText(
    "All pages returned for your signed-in user were read",
  );
  await expect(recent).not.toContainText(/foreign|unowned|Marlow/);
  await page.goto("/claims");
  await expect(page.locator(".claim-row")).toHaveCount(payload.claims.length);
  expect(
    await page
      .locator(".claims-table a")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href"))),
  ).toEqual(commandLinks);
});

for (const [prefix, message] of [
  ["claims-empty", "No authorised claims were returned"],
  ["claims-failure", "Claims service is unavailable"],
  ["claims-invalid", "incomplete response"],
]) {
  test(`Command ${prefix} is explicit without fixture fallback`, async ({
    page,
  }) => {
    await login(page.request, testUser(prefix));
    await page.goto("/");
    const recent = page.getByRole("region", { name: "Recent claims" });
    await expect(recent).toContainText(message);
    await expect(recent.locator(".queue .row")).toHaveCount(0);
    if (prefix !== "claims-empty")
      await expect(recent).not.toContainText("0 claims on this page");
  });
}

test("Command shows loading, refreshes and clears stale data on failure", async ({
  page,
}) => {
  await login(page.request);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/claims", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/");
  const recent = page.getByRole("region", { name: "Recent claims" });
  await expect(recent).toContainText("Loading recent claims");
  await expect(recent).not.toContainText("0 claims on this page");
  release();
  await expect(recent.locator(".queue .row")).toHaveCount(1);
  await expect(recent).toContainText("Last successful update");
  await page.unroute("**/api/claims");
  await page.route("**/api/claims", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Claims service unavailable" }),
    }),
  );
  await page
    .locator("main")
    .getByRole("button", { name: "Refresh", exact: true })
    .click();
  await expect(recent.getByRole("alert")).toContainText(
    "Claims service unavailable",
  );
  await expect(recent.locator(".queue .row")).toHaveCount(0);
  await page.unroute("**/api/claims");
  await page
    .locator("main")
    .getByRole("button", { name: "Refresh", exact: true })
    .click();
  await expect(recent.locator(".queue .row")).toHaveCount(1);
});

const record = (claimId: string, status = "SUBMITTED") => ({
  claimId,
  policyNumber: `POL-${claimId}`,
  claimType: "Property",
  description: "CI pagination contract",
  status,
  createdAt: "2026-10-21T00:00:00Z",
});
test("Command counts all returned pages, deduplicates and keeps recent first page", async ({
  page,
}) => {
  await login(page.request);
  await page.route("**/api/claims*", (route) =>
    route.fulfill({
      json: new URL(route.request().url()).searchParams.has("nextToken")
        ? {
            claims: [record("one"), record("two", "CANCELLED")],
            nextToken: null,
          }
        : { claims: [record("one")], nextToken: "second" },
    }),
  );
  await page.goto("/");
  const recent = page.getByRole("region", { name: "Recent claims" });
  await expect(recent).toContainText(
    "2 distinct claims across 2 returned pages",
  );
  await expect(recent.locator(".queue .row")).toHaveCount(1);
  await expect(recent.getByRole("definition")).toHaveText(["1", "1"]);
  await expect(page.locator(".hero")).toContainText(
    "not AWS account-wide totals",
  );
});
test("Command clears partial totals if a later page fails", async ({
  page,
}) => {
  await login(page.request);
  await page.route("**/api/claims*", (route) =>
    route.fulfill(
      new URL(route.request().url()).searchParams.has("nextToken")
        ? { status: 503, json: { error: "Later page unavailable" } }
        : { json: { claims: [record("one")], nextToken: "second" } },
    ),
  );
  await page.goto("/");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Later page unavailable",
  );
  await expect(page.locator(".hero .kpi dd").first()).toContainText(
    "Unavailable",
  );
  await expect(page.locator(".queue .row")).toHaveCount(0);
});
test("Command bounds pagination and clearly labels partial counts", async ({
  page,
}) => {
  await login(page.request);
  let reads = 0;
  await page.route("**/api/claims*", (route) => {
    reads++;
    return route.fulfill({
      json: { claims: [record(String(reads))], nextToken: `page-${reads + 1}` },
    });
  });
  await page.goto("/");
  await expect(page.locator(".hero")).toContainText(
    "Partial counts: the 10-page refresh limit was reached",
  );
  expect(reads).toBe(10);
  await expect(
    page.getByRole("region", { name: "Recent claims" }),
  ).toContainText("10 distinct claims across 10 returned pages");
});
test("Command rejects repeating cursors", async ({ page }) => {
  await login(page.request);
  await page.route("**/api/claims*", (route) =>
    route.fulfill({ json: { claims: [record("one")], nextToken: "repeat" } }),
  );
  await page.goto("/");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "pagination repeated",
  );
  await expect(page.locator(".hero .kpi dd").first()).toContainText(
    "Unavailable",
  );
});
