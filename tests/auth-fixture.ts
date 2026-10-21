import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
export const testPassword = "CI-only-Password123!";
export const testUser = (prefix = "assessor") =>
  `${prefix}-${randomUUID()}@example.test`;
export async function mutate(
  request: APIRequestContext,
  path: string,
  data: object,
  origin = "http://127.0.0.1:3100",
) {
  const csrf = await request.get("/api/auth/csrf");
  const { csrfToken } = await csrf.json();
  return request.post(path, {
    headers: { Origin: origin, "X-CSRF-Token": csrfToken },
    data,
  });
}
export async function login(request: APIRequestContext, username = testUser()) {
  const response = await mutate(request, "/api/auth/login", {
    username,
    password: testPassword,
  });
  expect(response.ok()).toBeTruthy();
  expect(await response.json()).toEqual({ redirect: "/" });
}
export const test = base.extend({
  page: async ({ page }, providePage) => {
    await login(page.request);
    await providePage(page);
  },
});
export { expect };
