import { createServer } from "node:http";
// Minimal Upstash-compatible Redis REST stand-in for the session store tests.
// Implements only the commands lib/auth/store.ts sends, with real TTL semantics.
export function startMockRedis(port, token) {
  const data = new Map(); // key -> { value, expires (ms) }
  const live = (key) => {
    const entry = data.get(key);
    if (entry && entry.expires <= Date.now()) data.delete(key);
    return data.get(key);
  };
  function run([command, ...args]) {
    switch (String(command).toUpperCase()) {
      case "GET":
        return live(args[0])?.value ?? null;
      case "GETDEL": {
        const value = live(args[0])?.value ?? null;
        data.delete(args[0]);
        return value;
      }
      case "DEL":
        return data.delete(args[0]) ? 1 : 0;
      case "SET": {
        const [key, value, ...options] = args;
        const flags = options.map((o) => String(o).toUpperCase());
        const exists = !!live(key);
        if (flags.includes("NX") && exists) return null;
        if (flags.includes("XX") && !exists) return null;
        let expires = Infinity;
        const at = flags.indexOf("EXAT");
        if (at >= 0) expires = Number(options[at + 1]) * 1000;
        const ex = flags.indexOf("EX");
        if (ex >= 0) expires = Date.now() + Number(options[ex + 1]) * 1000;
        data.set(key, { value: String(value), expires });
        return "OK";
      }
      case "EVAL": {
        const [script, , key, arg] = args;
        if (script.includes("INCR")) {
          const entry = live(key);
          const count = Number(entry?.value ?? 0) + 1;
          data.set(key, {
            value: String(count),
            expires: entry ? entry.expires : Date.now() + Number(arg) * 1000,
          });
          return count;
        }
        if (live(key)?.value === String(arg)) {
          data.delete(key);
          return 1;
        }
        return 0;
      }
      default:
        throw new Error(`Unsupported command ${command}`);
    }
  }
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      response.setHeader("Content-Type", "application/json");
      if (request.headers.authorization !== `Bearer ${token}`) {
        response.statusCode = 401;
        return response.end(JSON.stringify({ error: "Unauthorized" }));
      }
      try {
        response.end(JSON.stringify({ result: run(JSON.parse(body)) }));
      } catch (error) {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: String(error) }));
      }
    });
  });
  server.listen(port, "127.0.0.1");
  return {
    // Test hooks matching the SQLite ones in start-server.mjs.
    expire: (key) => data.delete(key),
    tamper: (key) =>
      data.has(key) && (data.get(key).value = "invalid-ciphertext"),
    close: () => server.close(),
  };
}
