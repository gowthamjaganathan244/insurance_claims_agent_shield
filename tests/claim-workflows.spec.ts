import { test, expect } from "@playwright/test";
import { login, mutate, testUser } from "./auth-fixture";
const id = "11111111-1111-4111-8111-111111111111";
const path = `/api/claims/${id}/documents`;
test("document and operation routes deny anonymous access", async ({
  request,
}) => {
  for (const route of [
    path,
    `/api/claims/${id}/operations`,
    "/api/operations/templates",
  ])
    expect((await request.get(route)).status()).toBe(401);
});
test("creation requires explicit email acknowledgement and CSRF", async ({
  request,
}) => {
  await login(request);
  const data = {
    policyNumber: "POL-CREATED",
    claimType: "Property",
    description: "Automated isolated fixture",
  };
  expect((await request.post("/api/claims", { data })).status()).toBe(403);
  expect((await mutate(request, "/api/claims", data)).status()).toBe(400);
  const created = await mutate(request, "/api/claims", {
    ...data,
    confirmEmail: true,
  });
  expect(created.status()).toBe(201);
  expect((await created.json()).policyNumber).toBe("POL-CREATED");
  expect(
    JSON.stringify(await (await request.get("/api/claims")).json()),
  ).not.toContain("ownerSub");
});
test("document upload rejects unsafe size, type and ID and requires CSRF", async ({
  request,
}) => {
  await login(request);
  expect(
    (await request.post(`${path}/upload-url`, { data: {} })).status(),
  ).toBe(403);
  for (const body of [
    { fileName: "x.exe", contentType: "application/pdf", sizeBytes: 10 },
    { fileName: "x.pdf", contentType: "application/pdf", sizeBytes: 10469376 },
    { fileName: "../x.pdf", contentType: "application/pdf", sizeBytes: 10 },
  ])
    expect((await mutate(request, `${path}/upload-url`, body)).status()).toBe(
      400,
    );
  expect(
    (await mutate(request, `${path}/not-valid/complete`, {})).status(),
  ).toBe(400);
});
test("document service missing or invalid never falls back to sample incidents", async ({
  page,
}) => {
  for (const prefix of ["documents-missing", "documents-invalid"]) {
    await login(page.request, testUser(prefix));
    await page.goto("/security");
    await expect(page.locator("main").getByRole("alert")).toContainText(
      /not available|not connected/,
    );
    await expect(page.locator("main")).not.toContainText(
      /INC-2291|CLM-48213|NO_THREATS_FOUND/,
    );
  }
});
test("signed upload completes and shows recorded pending scan, never clean or isolated", async ({
  page,
}) => {
  await login(page.request);
  await page.route(
    "https://agentshield-claim-documents-gj2026.s3.ap-southeast-2.amazonaws.com/",
    (route) =>
      route.fulfill({
        status: 204,
        headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:3100" },
      }),
  );
  await page.goto(`/claim/${id}`);
  await page.getByRole("tab", { name: "Documents" }).click();
  await page.getByLabel("Upload PDF, PNG or JPEG").setInputFiles({
    name: "evidence.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-test-contract"),
  });
  await page
    .getByRole("button", { name: "Upload document", exact: true })
    .click();
  await expect(page.locator("main")).toContainText(
    "Upload verified. Recorded status: PENDING_SCAN; scan: PENDING",
  );
  await page.getByText("evidence.pdf · PENDING_SCAN", { exact: true }).click();
  await expect(page.locator("main")).toContainText("PENDING");
  await expect(page.locator("main")).not.toContainText("NO_THREATS_FOUND");
});
