import { requireSession } from "@/lib/auth/session";
import { PageHeading } from "@/components/ui";
export const metadata = { title: "Security" };
export default async function SecurityPage() {
  await requireSession();
  return (
    <main id="app" tabIndex={-1}>
      <PageHeading title="Security">
        Recorded document scan results and quarantine outcomes.
      </PageHeading>
      <details className="inc" open>
        <summary className="row incident-summary">
          <div>
            <div className="t">Security data connection</div>
            <div className="s">
              No document security records have been loaded.
            </div>
          </div>
          <span className="tag">Not connected</span>
        </summary>
        <div className="ib">
          <div>
            <h3>Scan results</h3>
            <p className="lede">Scan evidence unavailable</p>
            <p className="dim">
              The authorised document read service is not connected. This does
              not establish that your documents are clean or that no threats
              exist.
            </p>
          </div>
          <div>
            <h3>Quarantine outcomes</h3>
            <p className="dim">
              No verified quarantine or source-isolation results have been
              loaded.
            </p>
            <h3>Processing configuration</h3>
            <p className="dim">
              The supplied configuration reported GuardDuty scanning active and
              custom event delivery disabled on 21 October 2026. Current
              processing health has not been retrieved.
            </p>
          </div>
        </div>
      </details>
    </main>
  );
}
