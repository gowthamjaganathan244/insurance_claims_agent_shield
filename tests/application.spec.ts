import { test, expect } from "./auth-fixture";
import AxeBuilder from "@axe-core/playwright";
const routes = [
  "/",
  "/claims",
  "/claim/11111111-1111-4111-8111-111111111111",
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
test("live claims support description updates and confirmed cancellation", async ({
  page,
}) => {
  await page.goto("/claims");
  await expect(page.locator(".claims-table")).toContainText("POL-TEST");
  await expect(page.locator(".claims-table")).not.toContainText("Marlow");
  await page.goto("/claim/11111111-1111-4111-8111-111111111111");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Updated persisted description");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/claims/") &&
        response.request().method() === "PATCH" &&
        response.status() === 200,
    ),
    page.getByRole("button", { name: "Save description" }).click(),
  ]);
  await expect(
    page.getByRole("button", { name: "Save description" }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
    "Updated persisted description",
  );
  await page.getByRole("button", { name: "Cancel claim", exact: true }).click();
  await page.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(page.locator(".pane .tag")).toHaveText("CANCELLED");
  await page.goto("/claims");
  await page.getByRole("button", { name: "CANCELLED", exact: true }).click();
  await expect(page.locator(".claim-row")).toHaveCount(1);
});
test("communications shows unavailable data with accessible tabs", async ({
  page,
}) => {
  await page.goto("/communications");
  await expect(page.getByRole("tabpanel")).toContainText(
    "Template preview unavailable",
  );
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.getByRole("tab", { name: "Variables", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText(
    "variables unavailable",
  );
  await page
    .getByRole("tab", { name: "Variables", exact: true })
    .press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Version history" }),
  ).toBeFocused();
  await page.getByRole("tab", { name: "Delivery status" }).click();
  await expect(page.getByRole("tabpanel")).toContainText(
    "Delivery tracking not configured",
  );
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
test("disconnected pages never present fictional evidence or healthy monitoring", async ({
  page,
}) => {
  for (const route of ["/", "/security", "/reliability", "/communications"]) {
    await page.goto(route);
    await expect(page.locator("main")).not.toContainText(
      /4,218|INC-2291|INC-2288|CLM-48213|Marlow|99\.97%|1,420ms|Macro executed|Scheduled within|SMS/,
    );
    await expect(page.locator(".live")).toHaveText("Health unavailable");
    await expect(page.locator("main")).toContainText(
      /not connected|Not connected|not configured|unavailable|Unavailable|No document records returned/,
    );
  }
  await page.goto("/reliability");
  await expect(page.getByRole("slider")).toHaveCount(0);
  await expect(page.locator(".chart svg")).toHaveCount(0);
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
  await page.goto("/communications");
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
