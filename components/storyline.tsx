import type { ClaimEvent, Style } from "@/lib/types";
export function Storyline({ events }: { events: ClaimEvent[] }) {
  const points = events.map((_, index) => [
    48 + 22 * Math.sin(1.25 * index),
    39 + 78 * index,
  ]);
  const path = points.reduce(
    (result, [x, y], index) =>
      index
        ? `${result}C${points[index - 1][0]} ${(points[index - 1][1] + y) / 2} ${x} ${(points[index - 1][1] + y) / 2} ${x} ${y}`
        : `M${x} ${y}`,
    "",
  );
  return (
    <div className="sv in">
      <svg
        preserveAspectRatio="none"
        width="96"
        height={78 * events.length}
        viewBox={`0 0 96 ${78 * events.length}`}
        aria-hidden="true"
      >
        <path className="p0" d={path} />
        <path className="p1" pathLength="1" d={path} />
        {events.map((event, index) => (
          <g
            key={index}
            className={`nd ${index === events.length - 1 ? "last" : ""}`}
            style={{ "--i": index } as Style}
          >
            <circle
              className="halo"
              cx={points[index][0]}
              cy={points[index][1]}
              r="13"
              fill={`var(--${event[3]})`}
            />
            <circle
              cx={points[index][0]}
              cy={points[index][1]}
              r="6"
              fill="var(--bg)"
              stroke={`var(--${event[3]})`}
              strokeWidth="2"
            />
          </g>
        ))}
      </svg>
      <ol>
        {events.map((event, index) => (
          <li
            key={index}
            className={event[3]}
            style={{ "--i": index } as Style}
          >
            <div>
              <time>{event[0]}</time>
              <b>{event[1]}</b>
            </div>
            <small>{event[2]}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}
