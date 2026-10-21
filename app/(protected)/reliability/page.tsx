import { requireSession } from "@/lib/auth/session";
import { PageHeading, Numbers } from "@/components/ui";
import { LatencyChart } from "@/components/latency-chart";
import { deployments, alerts } from "@/lib/data";
import { seed } from "@/lib/claims";
import type { Style } from "@/lib/types";
export const metadata = { title: "Reliability" };
export default async function ReliabilityPage() {
  await requireSession();
  return (
    <main id="app" tabIndex={-1}>
      <PageHeading title="Reliability">
        Technical problems, traced to the claims they touch. 99.97% availability
        over 30 days against a 99.9% target.
      </PageHeading>
      <div className="ch in">
        {[
          ["Technical event", "1.42s", "P99 on /claims/submit, up 38%", "warn"],
          [
            "Affected service",
            "claims-api",
            "Degraded since v2.41.0 fan-out change",
            "warn",
          ],
          [
            "Affected claims",
            "146",
            "claims delayed, 23 payment submissions retrying",
            "acc",
          ],
          [
            "Business impact",
            "0",
            "claims lost. Median settlement +11 min",
            "ok",
          ],
        ].map(([label, value, detail, tone], index) => (
          <div
            key={label}
            style={{ "--i": index, "--c": `var(--${tone})` } as Style}
          >
            <small>{label}</small>
            <b>{value}</b>
            <p>{detail}</p>
          </div>
        ))}
      </div>
      <section className="sec">
        <Numbers
          items={[
            ["99.97%", "availability"],
            ["0.31%", "error rate"],
            ["82ms", "P50"],
            ["241ms", "P95"],
            ["1,420ms", "P99 now"],
          ]}
        />
        <LatencyChart />
        <p className="lede" style={{ fontSize: 15 }}>
          Drag across the chart for exact values.{" "}
          <span style={{ color: "var(--ok)" }}>P50</span>,{" "}
          <span style={{ color: "var(--acc)" }}>P95</span>,{" "}
          <span style={{ color: "var(--warn)" }}>P99</span>.
        </p>
      </section>
      <section className="sec">
        <h2 style={{ fontSize: 32, marginBottom: 12 }}>
          Services and the claims they affect
        </h2>
        {[
          ["claims-api", "146 claims delayed"],
          ["scan-worker", "9 claims waiting in quarantine"],
          ["notify-svc", "No claims affected"],
          ["document-store", "No claims affected"],
          ["investigation-agent", "No claims affected"],
        ].map(([name, impact], index) => {
          const random = seed(31 * (index + 1));
          return (
            <div key={name} style={{ marginTop: 22 }}>
              <div className="service-heading">
                <b>{name}</b>
                <span className="dim">{impact}</span>
              </div>
              <div className="strip" aria-hidden="true">
                {Array.from({ length: 48 }, (_, sample) => (
                  <i
                    key={sample}
                    className={
                      index < 2 && sample > 43
                        ? "b"
                        : random() > 0.96
                          ? "w"
                          : ""
                    }
                  />
                ))}
              </div>
            </div>
          );
        })}
      </section>
      <section className="sec cols">
        <div>
          <h2 style={{ fontSize: 32, marginBottom: 24 }}>Deployments</h2>
          <ul className="tl">
            {deployments.map((item) => (
              <li key={item[0]} className={item[4]}>
                <b>
                  {item[1]} {item[0]}
                </b>
                <small>
                  {item[2]}, {item[3]}. {item[5]}
                </small>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 style={{ fontSize: 32, marginBottom: 24 }}>Operational alerts</h2>
          <ul className="tl">
            {alerts.map((item) => (
              <li key={item[1]} className={item[0]}>
                <b>{item[1]}</b>
                <small>{item[2]}</small>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
