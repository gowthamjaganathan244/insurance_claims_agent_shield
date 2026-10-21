import "server-only";
import { currentSession } from "./auth/session";
import { authConfig } from "./auth/config";
import { ownedClaim } from "./live-claims";
import { AuthError } from "./auth/cognito";

export async function claimsApi(
  method: "GET" | "PATCH" | "DELETE",
  id?: string,
  cursor?: string,
  body?: object,
) {
  const session = await currentSession();
  if (!session) throw new AuthError("Sign in to view your claims.", 401);
  if (id && !/^[A-Za-z0-9_-]{1,128}$/.test(id))
    throw new AuthError("Claim not found.", 404);
  if (cursor && (cursor.length > 8192 || !/^[A-Za-z0-9_=-]+$/.test(cursor)))
    throw new AuthError("Invalid pagination token.");
  const url = new URL(
    id ? `/claims/${encodeURIComponent(id)}` : "/claims",
    authConfig().apiOrigin,
  );
  if (cursor) url.searchParams.set("nextToken", cursor);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${session.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new AuthError(
      "Claims service is unavailable. Try refreshing shortly.",
      503,
    );
  }
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: "Your claims session was rejected. Sign in again.",
      403: "You do not have access to these claims.",
      404: "Claim not found or no longer eligible for this action.",
      400: "The claims service rejected this request. Check the information and refresh.",
      409: "The claim changed. Refresh before trying again.",
      429: "Too many requests. Wait before refreshing.",
    };
    throw new AuthError(
      messages[response.status] ??
        "Claims service is unavailable. Try refreshing shortly.",
      [400, 401, 403, 404, 409, 429].includes(response.status)
        ? response.status
        : 502,
    );
  }
  try {
    const data = await response.json();
    if (id) {
      const claim = ownedClaim(data, session.identity.sub);
      if (!claim || claim.claimId !== id)
        throw new AuthError("Claim not found.", 404);
      return claim;
    }
    if (
      !Array.isArray(data.claims) ||
      !(data.nextToken === null || typeof data.nextToken === "string")
    )
      throw new Error();
    return {
      claims: data.claims
        .map((value: unknown) => ownedClaim(value, session.identity.sub))
        .filter((value: unknown) => value !== null),
      nextToken: data.nextToken,
    };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError(
      "Claims service returned an incomplete response. No demonstration data is shown.",
      502,
    );
  }
}
