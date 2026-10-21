"use client";
export async function authRequest(path: string, body: object) {
  const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
  if (!csrfResponse.ok)
    throw new Error("Unable to start a secure form. Reload and try again.");
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to complete this request. Please try again.",
    );
  return result;
}
