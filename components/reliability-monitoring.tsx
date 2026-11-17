"use client";
import { useState } from "react";
import { MonitoringChart } from "./monitoring-chart";
import { useMonitoring } from "./monitoring-provider";
import { ClaimTime } from "./live-claim-panel";
import { DataState, Kpis } from "./ui";
import { alarmHealth, metricGaps } from "@/lib/monitoring/health";
const definition = (id: string) =>
  id === "api_error_rate"
    ? "API 5xx responses divided by request count for matching five-minute periods with at least one request."
    : id === "api_count"
      ? "Sum of API Gateway requests in each five-minute period."
      : id === "api_latency"
        ? "Average API Gateway latency in each five-minute period."
        : id === "api_5xx"
          ? "Sum of API Gateway 5xx responses in each five-minute period."
          : id.endsWith("_duration")
            ? "Average Lambda execution duration in each five-minute period."
            : id.endsWith("_errors")
              ? "Sum of Lambda errors in each five-minute period."
              : "Sum of Lambda invocations in each five-minute period.";
const source = (id: string) =>
  id.startsWith("api_")
    ? "API Gateway"
    : id.startsWith("lambda_0_")
      ? "Claims API Lambda"
      : "Malware processor Lambda";
const alarmAge = (updatedAt: string, fetchedAt: string) => {
  const minutes = Math.max(
    0,
    Math.floor((Date.parse(fetchedAt) - Date.parse(updatedAt)) / 60000),
  );
  return Number.isFinite(minutes)
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m before retrieval`
    : "age unavailable";
};
export function ReliabilityMonitoring() {
  const { data, error, loading, refresh } = useMonitoring();
  const [selectedId, setSelectedId] = useState("");
  const [rangeMinutes, setRangeMinutes] = useState(60);
  const selected =
    data?.metrics.find((metric) => metric.id === selectedId) ??
    data?.metrics[0];
  const rangeStart = data
    ? new Date(
        Math.max(
          Date.parse(data.start),
          Date.parse(data.end) - rangeMinutes * 60000,
        ),
      ).toISOString()
    : "";
  const inspected = selected
    ? {
        ...selected,
        points: selected.points.filter((point) => point.at >= rangeStart),
      }
    : null;
  return (
    <div className="telemetry-workspace">
      <div className="telemetry-header">
        <div>
          <span>TELEMETRY WALL / OBSERVED DATA</span>
          <strong>
            {data
              ? alarmHealth(data.alarms).label
              : loading
                ? "Retrieving monitored alarms"
                : "Monitoring unavailable"}
          </strong>
        </div>
        <small>WINDOW / LAST HOUR · SAMPLE / 5 MINUTES</small>
      </div>
      <div className="acts">
        <button
          className="btn"
          disabled={loading}
          onClick={() => void refresh()}
        >
          Refresh monitoring
        </button>
      </div>
      <DataState
        loading={loading && !data}
        error={error}
        loadingText="Loading monitoring…"
      />
      {!data && (
        <div className="pane telemetry-unavailable">
          <p>Metrics unavailable</p>
          <p className="dim">
            No monitoring results are available. Missing data is not evidence of
            healthy services.
          </p>
        </div>
      )}
      {data && (
        <>
          <div className="telemetry-cluster">
            <p className="telemetry-index">01 / SERVICE HEALTH</p>
            <h2>Instrument cluster</h2>
            <Kpis
              items={[
                {
                  label: "Monitored alarms",
                  value: data.health,
                  tone: alarmHealth(data.alarms).tone,
                },
                ...(
                  ["api_count", "api_error_rate", "api_latency"] as const
                ).map((id) => {
                  const metric = data.metrics.find((m) => m.id === id);
                  const latest = metric?.points.at(-1);
                  return {
                    label: metric?.label ?? id,
                    value:
                      metric?.complete && latest
                        ? `${latest.value.toLocaleString("en-AU", { maximumFractionDigits: 2 })}${metric.unit === "Percent" ? "%" : metric.unit === "Milliseconds" ? " ms" : ""}`
                        : null,
                    hint: "Latest returned period",
                  };
                }),
              ]}
            />
          </div>
          <p className="dim">
            Last retrieved: <ClaimTime value={data.fetchedAt} />. Cache: up to
            60 seconds.
          </p>
          <p className="dim">
            Window: <ClaimTime value={data.start} /> –{" "}
            <ClaimTime value={data.end} />. Period: {data.periodSeconds}{" "}
            seconds. Values below are the latest returned period, not uptime or
            hourly totals.
          </p>
          <section className="sec telemetry-alarms">
            <p className="telemetry-index">02 / ALARM CONTROL</p>
            <h2>Monitored alarms</h2>
            <p>{data.health}</p>
            {metricGaps(data.metrics).length > 0 && (
              <p className="dim">
                {metricGaps(data.metrics).length} of {data.metrics.length}{" "}
                metric series returned no complete data in this one-hour window.
                API Gateway and Lambda publish datapoints only when they are
                called, so an empty but successful query means no recorded
                activity in the window, not a fault; a broken integration shows
                as an error above instead. Missing data is never shown as zero
                and does not change the alarm status.
              </p>
            )}
            {data.alarms.map((alarm) => (
              <div className="row telemetry-alarm" key={alarm.name}>
                <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                  <b>{alarm.name}</b>
                  <div className="s">
                    {alarm.updatedAt ? (
                      <>
                        State last changed:{" "}
                        <ClaimTime value={alarm.updatedAt} />
                        {" · "}
                        {alarmAge(alarm.updatedAt, data.fetchedAt)}
                      </>
                    ) : (
                      "State timestamp unavailable"
                    )}
                  </div>
                </div>
                <span
                  className={`tag ${alarm.state === "ALARM" ? "bad" : alarm.state === "OK" ? "ok" : "warn"}`}
                >
                  {alarm.state}
                </span>
              </div>
            ))}
          </section>
          <section className="sec telemetry-metrics">
            <p className="telemetry-index">03 / LIVE MEASUREMENTS</p>
            <h2>API and Lambda measurements</h2>
            <div className="ch in">
              {data.metrics.map((metric) => {
                const latest = metric.points.at(-1);
                return (
                  <button
                    type="button"
                    className="telemetry-metric"
                    aria-pressed={selected?.id === metric.id}
                    onClick={() => setSelectedId(metric.id)}
                    key={metric.id}
                    style={{ minWidth: 0, overflowWrap: "anywhere" }}
                  >
                    <small>{metric.label}</small>
                    <b>
                      {metric.complete && latest
                        ? latest.value.toLocaleString("en-AU", {
                            maximumFractionDigits: 2,
                          })
                        : "—"}
                    </b>
                    <p>
                      {metric.complete && latest
                        ? metric.unit
                        : "Metrics unavailable"}
                    </p>
                    {latest && (
                      <small>
                        Sample: <ClaimTime value={latest.at} />
                      </small>
                    )}
                    {!metric.complete && <p>Incomplete CloudWatch response</p>}
                  </button>
                );
              })}
            </div>
            {selected && inspected && (
              <div className="telemetry-inspector" aria-live="polite">
                <div className="telemetry-inspector-head">
                  <div>
                    <span>SELECTED SIGNAL / {source(selected.id)}</span>
                    <h3>{selected.label}</h3>
                  </div>
                  <span>
                    {selected.complete
                      ? `${selected.points.length} observed sample${selected.points.length === 1 ? "" : "s"}`
                      : "Incomplete CloudWatch response"}
                  </span>
                </div>
                <label className="telemetry-range">
                  View range
                  <select
                    value={rangeMinutes}
                    onChange={(event) =>
                      setRangeMinutes(Number(event.target.value))
                    }
                  >
                    <option value={60}>Full hour</option>
                    <option value={30}>Last 30 minutes</option>
                    <option value={15}>Last 15 minutes</option>
                  </select>
                </label>
                <p>
                  {definition(selected.id)} Missing periods remain gaps; no
                  values are interpolated.
                </p>
                <p>
                  Viewing returned samples: <ClaimTime value={rangeStart} /> –{" "}
                  <ClaimTime value={data.end} /> · {data.periodSeconds / 60}
                  -minute periods from the one-hour query.
                </p>
                {inspected.points.length ? (
                  <MonitoringChart
                    metric={inspected}
                    period={data.periodSeconds}
                  />
                ) : (
                  <p>No returned samples in this view range.</p>
                )}
              </div>
            )}
          </section>
          <section className="sec telemetry-diagnostics">
            <p className="telemetry-index">04 / ENGINEERING DIAGNOSTICS</p>
            <h2>Recorded measurement series</h2>
            {data.metrics.map((metric) => (
              <details className="inc" key={metric.id}>
                <summary>
                  {metric.label} · 5-minute{" "}
                  {metric.unit === "Milliseconds" ? "averages" : "periods"}
                </summary>
                <MonitoringChart metric={metric} period={data.periodSeconds} />
                <div className="pane">
                  {!metric.complete || !metric.points.length ? (
                    <p>Metrics unavailable</p>
                  ) : (
                    <ul>
                      {metric.points.map((point) => (
                        <li key={point.at}>
                          <ClaimTime value={point.at} />:{" "}
                          {point.value.toLocaleString("en-AU", {
                            maximumFractionDigits: 2,
                          })}{" "}
                          {metric.unit}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
