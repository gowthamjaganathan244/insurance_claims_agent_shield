"use client";
import { MonitoringChart } from "./monitoring-chart";
import { useMonitoring } from "./monitoring-provider";
import { ClaimTime } from "./live-claim-panel";
import { DataState, Kpis } from "./ui";
import { alarmHealth, metricGaps } from "@/lib/monitoring/health";
export function ReliabilityMonitoring() {
  const { data, error, loading, refresh } = useMonitoring();
  return (
    <>
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
        <div className="pane">
          <p>Metrics unavailable</p>
          <p className="dim">
            No monitoring results are available. Missing data is not evidence of
            healthy services.
          </p>
        </div>
      )}
      {data && (
        <>
          <Kpis
            items={[
              {
                label: "Monitored alarms",
                value: data.health,
                tone: alarmHealth(data.alarms).tone,
              },
              ...(["api_count", "api_error_rate", "api_latency"] as const).map(
                (id) => {
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
                },
              ),
            ]}
          />
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
          <section className="sec">
            <h2>Monitored alarms</h2>
            <p>{data.health}</p>
            {metricGaps(data.metrics).length > 0 && (
              <p className="dim">
                {metricGaps(data.metrics).length} of {data.metrics.length}{" "}
                metric series returned no complete data in this one-hour
                window. API Gateway and Lambda publish datapoints only when they
                are called, so an empty but successful query means no recorded
                activity in the window, not a fault; a broken integration shows
                as an error above instead. Missing data is never shown as zero
                and does not change the alarm status.
              </p>
            )}
            {data.alarms.map((alarm) => (
              <div className="row" key={alarm.name}>
                <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                  <b>{alarm.name}</b>
                  <div className="s">
                    {alarm.updatedAt ? (
                      <>
                        State updated: <ClaimTime value={alarm.updatedAt} />
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
          <section className="sec">
            <h2>API and Lambda measurements</h2>
            <div className="ch in">
              {data.metrics.map((metric) => {
                const latest = metric.points.at(-1);
                return (
                  <div
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
                  </div>
                );
              })}
            </div>
          </section>
          <section className="sec">
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
    </>
  );
}
