import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { errors } from "jose";
import { authConfig, SESSION_COOKIE } from "./config";
import {
  acquireRefreshLock,
  releaseRefreshLock,
  getRecord,
  now,
  putRecord,
  removeRecord,
  replaceRecord,
} from "./store";
import {
  refreshTokens,
  revoke,
  verifyTokens,
  type Identity,
  type Tokens,
} from "./cognito";

export interface Session {
  tokens: Tokens;
  identity: Identity;
}
export async function createSession(tokens: Tokens) {
  const identity = await verifyTokens(tokens);
  const id = await putRecord(
    "session",
    { tokens, identity },
    now() + authConfig().sessionSeconds,
  );
  return { id, identity };
}
const refreshing = new Map<string, Promise<Session | null>>();
export async function readSession(id?: string): Promise<Session | null> {
  const record = await getRecord<Session>("session", id);
  if (!record || !id) return null;
  try {
    const identity = await verifyTokens(record.value.tokens);
    if (identity.expires > now() + 60) return { ...record.value, identity };
  } catch (error) {
    if (!(error instanceof errors.JWTExpired)) {
      removeRecord(id);
      return null;
    }
  }
  let pending = refreshing.get(id);
  if (!pending) {
    pending = (async () => {
      let owner: string | null = null;
      try {
        // SQLite lease also serializes refreshes across Next route bundles/processes.
        for (let attempt = 0; attempt < 150 && !owner; attempt++) {
          owner = acquireRefreshLock(id);
          if (!owner) await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (!owner) return null;
        const latest = await getRecord<Session>("session", id);
        if (!latest) return null;
        if (
          latest.value.tokens.accessToken !== record.value.tokens.accessToken
        ) {
          return {
            ...latest.value,
            identity: await verifyTokens(latest.value.tokens),
          };
        }
        const tokens = await refreshTokens(latest.value.tokens);
        const session = { tokens, identity: await verifyTokens(tokens) };
        if (await replaceRecord("session", session, record.expires, id))
          return session;
        // A logout won the race while Cognito refreshed. Revoke the new token too.
        await revoke(tokens).catch(() => undefined);
      } catch {
        removeRecord(id);
      } finally {
        if (owner) releaseRefreshLock(id, owner);
      }
      return null;
    })().finally(() => refreshing.delete(id));
    refreshing.set(id, pending);
  }
  return pending;
}
export async function currentSession() {
  return readSession((await cookies()).get(SESSION_COOKIE)?.value);
}
export async function requireSession() {
  const session = await currentSession();
  if (!session) redirect("/login");
  return session;
}
