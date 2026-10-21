import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authConfig, cookieOptions, CSRF_COOKIE, noStore } from "./config";
import { AuthError, safeError } from "./cognito";
import { randomId, rateLimit } from "./store";

export function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: noStore });
}
export function issueCsrf(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return json({ error: "Request not allowed." }, 403);
  const existing = request.cookies.get(CSRF_COOKIE)?.value;
  const token =
    existing && /^[A-Za-z0-9_-]{43}$/.test(existing) ? existing : randomId();
  const response = json({ csrfToken: token });
  response.cookies.set(CSRF_COOKIE, token, {
    ...cookieOptions(3600),
    sameSite: "strict",
  });
  return response;
}
export async function readMutation(
  request: NextRequest,
): Promise<Record<string, unknown>> {
  if (
    request.headers.get("origin") !== authConfig().origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new AuthError(
      "Request not allowed. Reload this page and try again.",
      403,
    );
  const cookie = request.cookies.get(CSRF_COOKIE)?.value ?? "";
  const header = request.headers.get("x-csrf-token") ?? "";
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(cookie) ||
    !/^[A-Za-z0-9_-]{43}$/.test(header) ||
    !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))
  )
    throw new AuthError(
      "Your form has expired. Reload this page and try again.",
      403,
    );
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw new AuthError("Expected a JSON form.", 415);
  if (!rateLimit(`browser:${cookie}`, 80))
    throw new AuthError(
      "Too many attempts. Please wait before trying again.",
      429,
    );
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError("Enter the requested information.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16384) {
      await reader.cancel();
      throw new AuthError("Form is too large.", 413);
    }
    chunks.push(value);
  }
  try {
    const result: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!result || typeof result !== "object" || Array.isArray(result))
      throw new Error();
    return result as Record<string, unknown>;
  } catch {
    throw new AuthError("Invalid form. Please try again.");
  }
}
export function textField(
  body: Record<string, unknown>,
  key: string,
  maximum = 256,
) {
  const value = body[key];
  if (
    typeof value !== "string" ||
    !value ||
    (key !== "password" && !value.trim()) ||
    value.length > maximum
  )
    throw new AuthError(`Enter a valid ${key}.`);
  return key === "password" ? value : value.trim();
}
export function authFailure(error: unknown) {
  const safe = safeError(error);
  return json({ error: safe.message }, safe.status);
}
