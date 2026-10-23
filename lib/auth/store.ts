import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { EncryptJWT, jwtDecrypt } from "jose";
import { encryptionKey } from "./config";

// Opaque browser identifiers; only hashes are stored. The encrypted payloads
// contain Cognito tokens/challenges, never passwords. Two backends:
// - Redis over HTTPS (Upstash/Vercel KV) when its REST URL/token are set, for
//   serverless hosts with no persistent disk;
// - otherwise SQLite on a private disk for single-host Node hosting.
// See docs/authentication.md and docs/hosting.md.
const redisUrl =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisToken =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const useRedis = !!(redisUrl && redisToken);

async function redis(command: (string | number)[]): Promise<unknown> {
  const response = await fetch(redisUrl!, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  const body = (await response.json().catch(() => ({}))) as {
    result?: unknown;
    error?: string;
  };
  if (!response.ok || body.error) throw new Error("Session store unavailable");
  return body.result ?? null;
}

let database: DatabaseSync | undefined;
async function db() {
  if (!database) {
    encryptionKey();
    const { DatabaseSync } = await import("node:sqlite");
    // Runtime data is provisioned on private disk, never bundled into deployments.
    const file = resolve(
      /* turbopackIgnore: true */ process.env.AUTH_DATABASE_PATH ??
        ".auth/sessions.sqlite",
    );
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    database = new DatabaseSync(file);
    chmodSync(file, 0o600);
    database.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS locks (id TEXT PRIMARY KEY, owner TEXT NOT NULL, expires INTEGER NOT NULL);`);
  }
  return database;
}
export const randomId = () => randomBytes(32).toString("base64url");
const hash = (id: string) => createHash("sha256").update(id).digest("hex");
const validId = (id?: string) => !!id && /^[A-Za-z0-9_-]{43}$/.test(id);
export const now = () => Math.floor(Date.now() / 1000);
const key = (space: string, id: string) => `agentshield:${space}:${hash(id)}`;

function seal(kind: string, value: object, expires: number) {
  return new EncryptJWT({ value, kind })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuer("agentshield-session")
    .setAudience(kind)
    .setExpirationTime(expires)
    .encrypt(encryptionKey());
}
async function open<T>(kind: string, payload: string) {
  const { payload: claims } = await jwtDecrypt(payload, encryptionKey(), {
    issuer: "agentshield-session",
    audience: kind,
    keyManagementAlgorithms: ["dir"],
    contentEncryptionAlgorithms: ["A256GCM"],
  });
  return { value: claims.value as T, expires: Number(claims.exp) };
}

export async function putRecord(
  kind: string,
  value: object,
  expires: number,
  id = randomId(),
) {
  const payload = await seal(kind, value, expires);
  if (useRedis) {
    await redis(["SET", key("rec", id), payload, "EXAT", expires]);
    return id;
  }
  const d = await db();
  d.prepare("DELETE FROM records WHERE expires <= ?").run(now());
  d.prepare("INSERT OR REPLACE INTO records VALUES (?, ?, ?, ?)").run(
    hash(id),
    kind,
    payload,
    expires,
  );
  return id;
}
export async function getRecord<T>(
  kind: string,
  id?: string,
): Promise<{ value: T; expires: number } | null> {
  if (!validId(id)) return null;
  let payload: string | null;
  if (useRedis) {
    const result = await redis(["GET", key("rec", id!)]);
    payload = typeof result === "string" ? result : null;
  } else {
    const row = (await db())
      .prepare(
        "SELECT payload FROM records WHERE id=? AND kind=? AND expires>?",
      )
      .get(hash(id!), kind, now());
    payload = row ? String(row.payload) : null;
  }
  if (!payload) return null;
  try {
    // The audience check binds each payload to its record kind.
    return await open<T>(kind, payload);
  } catch {
    await removeRecord(id);
    return null;
  }
}
export async function removeRecord(id?: string) {
  if (!validId(id)) return;
  if (useRedis) await redis(["DEL", key("rec", id!)]);
  else (await db()).prepare("DELETE FROM records WHERE id=?").run(hash(id!));
}
// Atomic consume prevents parallel re-use of Cognito challenge sessions.
export async function takeRecord<T>(kind: string, id?: string) {
  if (useRedis) {
    if (!validId(id)) return null;
    const payload = await redis(["GETDEL", key("rec", id!)]);
    if (typeof payload !== "string") return null;
    return open<T>(kind, payload).catch(() => null);
  }
  const record = await getRecord<T>(kind, id);
  if (!record) return null;
  const deleted = (await db())
    .prepare("DELETE FROM records WHERE id=? AND kind=?")
    .run(hash(id!), kind);
  return deleted.changes ? record : null;
}
// Update only an existing record: a concurrent logout must never resurrect it.
export async function replaceRecord(
  kind: string,
  value: object,
  expires: number,
  id: string,
) {
  const payload = await seal(kind, value, expires);
  if (useRedis)
    return (
      (await redis(["SET", key("rec", id), payload, "XX", "EXAT", expires])) ===
      "OK"
    );
  return (
    (await db())
      .prepare(
        "UPDATE records SET payload=? WHERE id=? AND kind=? AND expires>?",
      )
      .run(payload, hash(id), kind, now()).changes > 0
  );
}
const INCREMENT = `local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return c`;
const RELEASE = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0`;
export async function rateLimit(key_: string, maximum: number, seconds = 900) {
  if (useRedis)
    return (
      Number(
        await redis(["EVAL", INCREMENT, 1, key("limit", key_), seconds]),
      ) <= maximum
    );
  const d = await db();
  d.prepare("DELETE FROM limits WHERE expires<=?").run(now());
  const row = d
    .prepare(
      `INSERT INTO limits VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count`,
    )
    .get(hash(key_), now() + seconds);
  return Number(row?.count) <= maximum;
}
export async function acquireRefreshLock(id: string) {
  const owner = randomId();
  if (useRedis)
    return (await redis(["SET", key("lock", id), owner, "NX", "EX", 45])) ===
      "OK"
      ? owner
      : null;
  const row = (await db())
    .prepare(
      `INSERT INTO locks VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner, expires=excluded.expires WHERE locks.expires<=? RETURNING owner`,
    )
    .get(hash(id), owner, now() + 45, now());
  return row ? owner : null;
}
export async function releaseRefreshLock(id: string, owner: string) {
  if (useRedis) await redis(["EVAL", RELEASE, 1, key("lock", id), owner]);
  else
    (await db())
      .prepare("DELETE FROM locks WHERE id=? AND owner=?")
      .run(hash(id), owner);
}
