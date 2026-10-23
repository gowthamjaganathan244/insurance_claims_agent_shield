// Isolated CI transport for the AWS-hosted monitoring endpoint. Mirrors its contract:
// JWT required, operator-only, real-shaped CloudWatch payload.
let calls = 0;
export function remoteMonitoringCalls() {
  return calls;
}
export async function mockRemoteMonitoring(url, init) {
  const token = new Headers(init?.headers).get("Authorization")?.split(" ")[1];
  if (!token || url.pathname !== "/monitoring")
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const sub = JSON.parse(Buffer.from(token.split(".")[1], "base64url")).sub;
  if (!sub.includes("monitoring-"))
    return Response.json(
      { error: "Operator access required" },
      { status: 403 },
    );
  calls += 1;
  const end = new Date(Math.floor(Date.now() / 300000) * 300000);
  const start = new Date(end.getTime() - 3600000);
  const at = new Date(end.getTime() - 600000).toISOString();
  const ids = ["api_count", "api_latency", "api_5xx"];
  for (const i of [0, 1])
    ids.push(
      `lambda_${i}_invocations`,
      `lambda_${i}_errors`,
      `lambda_${i}_duration`,
    );
  const values = { api_count: 50, api_5xx: 5 };
  // "idle" mirrors live CloudWatch: an uninvoked function returns a Complete
  // result with no datapoints, and the deployed Lambda's summary string says
  // "Health unavailable". The app must derive status from alarms alone.
  const idle = sub.includes("monitoring-idle-");
  const metrics = ids.map((id) => ({
    id,
    label: `remote ${id}`,
    unit: "Count",
    complete: true,
    points:
      idle && id.startsWith("lambda_1_")
        ? []
        : [{ at, value: values[id] ?? 1 }],
  }));
  metrics.push({
    id: "api_error_rate",
    label: "API server error rate (matched periods)",
    unit: "Percent",
    complete: true,
    points: [{ at, value: 10 }],
  });
  return Response.json({
    fetchedAt: new Date().toISOString(),
    start: start.toISOString(),
    end: end.toISOString(),
    periodSeconds: 300,
    alarms: [
      { name: "AgentShield-API-Errors", state: "OK", updatedAt: at },
      {
        name: "AgentShield-Lambda-Errors",
        state: idle ? "OK" : "ALARM",
        updatedAt: at,
      },
      { name: "AgentShield-Lambda-Latency", state: "OK", updatedAt: at },
    ],
    metrics,
    health: idle ? "Health unavailable" : "1 monitored alarm triggered",
  });
}
