import type { MonitoringData } from "./types";
type Alarm = MonitoringData["alarms"][number];
/**
 * Scoped status derived only from the configured CloudWatch alarm records.
 * Metric series with no datapoints (e.g. an idle Lambda) are reported
 * separately and never change the alarm status. This is not overall
 * platform health.
 */
export function alarmHealth(alarms: Alarm[], expected = 3) {
  const count = (state: Alarm["state"]) =>
    alarms.filter((a) => a.state === state).length;
  const plural = (n: number) => (n === 1 ? "" : "s");
  const triggered = count("ALARM");
  const insufficient = count("INSUFFICIENT_DATA");
  const missing = count("UNAVAILABLE") + Math.max(0, expected - alarms.length);
  if (triggered)
    return {
      label: `${triggered} monitored alarm${plural(triggered)} triggered`,
      tone: "bad" as const,
    };
  if (insufficient)
    return {
      label: `${insufficient} alarm${plural(insufficient)}: insufficient data`,
      tone: "warn" as const,
    };
  if (missing || !alarms.length)
    return {
      label: `${missing || expected} alarm status${missing === 1 ? "" : "es"} unavailable`,
      tone: "warn" as const,
    };
  return { label: "Monitored alarms OK", tone: "ok" as const };
}
/** Metric series that returned no datapoints or an incomplete result. */
export function metricGaps(metrics: MonitoringData["metrics"]) {
  return metrics.filter((m) => !m.complete || !m.points.length);
}
export type HealthDotStatus = "ok" | "loading" | "bad" | "unknown";
/**
 * Navbar indicator state. Green only when every configured alarm record is
 * present and OK; any missing/insufficient alarm evidence stays neutral.
 */
export function healthDotStatus({
  allowed,
  loading,
  error,
  data,
}: {
  allowed: boolean;
  loading: boolean;
  error: string;
  data: MonitoringData | null;
}): HealthDotStatus {
  if (!allowed) return "unknown";
  if (loading) return "loading";
  if (error) return "bad";
  if (!data) return "unknown";
  if (data.alarms.some((a) => a.state === "ALARM")) return "bad";
  return alarmHealth(data.alarms).tone === "ok" ? "ok" : "unknown";
}
