import "server-only";

export const SESSION_COOKIE = "agentshield_session";
export const CHALLENGE_COOKIE = "agentshield_challenge";
export const CSRF_COOKIE = "agentshield_csrf";
export const SIGNED_OUT_COOKIE = "agentshield_signed_out";
export const AUTH_COOKIES = [
  SESSION_COOKIE,
  CHALLENGE_COOKIE,
  CSRF_COOKIE,
  "agentshield_access",
  "agentshield_oauth_state",
  "agentshield_oauth_pkce",
];
export const noStore = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
};

export function authConfig() {
  const origin = new URL(process.env.APP_ORIGIN ?? "http://localhost:3000");
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    (origin.protocol !== "https:" &&
      !(
        origin.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(origin.hostname)
      ))
  ) {
    throw new Error(
      "APP_ORIGIN must be an HTTPS origin (HTTP is allowed only on localhost).",
    );
  }
  return {
    origin: origin.origin,
    secure: origin.protocol === "https:",
    region: "ap-southeast-2",
    poolId: "ap-southeast-2_2uQnEvufy",
    clientId: "phikh6a6u25oi8be7nefavodi",
    issuer:
      "https://cognito-idp.ap-southeast-2.amazonaws.com/ap-southeast-2_2uQnEvufy",
    domain:
      "https://ap-southeast-22uqnevufy.auth.ap-southeast-2.amazoncognito.com",
    apiOrigin: "https://b30dloh6e4.execute-api.ap-southeast-2.amazonaws.com",
    sessionSeconds: 8 * 60 * 60,
  };
}

export function encryptionKey() {
  const value = process.env.AUTH_SESSION_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error(
      "Set AUTH_SESSION_KEY to 32 random bytes encoded as 64 hex characters.",
    );
  }
  return Buffer.from(value, "hex");
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: authConfig().secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
