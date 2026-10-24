import { type NextRequest } from "next/server";
import {
  AUTH_COOKIES,
  CHALLENGE_COOKIE,
  SESSION_COOKIE,
  SIGNED_OUT_COOKIE,
  authConfig,
  cookieOptions,
} from "@/lib/auth/config";
import { revoke } from "@/lib/auth/cognito";
import { getRecord, removeRecord } from "@/lib/auth/store";
import { type Session } from "@/lib/auth/session";
import { authFailure, json, readMutation } from "@/lib/auth/http";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    await readMutation(request);
    const id = request.cookies.get(SESSION_COOKIE)?.value;
    const session = await getRecord<Session>("session", id);
    // Delete before the network request; a captured cookie cannot restore this session.
    await removeRecord(id);
    await removeRecord(request.cookies.get(CHALLENGE_COOKIE)?.value);
    let revoked = true;
    if (session)
      await revoke(session.value.tokens).catch(() => {
        revoked = false;
      });
    const config = authConfig();
    const destination = new URL("/logout", config.domain);
    destination.searchParams.set("client_id", config.clientId);
    destination.searchParams.set("logout_uri", config.origin);
    const response = json({ redirect: destination.toString() });
    for (const name of AUTH_COOKIES)
      response.cookies.set(name, "", cookieOptions(0));
    response.cookies.set(
      SIGNED_OUT_COOKIE,
      revoked ? "1" : "local",
      cookieOptions(180),
    );
    response.headers.set("Clear-Site-Data", '"cache", "storage"');
    return response;
  } catch (error) {
    return authFailure(error);
  }
}
