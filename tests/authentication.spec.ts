import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login, mutate, testPassword, testUser } from "./auth-fixture";

test("anonymous routes redirect before rendering private content", async ({
  page,
  request,
}) => {
  for (const path of [
    "/",
    "/claims",
    "/claim/CLM-48213",
    "/claim/FUTURE-ID",
    "/security",
    "/reliability",
    "/communications",
    "/logout",
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toContain("/login");
    expect(await response.text()).not.toContain("Marlow");
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("login form validates, toggles password, and reports invalid credentials safely", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Email or username")).toBeFocused();
  await page.getByLabel("Email or username").fill(testUser());
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByRole("button", { name: "Hide password" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#auth-error")).toContainText(
    "Sign-in could not be verified",
  );
  await expect(page.locator("#auth-error")).toBeFocused();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
});

test("verified sign-in survives refresh and login redirects without exposing tokens", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:3100")
      externalRequests.push(url.origin);
  });
  await page.goto("/login?returnTo=https://attacker.example");
  await page.getByLabel("Email or username").fill(testUser());
  await page.getByLabel("Password", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  await expect(page.locator("h1")).toContainText("4,218");
  await page.reload();
  await expect(page.locator("h1")).toContainText("4,218");
  await page.goto("/login");
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  const cookies = await context.cookies();
  const session = cookies.find(
    (cookie) => cookie.name === "agentshield_session",
  )!;
  expect(session.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(session.httpOnly).toBe(true);
  expect(session.sameSite).toBe("Lax");
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "agentshield_session",
  );
  const response = await page.request.get("/api/auth/session");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.text()).not.toMatch(/accessToken|idToken|refreshToken/);
  // Option A: credentials go to the local BFF; the browser never visits or
  // sends tokens/credentials directly to Cognito's hosted login or APIs.
  expect(externalRequests).toEqual([]);
});

test("tampered opaque sessions and invalid signed token claims are rejected", async ({
  request,
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "agentshield_session",
      value: "A".repeat(43),
      url: "http://127.0.0.1:3100",
    },
  ]);
  await page.goto("/claims");
  await expect(page).toHaveURL(/\/login$/);
  for (const prefix of [
    "bad-audience",
    "bad-client",
    "bad-issuer",
    "bad-use",
    "bad-signature",
    "expired-token",
  ]) {
    const result = await mutate(request, "/api/auth/login", {
      username: testUser(prefix),
      password: testPassword,
    });
    expect(result.status()).toBe(400);
    expect((await request.get("/api/auth/session")).status()).toBe(401);
  }
});

test("short-lived tokens refresh and rejected refresh fails closed", async ({
  request,
}) => {
  await login(request, testUser("refresh"));
  const results = await Promise.all(
    Array.from({ length: 4 }, () => request.get("/api/auth/session")),
  );
  for (const result of results) expect(result.status()).toBe(200);
  await login(request, testUser("refresh-denied"));
  expect((await request.get("/api/auth/session")).status()).toBe(401);
  expect(
    (await request.get("/claims", { maxRedirects: 0 })).headers().location,
  ).toContain("/login");
});

test("CSRF and foreign origins cannot submit credentials or sign users out", async ({
  request,
}) => {
  const denied = await request.post("/api/auth/login", {
    data: { username: testUser(), password: testPassword },
  });
  expect(denied.status()).toBe(403);
  const crossSite = await mutate(
    request,
    "/api/auth/login",
    { username: testUser(), password: testPassword },
    "https://attacker.example",
  );
  expect(crossSite.status()).toBe(403);
  await login(request);
  expect(
    (
      await mutate(request, "/api/auth/logout", {}, "https://attacker.example")
    ).status(),
  ).toBe(403);
  expect((await request.get("/api/auth/session")).status()).toBe(200);
  expect((await request.get("/api/auth/logout")).status()).toBe(405);
});

