import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { EncryptJWT, jwtDecrypt } from "jose";
import { encryptionKey } from "./config";

// Opaque browser identifiers; only hashes are indexed. The encrypted payloads
// contain Cognito tokens/challenges, never passwords. SQLite is a single-host
// session store, not an identity database. See docs/authentication.md.
let database: DatabaseSync | undefined;
function db() {
  if (!database) {
    encryptionKey();
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

export async function putRecord(
  kind: string,
  value: object,
  expires: number,
  id = randomId(),
) {
  const payload = await new EncryptJWT({ value, kind })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuer("agentshield-session")
    .setAudience(kind)
    .setExpirationTime(expires)
    .encrypt(encryptionKey());
  db().prepare("DELETE FROM records WHERE expires <= ?").run(now());
  db()
    .prepare("INSERT OR REPLACE INTO records VALUES (?, ?, ?, ?)")
    .run(hash(id), kind, payload, expires);
  return id;
}
export async function getRecord<T>(
  kind: string,
  id?: string,
): Promise<{ value: T; expires: number } | null> {
  if (!validId(id)) return null;
  const row = db()
    .prepare(
      "SELECT payload, expires FROM records WHERE id=? AND kind=? AND expires>?",
    )
    .get(hash(id!), kind, now());
  if (!row) return null;
  try {
    const { payload } = await jwtDecrypt(String(row.payload), encryptionKey(), {
      issuer: "agentshield-session",
      audience: kind,
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256GCM"],
    });
    return { value: payload.value as T, expires: Number(row.expires) };
  } catch {
    removeRecord(id);
    return null;
  }
}
export function removeRecord(id?: string) {
  if (validId(id))
    db().prepare("DELETE FROM records WHERE id=?").run(hash(id!));
}
// Atomic consume prevents parallel re-use of Cognito challenge sessions.
export async function takeRecord<T>(kind: string, id?: string) {
  const record = await getRecord<T>(kind, id);
  if (!record) return null;
  const deleted = db()
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
  const payload = await new EncryptJWT({ value, kind })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuer("agentshield-session")
    .setAudience(kind)
    .setExpirationTime(expires)
    .encrypt(encryptionKey());
  return (
    db()
      .prepare(
        "UPDATE records SET payload=? WHERE id=? AND kind=? AND expires>?",
      )
      .run(payload, hash(id), kind, now()).changes > 0
  );
}
export function rateLimit(key: string, maximum: number, seconds = 900) {
  db().prepare("DELETE FROM limits WHERE expires<=?").run(now());
  const row = db()
    .prepare(
      `INSERT INTO limits VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count`,
    )
    .get(hash(key), now() + seconds);
  return Number(row?.count) <= maximum;
}
export function acquireRefreshLock(id: string) {
  const owner = randomId();
  const row = db()
    .prepare(
      `INSERT INTO locks VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner, expires=excluded.expires WHERE locks.expires<=? RETURNING owner`,
    )
    .get(hash(id), owner, now() + 45, now());
  return row ? owner : null;
}
export function releaseRefreshLock(id: string, owner: string) {
  db().prepare("DELETE FROM locks WHERE id=? AND owner=?").run(hash(id), owner);
}
