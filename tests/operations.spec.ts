import { test, expect } from "@playwright/test";
import { login, mutate, testUser } from "./auth-fixture";
import AxeBuilder from "@axe-core/playwright";
test.skip(
  process.env.AGENTSHIELD_TEST_OPERATIONS !== "true",
  "Run separately with AGENTSHIELD_TEST_OPERATIONS=true; test transport only.",
);
const id = "11111111-1111-4111-8111-111111111111";
test("operator records assessment, approval and payment without a transfer", async ({
  page,
}) => {
  await login(page.request, testUser("operator"));
  await page.goto(`/claim/${id}`);
  await page.getByRole("tab", { name: "Assessment" }).click();
  await expect(page.getByRole("tabpanel")).toContainText(
    "Automated risk score",
  );
  await page
    .getByLabel("Reason / evidence note")
    .fill("Reviewed actual evidence in isolated test");
  await page
    .getByLabel("Assessment document IDs")
    .fill("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  await page.getByRole("button", { name: "Submit recorded action" }).click();
  await expect(page.locator("main")).toContainText(
    "Assessment note: Reviewed actual evidence",
  );
  await page.getByRole("tab", { name: "Approvals" }).click();
  await page.getByLabel("Reason / evidence note").fill("Approved after review");
  await page.getByLabel("Decision outcome").selectOption("APPROVED");
  await page.getByRole("button", { name: "Submit recorded action" }).click();
  await expect(page.locator("main")).toContainText("APPROVED");
  await page.getByRole("tab", { name: "Payments" }).click();
  await page.getByLabel("Reason / evidence note").fill("Payment record");
  await page.getByLabel("Payment record amount").fill("125.50");
  await page.getByLabel("Payment record reference").fill("external-reference");
  await page.getByRole("button", { name: "Submit recorded action" }).click();
  await expect(page.locator("main")).toContainText("Recorded amount: $125.50");
  await expect(page.locator("main")).toContainText(
    "No money transferred by AgentShield",
  );
  await page.reload();
  await page.getByRole("tab", { name: "Payments" }).click();
  await expect(page.locator("main")).toContainText("UNRECONCILED");
  await page
    .getByLabel("Action", { exact: true })
    .selectOption("reconciliation");
  await page
    .getByLabel("Reason / evidence note")
    .fill("Matched test statement");
  await page.getByLabel("Reconciliation outcome").selectOption("MATCHED");
  await page.getByRole("button", { name: "Submit recorded action" }).click();
  await expect(
    page.locator(".kpi", { hasText: "Reconciliation" }),
  ).toContainText("MATCHED");
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Decision recorded");
  await expect(page.getByRole("tabpanel")).toContainText(
    "Payment record created",
  );
  await expect(page.getByRole("tabpanel")).toContainText(
    "Reconciliation recorded",
  );
});
test("ordinary owner cannot record operational decisions", async ({ page }) => {
  await login(page.request);
  await page.goto(`/claim/${id}`);
  await page.getByRole("tab", { name: "Approvals" }).click();
  await expect(page.locator("main")).toContainText(
    "Only explicitly authorised operators",
  );
  await expect(
    page.getByRole("button", { name: "Submit recorded action" }),
  ).toHaveCount(0);
  expect(
    (
      await mutate(page.request, `/api/claims/${id}/operations`, {
        action: "decision",
      })
    ).status(),
  ).toBe(403);
});
test("communications reads stored template safely and never invents delivery", async ({
  page,
}) => {
  await login(page.request, testUser("operator"));
  await page.goto("/communications");
  await expect(page.getByRole("tabpanel")).toContainText(
    "Stored test contract",
  );
  expect(await page.evaluate(() => "templateExecuted" in window)).toBe(false);
  await page.getByRole("tab", { name: "Variables", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("{{claimId}}");
  await page.getByRole("tab", { name: "Content modernisation" }).click();
  const review = page.getByRole("tabpanel");
  await expect(review).toContainText(
    "Variables consistent across HTML and text",
  );
  await expect(review).toContainText("Text only: {{status}}");
  await expect(review).toContainText("Nothing is rewritten or published");
  await page.getByRole("tab", { name: "Delivery status" }).click();
  await expect(page.getByRole("tabpanel")).toContainText(
    "Delivery tracking not configured",
  );
  await expect(page.locator("main")).toContainText(
    "No recorded events on this page",
  );
});
test("operations mutation requires CSRF and foreign claims remain inaccessible", async ({
  request,
}) => {
  await login(request, testUser("operator"));
  expect(
    (await request.post(`/api/claims/${id}/operations`, { data: {} })).status(),
  ).toBe(403);
  expect((await request.get("/api/claims/foreign/operations")).status()).toBe(
    404,
  );
});
test("connected workflow and communications forms remain accessible on mobile", async ({
  page,
}) => {
  await login(page.request, testUser("operator"));
  await page.setViewportSize({ width: 320, height: 900 });
  for (const path of [`/claim/${id}`, "/communications"]) {
    await page.goto(path);
    if (path !== "/communications")
      await page.getByRole("tab", { name: "Assessment" }).click();
    await expect(page.getByLabel("Reason / evidence note")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(result.violations.map((v) => v.id)).toEqual([]);
  }
});

test("template versions: import, draft, approve with audit; never published to SES", async ({
  page,
}) => {
  await login(page.request, testUser("operator"));
  await page.goto("/communications");
  await page.getByRole("tab", { name: "Versions & approval" }).click();
  const panel = page.getByRole("tabpanel");
  await expect(panel).toContainText("No versions recorded yet");
  await expect(
    panel.locator(".kpi", { hasText: "Published to SES" }),
  ).toContainText("No");
  await panel
    .getByRole("button", { name: "Import current SES template" })
    .click();
  await expect(panel.getByRole("cell", { name: /v1/ })).toBeVisible();
  await expect(panel).toContainText("IMPORTED");
  await panel.getByRole("button", { name: "Propose draft" }).click();
  await panel.getByLabel("Subject").fill("Claim {{claimId}} received");
  await expect(panel).toContainText("Content checks:");
  await panel.getByLabel("Reason for change").fill("Clearer subject line");
  await panel.getByRole("button", { name: "Record draft" }).click();
  await expect(panel).toContainText("DRAFT");
  await panel.getByRole("button", { name: "Approve v2" }).click();
  await expect(
    panel.locator(".kpi", { hasText: "Approved version" }),
  ).toContainText("v2");
  await expect(panel).toContainText("self-approved");
  for (const text of [
    "Imported current SES template",
    "Draft proposed",
    "Draft approved",
  ])
    await expect(panel.locator(".timeline")).toContainText(text);
});
test("template versions are operator-only and require CSRF", async ({
  page,
}) => {
  await login(page.request);
  expect(
    (await page.request.get("/api/operations/templates/versions")).status(),
  ).toBe(403);
  await login(page.request, testUser("operator"));
  const r = await page.request.post("/api/operations/templates/versions", {
    data: { action: "import" },
  });
  expect(r.status()).toBe(403);
  expect(
    (
      await mutate(page.request, "/api/operations/templates/versions", {
        action: "delete-all",
      })
    ).status(),
  ).toBe(400);
});
