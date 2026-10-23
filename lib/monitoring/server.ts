import "server-only";
import {
  CloudWatchClient,
  DescribeAlarmsCommand,
  GetMetricDataCommand,
  type MetricDataQuery,
} from "@aws-sdk/client-cloudwatch";
import { FetchHttpHandler } from "@smithy/fetch-http-handler";
import type { AlarmState, MonitoringData } from "./types";
import { alarmHealth } from "./health";
export const alarmNames = [
  "AgentShield-API-Errors",
  "AgentShield-Lambda-Errors",
  "AgentShield-Lambda-Latency",
];
const client = new CloudWatchClient({
  region: "ap-southeast-2",
  maxAttempts: 2,
  requestHandler: new FetchHttpHandler({ requestTimeout: 10000 }),
});
const period = 300;
const specs = [
  ["api_count", "API requests", "AWS/ApiGateway", "Count", "Sum", "Count", ""],
  [
    "api_latency",
    "API average latency",
    "AWS/ApiGateway",
    "Latency",
    "Average",
    "Milliseconds",
    "",
  ],
  ["api_5xx", "API server errors", "AWS/ApiGateway", "5xx", "Sum", "Count", ""],
  ...["agentshield-claims-api", "agentshield-malware-processor"].flatMap(
    (name, index) => [
      [
        `lambda_${index}_invocations`,
        `${name} invocations`,
        "AWS/Lambda",
        "Invocations",
        "Sum",
        "Count",
        name,
      ],
      [
        `lambda_${index}_errors`,
        `${name} errors`,
        "AWS/Lambda",
        "Errors",
        "Sum",
        "Count",
        name,
      ],
      [
        `lambda_${index}_duration`,
        `${name} average duration`,
        "AWS/Lambda",
        "Duration",
        "Average",
        "Milliseconds",
        name,
      ],
    ],
  ),
];
export function monitoringAllowed(sub: string) {
  return (process.env.MONITORING_ALLOWED_SUBS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(sub);
}
export class MonitoringError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
function safeError(error: unknown): MonitoringError {
  if (error instanceof MonitoringError) return error;
  const name = error instanceof Error ? error.name : "";
  if (
    /CredentialsProviderError|ExpiredToken|InvalidClientTokenId|UnrecognizedClient|TokenRefreshRequired|InvalidSignature|SignatureDoesNotMatch/.test(
      name,
    )
  )
    return new MonitoringError(
      "AWS_CREDENTIALS_UNAVAILABLE",
      "Temporary AWS credentials are missing, invalid or expired. Renew the server's AWS session.",
    );
  if (/AccessDenied|Unauthorized/.test(name))
    return new MonitoringError(
      "AWS_ACCESS_DENIED",
      "The server's AWS role cannot read the configured monitoring data.",
    );
  return new MonitoringError(
    "MONITORING_UNAVAILABLE",
    "CloudWatch is unavailable. Try again shortly.",
  );
}
async function retrieve(): Promise<MonitoringData> {
  try {
    // Use the SDK's default server provider chain; reject long-lived IAM keys.
    const credentials = await client.config.credentials();
    if (!credentials.sessionToken)
      throw new MonitoringError(
        "AWS_CREDENTIALS_UNAVAILABLE",
        "Use temporary AWS role or SSO credentials for server monitoring.",
      );
    const end = new Date(Math.floor(Date.now() / 300000) * 300000);
    const start = new Date(end.getTime() - 3600000);
    const queries: MetricDataQuery[] = specs.map(
      ([id, , namespace, name, stat, , fn]) => ({
        Id: id,
        ReturnData: true,
        MetricStat: {
          Period: period,
          Stat: stat,
          Metric: {
            Namespace: namespace,
            MetricName: name,
            Dimensions: fn
              ? [{ Name: "FunctionName", Value: fn }]
              : [
                  { Name: "ApiId", Value: "b30dloh6e4" },
                  { Name: "Stage", Value: "$default" },
                ],
          },
        },
      }),
    );
    const [alarmOutput, metricOutput] = await Promise.all([
      client.send(
        new DescribeAlarmsCommand({
          AlarmNames: alarmNames,
          AlarmTypes: ["MetricAlarm"],
        }),
      ),
      client.send(
        new GetMetricDataCommand({
          StartTime: start,
          EndTime: end,
          MetricDataQueries: queries,
          ScanBy: "TimestampAscending",
          MaxDatapoints: 1000,
        }),
      ),
    ]);
    const alarms = alarmNames.map((name) => {
      const matches = (alarmOutput.MetricAlarms ?? []).filter(
        (alarm) => alarm.AlarmName === name,
      );
      const alarm = matches.length === 1 ? matches[0] : undefined;
      const state: AlarmState =
        alarm &&
        ["OK", "ALARM", "INSUFFICIENT_DATA"].includes(alarm.StateValue ?? "")
          ? (alarm.StateValue as AlarmState)
          : "UNAVAILABLE";
      return {
        name,
        state,
        updatedAt: alarm?.StateUpdatedTimestamp?.toISOString() ?? null,
      };
    });
    const metrics = specs.map(([id, label, , , , unit]) => {
      const result = metricOutput.MetricDataResults?.find(
        (item) => item.Id === id,
      );
      const points = (result?.Timestamps ?? [])
        .flatMap((at, index) => {
          const value = result?.Values?.[index];
          return typeof value === "number" &&
            Number.isFinite(value) &&
            at >= start &&
            at < end
            ? [{ at: at.toISOString(), value }]
            : [];
        })
        .sort((a, b) => a.at.localeCompare(b.at));
      return {
        id,
        label,
        unit,
        complete: result?.StatusCode === "Complete" && !metricOutput.NextToken,
        points,
      };
    });
    const count = metrics.find((m) => m.id === "api_count")!;
    const errors = metrics.find((m) => m.id === "api_5xx")!;
    metrics.push({
      id: "api_error_rate",
      label: "API server error rate (matched periods)",
      unit: "Percent",
      complete: count.complete && errors.complete,
      points: count.points.flatMap((point) => {
        const error = errors.points.find((item) => item.at === point.at);
        return error && point.value > 0
          ? [{ at: point.at, value: (100 * error.value) / point.value }]
          : [];
      }),
    });
    const health = alarmHealth(alarms).label;
    return {
      fetchedAt: new Date().toISOString(),
      start: start.toISOString(),
      end: end.toISOString(),
      periodSeconds: period,
      alarms,
      metrics,
      health,
    };
  } catch (error) {
    throw safeError(error);
  }
}
let cache:
  | { expires: number; data?: MonitoringData; error?: MonitoringError }
  | undefined;
let pending: Promise<MonitoringData> | undefined;
export function remoteMonitoringConfigured() {
  return Boolean(process.env.MONITORING_API_ORIGIN);
}
function remoteOrigin() {
  const origin = new URL(process.env.MONITORING_API_ORIGIN!);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    !/^[a-z0-9]+\.execute-api\.ap-southeast-2\.amazonaws\.com$/.test(
      origin.hostname,
    )
  )
    throw new MonitoringError(
      "MONITORING_UNAVAILABLE",
      "Monitoring backend configuration is invalid.",
    );
  return origin;
}
const states = ["OK", "ALARM", "INSUFFICIENT_DATA", "UNAVAILABLE"];
const isTime = (v: unknown) =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
function validate(data: unknown): MonitoringData {
  const d = data as MonitoringData;
  const ok =
    d &&
    typeof d === "object" &&
    [d.fetchedAt, d.start, d.end].every(isTime) &&
    d.periodSeconds === period &&
    typeof d.health === "string" &&
    Array.isArray(d.alarms) &&
    d.alarms.length === alarmNames.length &&
    d.alarms.every(
      (a, i) =>
        a.name === alarmNames[i] &&
        states.includes(a.state) &&
        (a.updatedAt === null || isTime(a.updatedAt)),
    ) &&
    Array.isArray(d.metrics) &&
    d.metrics.length === specs.length + 1 &&
    d.metrics.every(
      (m) =>
        typeof m.id === "string" &&
        typeof m.label === "string" &&
        typeof m.unit === "string" &&
        typeof m.complete === "boolean" &&
        Array.isArray(m.points) &&
        m.points.every(
          (p) =>
            isTime(p.at) &&
            typeof p.value === "number" &&
            Number.isFinite(p.value),
        ),
    );
  if (!ok)
    throw new MonitoringError(
      "MONITORING_UNAVAILABLE",
      "Monitoring returned incomplete data.",
    );
  return {
    fetchedAt: d.fetchedAt,
    start: d.start,
    end: d.end,
    periodSeconds: d.periodSeconds,
    // Recompute from validated alarm records; never trust a remote summary string.
    health: alarmHealth(d.alarms).label,
    alarms: d.alarms.map(({ name, state, updatedAt }) => ({
      name,
      state,
      updatedAt,
    })),
    metrics: d.metrics.map(({ id, label, unit, complete, points }) => ({
      id,
      label,
      unit,
      complete,
      points: points.map(({ at, value }) => ({ at, value })),
    })),
  };
}
// The AWS endpoint authorises every request (Cognito JWT + operator list), so
// results are cached per user, never shared across accounts.
const remoteCache = new Map<
  string,
  { expires: number; data?: MonitoringData; error?: MonitoringError }
