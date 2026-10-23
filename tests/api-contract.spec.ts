import { test, expect } from "@playwright/test";
import { login, mutate, testUser } from "./auth-fixture";

const C = "11111111-1111-4111-8111-111111111111";
const DOC = "a".repeat(32);
const base = "http://127.0.0.1:3100";
const reads = [
  "/api/auth/session",
  "/api/claims",
  `/api/claims/${C}`,
  `/api/claims/${C}/documents`,
  `/api/claims/${C}/operations`,
  "/api/monitoring",
  "/api/operations/templates",
];
const writes: [string, string][] = [
  ["POST", "/api/claims"],
  ["PATCH", `/api/claims/${C}`],
  ["DELETE", `/api/claims/${C}`],
  ["POST", `/api/claims/${C}/documents/upload-url`],
  ["POST", `/api/claims/${C}/documents/${DOC}/complete`],
  ["POST", `/api/claims/${C}/operations`],
];

test("every protected API route rejects anonymous reads and writes", async ({
  playwright,
}) => {
  const anon = await playwright.request.newContext({ baseURL: base });
  for (const path of reads) {
    const r = await anon.get(path);
    expect(r.status(), path).toBe(401);
    expect(r.headers()["cache-control"] ?? "", path).toContain("no-store");
  }
  for (const [method, path] of writes) {
    const r = await anon.fetch(path, {
      method,
      headers: { Origin: base, "Content-Type": "application/json" },
      data: {},
    });
    expect([401, 403], `${method} ${path}`).toContain(r.status());
  }
  await anon.dispose();
});

test("signed-in writes require same origin, CSRF token and JSON", async ({
  request,
}) => {
  await login(request);
  const { csrfToken } = await (await request.get("/api/auth/csrf")).json();
  for (const [method, path] of writes) {
    const noCsrf = await request.fetch(path, {
      method,
      headers: { Origin: base, "Content-Type": "application/json" },
      data: {},
    });
    expect(noCsrf.status(), `no CSRF ${method} ${path}`).toBe(403);
    const crossSite = await request.fetch(path, {
      method,
      headers: {
        Origin: "https://evil.example",
        "X-CSRF-Token": csrfToken,
        "Content-Type": "application/json",
      },
      data: {},
    });
    expect(crossSite.status(), `cross-origin ${method} ${path}`).toBe(403);
    const wrongType = await request.fetch(path, {
      method,
      headers: {
        Origin: base,
        "X-CSRF-Token": csrfToken,
        "Content-Type": "text/plain",
      },
      data: "{}",
    });
    expect(wrongType.status(), `content-type ${method} ${path}`).toBe(415);
  }
});

test("input validation and identifier handling never reach other records", async ({
  request,
}) => {
  await login(request);
  for (const body of [
    {},
    { policyNumber: "", claimType: "Property", description: "x" },
    { policyNumber: "P", claimType: "Property" },
  ])
    expect(
      (await mutate(request, "/api/claims", body)).status(),
      JSON.stringify(body),
    ).toBeGreaterThanOrEqual(400);
  const patch = (data: object) =>
    request.fetch(`/api/claims/${C}`, {
      method: "PATCH",
      headers: { Origin: base },
      data,
    });
  expect((await patch({ status: "APPROVED" })).status()).toBe(403); // no CSRF
  expect(
    (
      await mutate(request, `/api/claims/${C}/documents/not-hex/complete`, {})
    ).status(),
  ).toBeGreaterThanOrEqual(400);
  for (const id of ["..%2F..%2Fetc", "foreign", "%00", "a".repeat(300)]) {
    const r = await request.get(`/api/claims/${id}`);
    expect(r.status(), id).toBeGreaterThanOrEqual(400);
    expect(r.status(), id).toBeLessThan(500);
  }
  expect(
    (await request.get("/api/claims?nextToken=%3Cscript%3E")).status(),
  ).toBe(400);
});

test("claims created through the API are owner-scoped across users", async ({
  playwright,
}) => {
  const alice = await playwright.request.newContext({ baseURL: base });
  const bob = await playwright.request.newContext({ baseURL: base });
  await login(alice, testUser("alice"));
  await login(bob, testUser("bob"));
  const created = await mutate(alice, "/api/claims", {
    policyNumber: "POL-SYN-API-001",
    claimType: "Home contents",
    description: "SYNTHETIC: water damage to carpet.",
    confirmEmail: true,
  });
  expect(created.status()).toBe(201);
  const claim = await created.json();
  expect(claim.policyNumber).toBe("POL-SYN-API-001");
  expect(claim.ownerSub).toBeUndefined(); // owner subject never sent to browsers
  const aliceList = await (await alice.get("/api/claims")).json();
  expect(
    aliceList.claims.map((c: { policyNumber: string }) => c.policyNumber),
  ).toContain("POL-SYN-API-001");
  const bobList = await (await bob.get("/api/claims")).json();
  expect(JSON.stringify(bobList)).not.toContain("POL-SYN-API-001");
  await alice.dispose();
  await bob.dispose();
});

test("API and pages send security headers", async ({ request }) => {
  await login(request);
  for (const path of ["/api/claims", "/claims"]) {
    const h = (await request.get(path)).headers();
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["content-security-policy"], path).toContain(
      "frame-ancestors 'none'",
    );
    expect(h["content-security-policy"], path).toContain("object-src 'none'");
  }
});
