import { test, expect } from "@playwright/test";
import { login, testUser, mutate } from "./auth-fixture";
test("claims BFF denies anonymous access", async ({ request }) => {
  expect((await request.get("/api/claims")).status()).toBe(401);
});
test("claims contract excludes foreign and unowned records and preserves pagination", async ({
  request,
}) => {
  await login(request);
  const response = await request.get("/api/claims");
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.claims).toHaveLength(1);
  expect(result.claims[0].claimId).toBe("11111111-1111-4111-8111-111111111111");
  expect(JSON.stringify(result)).not.toContain("ownerSub");
  expect(
    (await (await request.get("/api/claims?nextToken=test-page-2")).json())
      .claims,
  ).toEqual([]);
  expect(response.headers()["cache-control"]).toContain("no-store");
});
for (const [prefix, text] of [
  ["claims-empty", "No claims are available"],
  ["claims-failure", "Claims service is unavailable"],
  ["claims-invalid", "incomplete response"],
]) {
  test(`claims ${prefix} never falls back to demo`, async ({ page }) => {
    await login(page.request, testUser(prefix));
    await page.goto("/claims");
    await expect(page.locator("main")).toContainText(text);
    await expect(page.locator("main")).not.toContainText("Marlow");
    await expect(page.locator(".queue .row")).toHaveCount(0);
  });
}
test("claim mutation requires CSRF and disallows status editing", async ({
  request,
}) => {
  await login(request);
  const path = "/api/claims/11111111-1111-4111-8111-111111111111";
  expect(
    (await request.patch(path, { data: { description: "bad" } })).status(),
  ).toBe(403);
  const csrf = await (await request.get("/api/auth/csrf")).json();
  expect(
    (
      await request.patch(path, {
        headers: {
          Origin: "http://127.0.0.1:3100",
          "X-CSRF-Token": csrf.csrfToken,
        },
        data: { status: "APPROVED" },
      })
    ).status(),
  ).toBe(400);
  expect((await mutate(request, "/api/claims", {})).status()).toBe(405);
});

test("claims polling pauses while hidden and refreshes on return", async ({
  page,
}) => {
  await login(page.request);
  await page.clock.install();
  let reads = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/claims") reads++;
  });
  await page.goto("/claims");
  await expect(page.locator(".queue")).toContainText("POL-TEST");
  const initial = reads;
  await page.clock.fastForward(31000);
  await expect.poll(() => reads).toBeGreaterThan(initial);
  await expect(
    page.getByRole("button", { name: "Refresh claims" }),
  ).toBeEnabled();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hidden = reads;
  await page.clock.fastForward(120000);
  expect(reads).toBe(hidden);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => reads).toBeGreaterThan(hidden);
});