>();
export async function readRemoteMonitoring(sub: string, accessToken: string) {
  const hit = remoteCache.get(sub);
  if (hit && hit.expires > Date.now()) {
    if (hit.error) throw hit.error;
    return hit.data!;
  }
  try {
    const response = await fetch(new URL("/monitoring", remoteOrigin()), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (response.status === 401 || response.status === 403)
      throw new MonitoringError(
        "MONITORING_FORBIDDEN",
        "Monitoring access is not granted for this account.",
      );
    const raw = await response.text();
    if (raw.length > 262144)
      throw new MonitoringError(
        "MONITORING_UNAVAILABLE",
        "Monitoring response is too large.",
      );
    if (!response.ok) {
      const code = (() => {
        try {
          return JSON.parse(raw).code;
        } catch {
          return undefined;
        }
      })();
      throw code === "AWS_ACCESS_DENIED"
        ? new MonitoringError(
            "AWS_ACCESS_DENIED",
            "The monitoring role cannot read the configured monitoring data.",
          )
        : new MonitoringError(
            "MONITORING_UNAVAILABLE",
            "CloudWatch is unavailable. Try again shortly.",
          );
    }
    const data = validate(JSON.parse(raw));
    remoteCache.set(sub, { expires: Date.now() + 60000, data });
    return data;
  } catch (error) {
    const safe =
      error instanceof MonitoringError
        ? error
        : new MonitoringError(
            "MONITORING_UNAVAILABLE",
            "Monitoring service unavailable. Try again shortly.",
          );
    if (safe.code !== "MONITORING_FORBIDDEN")
      remoteCache.set(sub, { expires: Date.now() + 10000, error: safe });
    throw safe;
  }
}
export async function readMonitoring() {
  if (cache && cache.expires > Date.now()) {
    if (cache.error) throw cache.error;
    return cache.data!;
  }
  if (!pending)
    pending = retrieve()
      .then(
        (data) => {
          cache = { expires: Date.now() + 60000, data };
          return data;
        },
        (error) => {
          cache = { expires: Date.now() + 10000, error };
          throw error;
        },
      )
      .finally(() => {
        pending = undefined;
      });
  return pending;
}
