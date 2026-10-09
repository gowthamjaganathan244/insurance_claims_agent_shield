import Link from "next/link";
import { incidents } from "@/lib/data";
import { PageHeading } from "@/components/ui";
export const metadata = { title: "Security" };
export default function SecurityPage() {
  return (
    <main id="app" tabIndex={-1}>
      <PageHeading title="Security">
        Incidents, in the context of the claims they affect. Select one to
        investigate.
      </PageHeading>
      {incidents.map((incident) => (
        <details className="inc" id={incident.id} key={incident.id}>
          <summary className="row incident-summary">
            <div>
              <div className="t">
                <i
                  className={`dot ${incident.c}`}
                  style={{ marginRight: 10 }}
                  aria-hidden="true"
                />
                {incident.t}
              </div>
              <div className="s">
                {incident.id}, {incident.claim}, {incident.when}
              </div>
            </div>
            <span className="incident-tags">
              <span className={`tag ${incident.c}`}>{incident.sev}</span>
              <span className="tag">{incident.st}</span>
            </span>
          </summary>
          <div className="ib">
            <div>
              <h3 style={{ marginBottom: 12 }}>AgentShield investigation</h3>
              <p className="lede" style={{ margin: 0, fontSize: 17 }}>
                {incident.ai}
              </p>
              <dl className="kv">
                <dt>Detection source</dt>
                <dd>{incident.src}</dd>
                <dt>Affected claim</dt>
                <dd>
                  {incident.claim.startsWith("CLM") ? (
                    <Link
                      prefetch={false}
                      className="tag acc"
                      href={`/claim/${incident.claim}`}
                    >
                      {incident.claim}
                    </Link>
                  ) : (
                    incident.claim
                  )}
                </dd>
                <dt>Business process</dt>
                <dd>{incident.proc}</dd>
                <dt>Root cause</dt>
                <dd>{incident.root}</dd>
              </dl>
            </div>
            <div>
              <h3 style={{ marginBottom: 12 }}>Evidence</h3>
              <ul
                className="dim"
                style={{ margin: "0 0 22px", paddingLeft: 18 }}
              >
                {incident.ev.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <h3 style={{ marginBottom: 8 }}>Recommended remediation</h3>
              <p className="dim" style={{ margin: 0 }}>
                {incident.fix}
              </p>
              <dl className="kv">
                <dt>Human approval</dt>
                <dd>{incident.ap}</dd>
              </dl>
              <ul className="tl" style={{ marginTop: 22 }}>
                {incident.tl.map(([time, description]) => (
                  <li key={description}>
                    <b className="sm">{description}</b>
                    <small>{time} AEST</small>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      ))}
    </main>
  );
}
