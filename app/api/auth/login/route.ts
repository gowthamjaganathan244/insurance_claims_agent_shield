import { type NextRequest } from "next/server";
import {
  answerChallenge,
  AuthError,
  signIn,
  type Challenge,
} from "@/lib/auth/cognito";
import {
  authConfig,
  AUTH_COOKIES,
  CHALLENGE_COOKIE,
  cookieOptions,
  SESSION_COOKIE,
  SIGNED_OUT_COOKIE,
} from "@/lib/auth/config";
import { authFailure, json, readMutation, textField } from "@/lib/auth/http";
import { createSession } from "@/lib/auth/session";
import {
  now,
  putRecord,
  rateLimit,
  removeRecord,
  takeRecord,
} from "@/lib/auth/store";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  let consumed: { value: Challenge; expires: number } | null = null;
  let checkedCsrf = false;
  try {
    const body = await readMutation(request);
    checkedCsrf = true;
    let result;
    if (body.action === "challenge") {
      consumed = await takeRecord<Challenge>(
        "challenge",
        request.cookies.get(CHALLENGE_COOKIE)?.value,
      );
      if (!consumed)
        throw new AuthError("Your sign-in attempt expired. Start again.", 401);
      if (!(await rateLimit(`challenge:${consumed.value.username}`, 20)))
        throw new AuthError(
          "Too many verification attempts. Please wait.",
          429,
        );
      const attributes =
        body.attributes &&
        typeof body.attributes === "object" &&
        !Array.isArray(body.attributes)
          ? (body.attributes as Record<string, string>)
          : undefined;
      result = await answerChallenge(consumed.value, {
        code: typeof body.code === "string" ? body.code : undefined,
        password: typeof body.password === "string" ? body.password : undefined,
        choice: typeof body.choice === "string" ? body.choice : undefined,
        attributes,
      });
    } else {
      const username = textField(body, "username", 128);
      const password = textField(body, "password");
      if (!(await rateLimit(`login:${username.toLowerCase()}`, 15)))
        throw new AuthError(
          "Too many sign-in attempts. Please wait before trying again.",
          429,
        );
      await removeRecord(request.cookies.get(CHALLENGE_COOKIE)?.value);
      result = await signIn(username, password);
    }
    if ("challenge" in result) {
      const challenge = result.challenge;
      const id = await putRecord(
        "challenge",
        challenge,
        Math.min(consumed?.expires ?? now() + 180, now() + 180),
      );
      const response = json({
        challenge: {
          name: challenge.name,
          requiredAttributes: challenge.requiredAttributes,
          choices: challenge.choices,
          secret: challenge.secret,
        },
      });
      response.cookies.set(CHALLENGE_COOKIE, id, cookieOptions(180));
      return response;
    }
    const session = await createSession(result.tokens);
    await removeRecord(request.cookies.get(SESSION_COOKIE)?.value);
    const response = json({ redirect: "/" });
    for (const name of [...AUTH_COOKIES, SIGNED_OUT_COOKIE])
      response.cookies.set(name, "", cookieOptions(0));
    response.cookies.set(
      SESSION_COOKIE,
      session.id,
      cookieOptions(authConfig().sessionSeconds),
    );
    return response;
  } catch (error) {
    const response = authFailure(error);
    // Let the user correct an MFA code without bypassing or extending the challenge.
    if (consumed && consumed.expires > now() && response.status !== 429) {
      const id = await putRecord("challenge", consumed.value, consumed.expires);
      response.cookies.set(
        CHALLENGE_COOKIE,
        id,
        cookieOptions(consumed.expires - now()),
      );
    } else if (checkedCsrf)
      response.cookies.set(CHALLENGE_COOKIE, "", cookieOptions(0));
    return response;
  }
}
