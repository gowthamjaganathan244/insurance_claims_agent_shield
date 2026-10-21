import { spawn } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startMockCognito } from "./mock-cognito.mjs";
const directory = mkdtempSync(join(tmpdir(), "agentshield-auth-test-"));
const databasePath = join(directory, "sessions.sqlite");
const mock = await startMockCognito(({ id, action }) => {
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA busy_timeout=5000");
  const hash = createHash("sha256").update(id).digest("hex");
  try {
    if (action === "expire")
      db.prepare("UPDATE records SET expires=0 WHERE id=?").run(hash);
    if (action === "tamper")
      db.prepare(
        "UPDATE records SET payload='invalid-ciphertext' WHERE id=?",
      ).run(hash);
    return { ok: true };
  } finally {
    db.close();
  }
});
const app = spawn(
  process.execPath,
  [
    "--import",
    resolve("tests/mock-register.mjs"),
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      APP_ORIGIN: "http://127.0.0.1:3100",
      AUTH_SESSION_KEY: randomBytes(32).toString("hex"),
      AUTH_DATABASE_PATH: databasePath,
    },
  },
);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  app.kill("SIGTERM");
  mock.close();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
app.on("exit", (code) => {
  mock.close();
  rmSync(directory, { recursive: true, force: true });
  process.exit(code ?? 0);
});
