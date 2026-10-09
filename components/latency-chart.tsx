"use client";
import { useState } from "react";
import { seed } from "@/lib/claims";
const random = seed(7);
const series = [
  ["P50", "ok", 70, 12, 90],
  ["P95", "acc", 190, 34, 260],
  ["P99", "warn", 430, 90, 1500],
] as const;
const data = series.map(([label, color, base, spread, cap]) => ({
  label,
  color,
  values: Array.from({ length: 48 }, (_, index) =>
    Math.round(
      Math.min(
        cap,
        base +
          Math.sin(index / 5) * spread * 0.6 +
          random() * spread +
          (index > 40 && label === "P99" ? 125 * (index - 40) : 0),
      ),
    ),
  ),
}));
export function LatencyChart() {
  const [point, setPoint] = useState<number | null>(null);
  return (
    <>
      <div
        className="chart"
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          setPoint(
            Math.max(
              0,
              Math.min(
                47,
                Math.round(((event.clientX - bounds.left) / bounds.width) * 47),
              ),
            ),
          );
        }}
        onPointerLeave={() => setPoint(null)}
      >
        <svg
          viewBox="0 0 800 230"
          role="img"
          aria-label="Latency over the last 24 hours for P50, P95 and P99. P99 rises sharply in the last 7 samples."
        >
          {[0, 1, 2, 3].map((index) => (
            <line
              key={index}
              x1="0"
              x2="800"
              y1={8 + (214 * index) / 3}
              y2={8 + (214 * index) / 3}
              stroke="var(--line)"
            />
          ))}
          {data.map((series) => (
            <path
              key={series.label}
              pathLength="1"
              d={series.values
                .map(
                  (value, index) =>
                    `${index ? "L" : "M"}${((index / 47) * 800).toFixed(1)} ${(222 - (value / 1600) * 214).toFixed(1)}`,
                )
                .join("")}
              stroke={`var(--${series.color})`}
            />
          ))}
          {point !== null && (
            <line
              x1={(point / 47) * 800}
              x2={(point / 47) * 800}
              y1="0"
              y2="230"
              stroke="var(--mut)"
            />
          )}
        </svg>
        {point !== null && (
          <div
            className="tip"
            style={{
              opacity: 1,
              left: `clamp(70px, ${(point / 47) * 100}%, calc(100% - 70px))`,
            }}
          >
            <div className="dim">
              {String(Math.floor(point / 2)).padStart(2, "0")}:
              {point % 2 ? "30" : "00"}
            </div>
            {data.map((series) => (
              <div key={series.label}>
                <span style={{ color: `var(--${series.color})` }}>
                  {series.label}
                </span>{" "}
                {series.values[point]} ms
              </div>
            ))}
          </div>
        )}
      </div>
      <label className="chart-control">
        <span className="sr-only">Inspect latency sample</span>
        <input
          aria-label="Inspect latency sample"
          type="range"
          min="0"
          max="47"
          value={point ?? 47}
          onChange={(event) => setPoint(Number(event.target.value))}
          aria-valuetext={data
            .map(
              (series) =>
                `${series.label}: ${series.values[point ?? 47]} milliseconds`,
            )
            .join(", ")}
        />
      </label>
    </>
  );
}
