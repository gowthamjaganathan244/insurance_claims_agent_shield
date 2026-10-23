import { test, expect, login } from "./auth-fixture";
import type { Page } from "@playwright/test";

const colours = {
  ok: "rgb(34, 229, 139)",
  loading: "rgb(255, 212, 59)",
  bad: "rgb(255, 77, 87)",
  unknown: "rgb(139, 144, 153)",
};
type Status = keyof typeof colours;
const names = [
  "AgentShield-API-Errors",
  "AgentShield-Lambda-Errors",
  "AgentShield-Lambda-Latency",
];
const payload = (states: string[], health = "server-computed") => ({
  fetchedAt: new Date().toISOString(),
  start: new Date(Date.now() - 3600000).toISOString(),
  end: new Date().toISOString(),
  periodSeconds: 300,
  alarms: states.map((state, i) => ({
    name: names[i],
    state,
    updatedAt: new Date().toISOString(),
  })),
  metrics: [],
  health,
});
async function expectDot(page: Page, status: Status) {
  const dot = page.locator(".isl .live .health-dot");
  await expect(dot).toHaveCount(1);
  await expect(dot).toHaveAttribute("data-status", status);
  await expect(dot).toHaveCSS("background-color", colours[status]);
  if (status !== "unknown")
    await expect(dot).toHaveCSS("box-shadow", /rgba?\(/);
}
const operator = () => `monitoring-${test.info().project.name}@example.test`;

test("non-monitoring account stays neutral grey and makes no request", async ({
  page,
}) => {
  let requests = 0;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/monitoring") requests++;
  });
  await login(page.request);
  await page.goto("/");
  await expectDot(page, "unknown");
  await expect(page.locator(".live")).toContainText("Health unavailable");
  expect(requests).toBe(0);
});

test("loading is yellow, then verified OK from live provider is green", async ({
  page,
}) => {
  await login(page.request, operator());
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/monitoring", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/reliability");
  await expectDot(page, "loading");
  release();
  await expectDot(page, "ok");
  await expect(page.locator(".live")).toContainText("Monitored alarms OK");
  // Reliability and navbar share one provider state.
  await expect(page.locator("main .kpi").first()).toContainText(
    "Monitored alarms OK",
  );
});

for (const [label, states, expected] of [
  ["ALARM", ["OK", "ALARM", "OK"], "bad"],
  ["INSUFFICIENT_DATA", ["OK", "INSUFFICIENT_DATA", "OK"], "unknown"],
  ["UNAVAILABLE alarm record", ["OK", "UNAVAILABLE", "OK"], "unknown"],
  ["missing alarm record", ["OK", "OK"], "unknown"],
] as [string, string[], Status][]) {
  test(`${label} shows ${expected}, never green`, async ({ page }) => {
    await login(page.request, operator());
    await page.route("**/api/monitoring", (route) =>
      route.fulfill({ json: payload(states) }),
    );
    await page.goto("/reliability");
    await expectDot(page, expected);
  });
}

test("request failure is red; retry transitions through yellow to green", async ({
  page,
}) => {
  await login(page.request, operator());
  await page.route("**/api/monitoring", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "CloudWatch is unavailable." },
    }),
  );
  await page.goto("/reliability");
  await expectDot(page, "bad");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.unroute("**/api/monitoring");
  await page.route("**/api/monitoring", async (route) => {
    await gate;
    await route.fulfill({ json: payload(["OK", "OK", "OK"]) });
  });
  await page.getByRole("button", { name: "Refresh monitoring" }).click();
  await expectDot(page, "loading");
  release();
  await expectDot(page, "ok");
});

test("green turns red when an alarm fires on refresh", async ({ page }) => {
  await login(page.request, operator());
  let states = ["OK", "OK", "OK"];
  let health = "Monitored alarms OK";
  await page.route("**/api/monitoring", (route) =>
    route.fulfill({ json: payload(states, health) }),
  );
  await page.goto("/reliability");
  await expectDot(page, "ok");
  states = ["ALARM", "OK", "OK"];
  health = "1 monitored alarm triggered";
  await page.getByRole("button", { name: "Refresh monitoring" }).click();
  await expectDot(page, "bad");
  await expect(page.locator(".live")).toContainText(
    "1 monitored alarm triggered",
  );
});