test("MFA cannot be skipped and incorrect codes can be corrected", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(testUser("mfa"));
  await page.getByLabel("Password", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Verify your identity" }),
  ).toBeVisible();
  expect((await page.request.get("/api/auth/session")).status()).toBe(401);
  await page.getByLabel("Verification code").fill("000000");
  await page.getByRole("button", { name: "Continue securely" }).click();
  await expect(page.locator("#auth-error")).toContainText("incorrect");
  await page.getByLabel("Verification code").fill("123456");
  await page.getByRole("button", { name: "Continue securely" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
});

test("new password, required attributes and subsequent MFA are enforced", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(testUser("new-password"));
  await page.getByLabel("Password", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("New password", { exact: true }).fill(testPassword);
  await page.getByLabel("Confirm new password").fill(testPassword);
  await page.getByLabel("name", { exact: true }).fill("Test Assessor");
  await page.getByRole("button", { name: "Continue securely" }).click();
  await expect(page.getByLabel("Verification code")).toBeVisible();
  expect((await page.request.get("/api/auth/session")).status()).toBe(401);
  await page.getByLabel("Verification code").fill("123456");
  await page.getByRole("button", { name: "Continue securely" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
});

test("authenticator enrollment, SMS, email and MFA selection use challenge sessions", async ({
  request,
}) => {
  for (const prefix of ["setup", "sms", "email", "select"]) {
    const response = await mutate(request, "/api/auth/login", {
      username: testUser(prefix),
      password: testPassword,
    });
    expect((await response.json()).challenge).toBeTruthy();
    if (prefix === "select")
      expect(
        (
          await mutate(request, "/api/auth/login", {
            action: "challenge",
            choice: "SMS_MFA",
          })
        ).ok(),
      ).toBeTruthy();
    const done = await mutate(request, "/api/auth/login", {
      action: "challenge",
      code: "123456",
    });
    expect(await done.json()).toEqual({ redirect: "/" });
    expect((await request.get("/api/auth/session")).status()).toBe(200);
  }
});

test("password recovery calls Cognito and returns to sign-in", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByLabel("Email or username").fill(testUser());
  await page.getByRole("button", { name: "Send recovery code" }).click();
  await expect(page.getByRole("status")).toContainText(
    "If this account supports recovery",
  );
  await page.getByLabel("Verification code").fill("123456");
  await page.getByLabel("New password", { exact: true }).fill(testPassword);
  await page.getByLabel("Confirm new password").fill(testPassword);
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Your password has been reset",
  );
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});

test("logout revokes the server session, clears cookies, and Back cannot restore it", async ({
  page,
  context,
  playwright,
}) => {
  await login(page.request);
  const captured = (await context.cookies()).find(
    (cookie) => cookie.name === "agentshield_session",
  )!;
  await page.goto("/claims");
  await page.goto("/logout");
  await expect(
    page.getByRole("heading", { name: "Ready to sign out?" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  // Managed logout is the only browser hop; verify it uses the registered URL.
  await page.route(
    "https://ap-southeast-22uqnevufy.auth.ap-southeast-2.amazoncognito.com/logout?**",
    async (route) => {
      const url = new URL(route.request().url());
      expect(url.searchParams.get("logout_uri")).toBe("http://127.0.0.1:3100");
      // Playwright WebKit cannot fulfill a 302; simulate the browser return hop.
      await route.fulfill({
        contentType: "text/html",
        body: '<script>location.replace("http://127.0.0.1:3100")</script>',
      });
    },
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("status")).toContainText(
    "You have been signed out",
  );
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === "agentshield_session",
    ),
  ).toBe(false);
  const attacker = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3100",
    extraHTTPHeaders: { Cookie: `agentshield_session=${captured.value}` },
  });
  expect((await attacker.get("/api/auth/session")).status()).toBe(401);
  await attacker.dispose();
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator(".queue")).toHaveCount(0);
});

test("login stays usable on narrow screens", async ({ page }) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("server-side expiry and encrypted session tampering cannot be bypassed", async ({
  page,
  context,
}) => {
  for (const action of ["expire", "tamper"]) {
    await login(page.request);
    const cookie = (await context.cookies()).find(
      (item) => item.name === "agentshield_session",
    )!;
    await page.request.post("http://127.0.0.1:3199/test-control", {
      data: { id: cookie.value, action },
    });
    await page.goto("/claims");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator(".queue")).toHaveCount(0);
    expect((await page.request.get("/api/auth/session")).status()).toBe(401);
  }
});

test("expired challenges and replayed MFA answers fail closed", async ({
  request,
}) => {
  const username = testUser("mfa");
  await mutate(request, "/api/auth/login", {
    username,
    password: testPassword,
  });
  const state = await request.storageState();
  const cookie = state.cookies.find(
    (item) => item.name === "agentshield_challenge",
  )!;
  await request.post("http://127.0.0.1:3199/test-control", {
    data: { id: cookie.value, action: "expire" },
  });
  expect(
    (
      await mutate(request, "/api/auth/login", {
        action: "challenge",
        code: "123456",
      })
    ).status(),
  ).toBe(401);
  expect((await request.get("/api/auth/session")).status()).toBe(401);
  await mutate(request, "/api/auth/login", {
    username,
    password: testPassword,
  });
  expect(
    (
      await mutate(request, "/api/auth/login", {
        action: "challenge",
        code: "123456",
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await mutate(request, "/api/auth/login", {
        action: "challenge",
        code: "123456",
      })
    ).status(),
  ).toBe(401);
});
