import { test, expect } from "./auth-fixture";
import AxeBuilder from "@axe-core/playwright";
const routes = [
  "/",
  "/claims",
  "/claim/CLM-48213",
  "/security",
  "/reliability",
  "/communications",
];
test("all views render without errors or horizontal overflow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${route} at ${width}px`,
      ).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});
test("claims filters, evidence, decisions and audit remain consistent", async ({
  page,
}) => {
  await page.goto("/claims");
  await page.getByRole("button", { name: "Approved", exact: true }).click();
  await expect(page.locator(".queue .row")).toHaveCount(1);
  await expect(page.locator(".queue")).toContainText("Jamal Ortega");
  await page.goto("/claim/CLM-48207");
  await page.getByRole("button", { name: "Review evidence" }).click();
  await expect(
    page.getByRole("button", { name: /police_report/ }),
  ).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Approve action" }).click();
  await page.getByRole("tab", { name: "Decision and payment" }).click();
  await expect(page.getByRole("tabpanel")).toContainText(
    "Scheduled within 2 business days",
  );
  await page.getByRole("tab", { name: "Audit", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Claim approved");
  await page.getByRole("link", { name: "Back to claims" }).click();
  await page.getByRole("button", { name: "Approved", exact: true }).click();
  await expect(page.locator(".queue .row")).toHaveCount(2);
});
test("communications drafts and variables survive tab and template changes", async ({
  page,
}) => {
  await page.goto("/communications");
  await page
    .getByLabel("Message text")
    .fill(
      "Hello {{firstName}}, claim {{claimId}} is ready. <script>safe text</script>",
    );
  await expect(page.locator(".msg")).toContainText(
    "<script>safe text</script>",
  );
  await page.getByRole("tab", { name: "Variables", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("claimId");
  await page
    .getByRole("tab", { name: "Variables", exact: true })
    .press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Version history" }),
  ).toBeFocused();
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await expect(page.getByLabel("Message text")).toHaveValue(/safe text/);
  await page.getByRole("button", { name: "DOCUMENT_HELD SMS" }).click();
  await expect(page.getByLabel("Message text")).toHaveValue(/security team/);
  await page.getByRole("button", { name: "CLAIM_RECEIVED SMS" }).click();
  await expect(page.getByLabel("Message text")).toHaveValue(/safe text/);
});
test("Dynamic Island supports mobile navigation, Escape and scroll collapse", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const toggle = page.getByRole("button", {
    name: /open navigation/i,
    includeHidden: true,
  });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Claims", exact: true })
    .click();
  await expect(page).toHaveURL(/\/claims$/);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, 700));
  await expect(page.locator(".isl")).toHaveClass(/mini/);
});
test("security evidence and keyboard latency inspection work", async ({
  page,
}) => {
  await page.goto("/security");
  await page.locator("summary").first().click();
  await expect(page.locator("details").first()).toHaveAttribute("open", "");
  await expect(page.locator("details").first()).toContainText(
    "Macro executed on open",
  );
  await page.goto("/reliability");
  await page.getByRole("slider").focus();
  await page.getByRole("slider").press("ArrowLeft");
  await expect(page.locator(".tip")).toBeVisible();
  await expect(page.getByRole("slider")).toHaveValue("46");
});
test("accessibility and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const route of routes) {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((item) => ({
        id: item.id,
        nodes: item.nodes.map((node) => node.target),
      })),
      route,
    ).toEqual([]);
  }
  expect(
    await page
      .locator(".isl")
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
});
test("unknown claims and original hash links resolve safely", async ({
  page,
}) => {
  const response = await page.goto("/claim/CLM-00000");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  await page.goto("/#/communications");
  await expect(page).toHaveURL(/\/communications$/);
  await expect(
    page.getByRole("heading", { name: "Communications" }),
  ).toBeVisible();
});

test("low-powered devices disable costly motion and backdrop effects", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 2 }),
  );
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  for (const selector of [".lq", ".isl"]) {
    const styles = await page
      .locator(selector)
      .first()
      .evaluate((element) => ({
        animation: getComputedStyle(element).animationName,
        backdrop: getComputedStyle(element).backdropFilter,
      }));
    expect(styles).toEqual({ animation: "none", backdrop: "none" });
  }
});
