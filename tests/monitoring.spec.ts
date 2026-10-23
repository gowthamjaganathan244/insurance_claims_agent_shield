import { test, expect, login } from "./auth-fixture";

test("monitoring requires a session and explicit authorization even with a warm cache", async ({
  playwright,
  request,
}) => {
  const anonymous = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3100",
  });
  expect((await anonymous.get("/api/monitoring")).status()).toBe(401);
  await anonymous.dispose();
  await login(request, `monitoring-${test.info().project.name}@example.test`);
  const first = await request.get("/api/monitoring");
  expect(first.status()).toBe(200);
  expect(first.headers()["cache-control"]).toContain("no-store");
  const data = await first.json();
  expect(data.alarms).toHaveLength(3);
  expect(
    data.alarms.every((a: { state: string }) => a.state === "OK"),
  ).toBeTruthy();
  expect(data.health).toBe("Monitored alarms OK");
  expect(
    data.metrics.find((m: { id: string }) => m.id === "api_error_rate")
      .points[0].value,
  ).toBe(10);
  expect((await (await request.get("/api/monitoring")).json()).fetchedAt).toBe(
    data.fetchedAt,
  );
  await login(request);
  expect((await request.get("/api/monitoring")).status()).toBe(403);
});

test("authorized Reliability and navbar consume the monitoring endpoint", async ({
  page,
}) => {
  await login(
    page.request,
    `monitoring-${test.info().project.name}@example.test`,
  );
  await page.goto("/reliability");
  await expect(page.locator(".live")).toContainText("Monitored alarms OK");
  await expect(
    page.getByText("AgentShield-API-Errors", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".ch").getByText("API average latency", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Last retrieved:/)).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: "API average latency" })
    .click();
  await expect(
    page.getByRole("img", { name: /API average latency: observed/ }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("img", { name: /API average latency: observed/ })
      .locator("circle"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Refresh monitoring" }).click();
  await expect(
    page.getByRole("button", { name: "Refresh monitoring" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

for (const state of ["ALARM", "INSUFFICIENT_DATA", "UNAVAILABLE"]) {
  test(`Reliability preserves ${state} evidence without claiming health`, async ({
    page,
  }) => {
    await login(
      page.request,
      `monitoring-${test.info().project.name}@example.test`,
    );
    await page.route("**/api/monitoring", (route) =>
      route.fulfill({
        json: {
          fetchedAt: new Date().toISOString(),
          start: new Date().toISOString(),
          end: new Date().toISOString(),
          periodSeconds: 300,
          alarms: [{ name: "AgentShield-API-Errors", state, updatedAt: null }],
          metrics: [],
          health:
            state === "ALARM"
              ? "1 monitored alarm triggered"
              : state === "INSUFFICIENT_DATA"
                ? "1 alarm: insufficient data"
                : "Health unavailable",
        },
      }),
    );
    await page.goto("/reliability");
    await expect(page.getByText(state, { exact: true })).toBeVisible();
    await expect(page.locator(".live")).not.toContainText(
      "Monitored alarms OK",
    );
  });
}

test("monitoring errors clear evidence and allow manual retry", async ({
  page,
}) => {
  await login(
    page.request,
    `monitoring-${test.info().project.name}@example.test`,
  );
  await page.route("**/api/monitoring", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: "Temporary AWS credentials are missing, invalid or expired.",
      },
    }),
  );
  await page.goto("/reliability");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Temporary AWS credentials",
  );
  await expect(page.locator(".live")).toContainText("Health unavailable");
  await expect(
    page.getByText("Metrics unavailable", { exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/monitoring");
  await page.getByRole("button", { name: "Refresh monitoring" }).click();
  await expect(page.locator(".live")).toContainText("Monitored alarms OK");
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});

test("monitoring polling pauses while hidden and resumes on return", async ({
  page,
}) => {
  await login(
    page.request,
    `monitoring-${test.info().project.name}@example.test`,
  );
  await page.clock.install();
  let reads = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/monitoring") reads++;
  });
  await page.goto("/reliability");
  await expect(page.locator(".live")).toContainText("Monitored alarms OK");
  await expect(
    page.getByRole("button", { name: "Refresh monitoring" }),
  ).toBeEnabled();
  const initial = reads;
  await page.clock.fastForward(61000);
  await expect.poll(() => reads).toBeGreaterThan(initial);
  await expect(
    page.getByRole("button", { name: "Refresh monitoring" }),
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
