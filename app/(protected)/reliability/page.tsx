import { requireSession } from "@/lib/auth/session";
import { PageHeading } from "@/components/ui";
import { LatencyChart } from "@/components/latency-chart";
export const metadata = { title: "Reliability" };
export default async function ReliabilityPage() {
  await requireSession();
  return (
    <main id="app" tabIndex={-1}>
      <PageHeading title="Reliability">
        Monitoring data is not connected. Missing measurements do not establish
        service health.
      </PageHeading>
      <div className="ch in">
        {["API requests", "API latency", "API errors", "Lambda execution"].map(
          (label) => (
            <div key={label}>
              <small>{label}</small>
              <b aria-label="Unavailable">—</b>
              <p>Metrics unavailable</p>
            </div>
          ),
        )}
      </div>
      <section className="sec">
        <h2>Latency</h2>
        <LatencyChart />
        <p className="dim">
          Measurement period and last-updated time unavailable. No latency
          samples have been retrieved.
        </p>
      </section>
      <section className="sec">
        <h2>Monitored alarms</h2>
        <div className="pane">
          <p>Health unavailable</p>
          <p className="dim">
            Alarm states have not been retrieved. No availability percentage or
            service-impact count is calculated.
          </p>
        </div>
      </section>
      <section className="sec cols">
        <div>
          <h2>Deployments</h2>
          <p className="dim">Deployment history not connected.</p>
        </div>
        <div>
          <h2>Operational alerts</h2>
          <p className="dim">Alert history not connected.</p>
        </div>
      </section>
    </main>
  );
}
