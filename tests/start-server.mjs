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
      OPERATIONS_API_ORIGIN:
        process.env.AGENTSHIELD_TEST_OPERATIONS === "true"
          ? "https://testoperations.execute-api.ap-southeast-2.amazonaws.com"
          : "",
      DOCUMENTS_READ_API_ORIGIN: "",
      MONITORING_API_ORIGIN:
        process.env.AGENTSHIELD_TEST_REMOTE_MONITORING === "true"
          ? "https://testmonitoring.execute-api.ap-southeast-2.amazonaws.com"
          : "",
      AWS_ACCESS_KEY_ID: "CI_ONLY_ACCESS_KEY",
      AWS_SECRET_ACCESS_KEY: "CI_ONLY_SECRET",
      AWS_SESSION_TOKEN: "CI_ONLY_TEMPORARY_TOKEN",
      AWS_EC2_METADATA_DISABLED: "true",
      MONITORING_ALLOWED_SUBS: ["chromium", "firefox", "webkit", "mobile"]
        .map((name) => `subject-monitoring-${name}@example.test`)
        .join(","),
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
