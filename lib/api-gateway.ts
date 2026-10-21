import "server-only";
import { authConfig } from "./auth/config";
import { requireSession } from "./auth/session";

/** Server-only boundary. No caller or public proxy route is enabled in Task 11.
 * Register each of the seven verified method/path contracts before wiring UI.
 * Never accept a URL, Authorization header, or ownerSub from the browser.
 */
export interface GatewayOperation {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
}
export async function authenticatedGatewayRequest(
  operation: GatewayOperation,
  body?: unknown,
) {
  const session = await requireSession();
  if (
    !/^\/[A-Za-z0-9/_-]*$/.test(operation.path) ||
    operation.path.startsWith("//") ||
    operation.path.includes("..")
  )
    throw new Error("Invalid API path");
  const destination = new URL(operation.path, authConfig().apiOrigin);
  if (destination.origin !== authConfig().apiOrigin)
    throw new Error("Invalid API origin");
  const response = await fetch(destination, {
    method: operation.method,
    headers: {
      Authorization: `Bearer ${session.tokens.accessToken}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  // Do not propagate upstream bodies/errors containing sensitive implementation details.
  if (!response.ok)
    throw new Error(`Claims service returned HTTP ${response.status}`);
  return response;
}
