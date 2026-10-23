import type { MonitoringData } from "@/lib/monitoring/types";
export function MonitoringChart({
  metric,
  period,
}: {
  metric: MonitoringData["metrics"][number];
  period: number;
}) {
  if (!metric.complete || !metric.points.length)
    return <p>Metrics unavailable</p>;
  const points = metric.points;
  const start = Date.parse(points[0].at),
    end = Date.parse(points.at(-1)!.at);
  const top = Math.max(...points.map((p) => p.value), 1);
  const coords = points.map((p) => ({
    x:
      48 +
      ((Date.parse(p.at) - start) / Math.max(end - start, period * 1000)) * 500,
    y: 174 - (p.value / top) * 140,
  }));
  const path = coords
    .map(
      (p, i) =>
        `${i && Date.parse(points[i].at) - Date.parse(points[i - 1].at) <= period * 1000 ? "L" : "M"}${p.x},${p.y}`,
    )
    .join(" ");
  return (
    <figure className="chart" style={{ height: "auto", minHeight: 220 }}>
      <svg
        role="img"
        aria-label={`${metric.label}: observed ${period}-second periods; gaps are missing data`}
        viewBox="0 0 600 220"
        style={{ width: "100%", height: "auto" }}
      >
        <line
          x1="48"
          y1="174"
          x2="548"
          y2="174"
          stroke="currentColor"
          opacity=".3"
        />
        <text x="4" y="38" fill="currentColor" fontSize="12">
          {top.toFixed(1)}
        </text>
        <text x="20" y="178" fill="currentColor" fontSize="12">
          0
        </text>
        <path d={path} stroke="var(--acc)" fill="none" strokeWidth="2" />
        {coords.map((p, i) => (
          <circle key={points[i].at} cx={p.x} cy={p.y} r="3" fill="var(--acc)">
            <title>
              {points[i].at}: {points[i].value} {metric.unit}
            </title>
          </circle>
        ))}
        <text x="48" y="205" fill="currentColor" fontSize="12">
          {new Date(start).toISOString().slice(11, 16)} UTC
        </text>
        <text
          x="548"
          y="205"
          textAnchor="end"
          fill="currentColor"
          fontSize="12"
        >
          {new Date(end).toISOString().slice(11, 16)} UTC
        </text>
      </svg>
      <figcaption>
        {metric.label} · {metric.unit} · observed samples only
      </figcaption>
    </figure>
  );
}
