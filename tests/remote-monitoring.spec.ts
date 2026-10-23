import { test, expect, login } from "./auth-fixture";

test.skip(
  process.env.AGENTSHIELD_TEST_REMOTE_MONITORING !== "true",
  "Set AGENTSHIELD_TEST_REMOTE_MONITORING=true to test the AWS-hosted monitoring path.",
);

test("AWS-hosted monitoring needs a session and operator access, without local AWS allowlist", async ({
  playwright,
  request,
}) => {
  const anonymous = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3100",
  });
  expect((await anonymous.get("/api/monitoring")).status()).toBe(401);
  await anonymous.dispose();
  await login(request);
  const denied = await request.get("/api/monitoring");
  expect(denied.status()).toBe(403);
  expect((await denied.json()).alarms).toBeUndefined();
  await login(request, `monitoring-${test.info().project.name}@example.test`);
  const ok = await request.get("/api/monitoring");
  expect(ok.status()).toBe(200);
  const data = await ok.json();
  expect(data.alarms.map((a: { state: string }) => a.state)).toEqual([
    "OK",
    "ALARM",
    "OK",
  ]);
  expect(data.health).toBe("1 monitored alarm triggered");
});

test("Reliability and navbar show AWS-hosted alarm states", async ({
  page,
}) => {
  await login(
    page.request,
    `monitoring-${test.info().project.name}@example.test`,
  );
  await page.goto("/reliability");
  await expect(page.locator("main")).toContainText(
    "1 monitored alarm triggered",
  );
  await expect(
    page.getByText("AgentShield-Lambda-Errors").first(),
  ).toBeVisible();
});

test("all alarms OK with an idle function shows scoped alarm status and the data gap", async ({
  page,
}) => {
  await login(
    page.request,
    `monitoring-idle-${test.info().project.name}@example.test`,
  );
  const response = await page.request.get("/api/monitoring");
  const data = await response.json();
  expect(data.alarms.map((a: { state: string }) => a.state)).toEqual([
    "OK",
    "OK",
    "OK",
  ]);
  expect(data.health).toBe("Monitored alarms OK");
  await page.goto("/reliability");
  await expect(page.locator(".live")).toContainText("Monitored alarms OK");
  await expect(page.locator("main")).toContainText(
    "3 of 10 metric series returned no complete data",
  );
  await expect(page.locator("main")).not.toContainText("Health unavailable");
  await expect(page.locator("main")).not.toContainText(/platform health/i);
});
