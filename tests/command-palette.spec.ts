import { test, expect } from "@playwright/test";
import { login } from "./auth-fixture";

test("search opens only owned claims and supports keyboard navigation", async ({ page }) => {
  await login(page.request);
  await page.goto("/");
  await page.getByRole("button", { name: "Search and navigate" }).click();
  const search = page.getByRole("dialog", { name: "Search and navigate" });
  await expect(search).toBeVisible();
  await expect(search).toContainText("11111111-1111-4111-8111-111111111111");
  await expect(search).not.toContainText(/foreign|unowned|Marlow/);
  await search.getByRole("searchbox").fill("11111111-1111-4111-8111-111111111111");
  await expect(search.getByRole("link")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(search).toBeHidden();
  await expect(page.getByRole("button", { name: "Search and navigate" })).toBeFocused();
});
