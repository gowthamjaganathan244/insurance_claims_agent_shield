import { NextRequest, NextResponse } from "next/server";

// An inexpensive redirect only. Every protected page and API data boundary
// independently verifies the server-side session and signed Cognito JWTs.
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const publicRoute = path === "/login" || path.startsWith("/api/auth/");
  const response =
    !publicRoute && !request.cookies.get("agentshield_session")?.value
      ? NextResponse.redirect(new URL("/login", request.url))
      : NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  return response;
}
export const config = {
  matcher: [
    "/",
    "/claims/:path*",
    "/claim/:path*",
    "/security/:path*",
    "/reliability/:path*",
    "/communications/:path*",
    "/login",
    "/logout",
    "/api/auth/:path*",
  ],
};
