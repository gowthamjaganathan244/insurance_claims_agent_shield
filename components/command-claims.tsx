"use client";
import Link from "next/link";
import {
  loadCommandSnapshot,
  type CommandSnapshot,
} from "@/lib/command-snapshot";
import { useLiveClaims } from "./use-live-claims";
import { ClaimTime } from "./live-claim-panel";
import { useMonitoring } from "./monitoring-provider";
import { alarmHealth } from "@/lib/monitoring/health";
import { Kpis, PageHeading, Pill } from "./ui";

type Backend = "documents" | "operations" | "monitoring";
const useCases: {
  title: string;
  text: string;
  href: string;
  backend: Backend;
}[] = [
  {
    title: "Malware scanning and quarantine",
    text: "GuardDuty scan results, document status and quarantine evidence.",
    href: "/security",
    backend: "documents",
  },
  {
    title: "Email modernisation and delivery",
    text: "Stored SES template review and persisted delivery history.",
    href: "/communications",
    backend: "operations",
  },
  {
    title: "API performance and scalability",
    text: "API Gateway and Lambda latency, volume and error measurements.",
    href: "/reliability",
    backend: "monitoring",
  },
  {
    title: "Security incident investigation",
    text: "Per-claim document findings, isolation timestamps and audit trail.",
    href: "/security",
    backend: "documents",
  },
  {
    title: "Release reliability",
    text: "CloudWatch alarm states and error rates for the claims service.",
    href: "/reliability",
    backend: "monitoring",
  },
];
export function CommandClaims({
  backends,
}: {
  backends: Record<Backend, boolean>;
}) {
  const { data, error, loading, updated, refresh } =
    useLiveClaims<CommandSnapshot>("/api/claims", loadCommandSnapshot, 60000);
  const counts = new Map<string, number>();
  for (const claim of data?.claims ?? [])
    counts.set(claim.status, (counts.get(claim.status) ?? 0) + 1);

  const monitoring = useMonitoring();
  const statuses = [...counts].sort((a, b) => b[1] - a[1]);
  return (
    <>
      <section className="hero overview-head">
        <PageHeading
          title="Overview"
          actions={
            <>
              <button
                className="btn"
                disabled={loading}
                onClick={() => void refresh()}
              >
                Refresh
              </button>
              <Link prefetch={false} className="btn ok" href="/claims">
                Open claims
              </Link>
            </>
          }
        >
          Your claims, monitored alarms and the AgentShield workflows, from live
          records only.
        </PageHeading>
        <div aria-label="Recorded claim status counts" aria-busy={loading}>
          <Kpis
            items={[
              {
                label: data?.complete ? "Your claims" : "Loaded claims",
                value: data ? data.claims.length : loading ? "…" : null,
                hint: data
                  ? `${data.pages} page${data.pages === 1 ? "" : "s"} read`
                  : undefined,
              },
              ...statuses.slice(0, 2).map(([status, count]) => ({
                label: status,
                value: count,
                hint: "Recorded status",
              })),
              {
                label: "Monitored alarms",
                value: monitoring.data
                  ? monitoring.data.health
                  : monitoring.loading
                    ? "…"
                    : null,
                tone: monitoring.data
                  ? alarmHealth(monitoring.data.alarms).tone
                  : undefined,
                hint: (
                  <Link prefetch={false} href="/reliability">
                    Reliability
                  </Link>
                ),
              },
            ]}
          />
        </div>
        <p className="cap">
          {data?.complete
            ? "All pages returned for your signed-in user were read."
            : data
              ? "Partial counts: the 10-page refresh limit was reached. More records may exist."
              : "Claim counts are unavailable until retrieval succeeds."}{" "}
          Counts are scoped to your user, not AWS account-wide totals.
        </p>
      </section>
      <section className="sec" aria-labelledby="recent-claims-heading">
        <div className="sec-h">
          <h2 id="recent-claims-heading">Recent claims</h2>
          <p className="dim">
            Newest first. Status counts include every page read in this refresh.
          </p>
        </div>
        <p className="dim sm" role="status">
          {loading
            ? "Loading recent claims…"
            : data
              ? "Claims loaded"
              : "Claims unavailable"}
          {updated && (
            <>
              {" "}
              · Last successful update: <ClaimTime value={updated} />
            </>
          )}
        </p>
        {error && <p role="alert">{error} Use Refresh claims to try again.</p>}
        {data && (
          <div aria-busy={loading}>
            <div className="pane">
              <h3>Recorded status counts</h3>
              <p>
                {data.claims.length} distinct claim
                {data.claims.length === 1 ? "" : "s"} across {data.pages}{" "}
                returned page{data.pages === 1 ? "" : "s"}
              </p>
              <dl className="kv" aria-label="Recorded status counts">
                {[...counts].map(([status, count]) => (
                  <div key={status} style={{ display: "contents" }}>
                    <dt>{status}</dt>
                    <dd>{count}</dd>
                  </div>
                ))}
              </dl>
              {!data.complete && (
                <p className="dim">
                  More pages are available in Claims. These counts are partial.
                </p>
              )}
            </div>
            {!data.claims.length && (
              <p className="lede">No authorised claims were returned.</p>
            )}
            {data.claims.length > 0 && !data.recent.length && (
              <p>
                No authorised records were returned on the first page. Counts
                above include later pages.
              </p>
            )}
            <div className="queue" aria-label="Recent claims">
              {data.recent.map((claim) => (
                <Link
                  prefetch={false}
                  className="row"
                  key={claim.claimId}
                  href={`/claim/${encodeURIComponent(claim.claimId)}`}
                >
                  <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                    <div className="t">{claim.policyNumber}</div>
                    <div className="s">
                      {claim.claimId} · {claim.claimType}
                    </div>
                    <div className="s">
                      Created <ClaimTime value={claim.createdAt} />
                    </div>
                  </div>
                  <div className="row-status">
                    <span className="tag">{claim.status}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>
      <section className="sec">
        <h2>Recorded claim activity</h2>
        <p className="dim">
          Creation and cancellation times from your claim records. Assessment,
          approval and payment history is on each claim&rsquo;s Activity tab.
        </p>
        {data ? (
          <ol className="timeline">
            {data.claims
              .flatMap((claim) => [
                {
                  claimId: claim.claimId,
                  at: claim.createdAt,
                  label: "Created",
                },
                ...(claim.cancelledAt
                  ? [
                      {
                        claimId: claim.claimId,
                        at: claim.cancelledAt,
                        label: "Cancelled",
                      },
                    ]
                  : []),
              ])
              .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
              .slice(0, 10)
              .map((event) => (
                <li key={`${event.claimId}:${event.label}`}>
                  <Link href={`/claim/${event.claimId}`} prefetch={false}>
                    {event.claimId}
                  </Link>{" "}
                  · {event.label} · <ClaimTime value={event.at} />
                </li>
              ))}
          </ol>
        ) : (
          <p>Activity unavailable</p>
        )}
        {data && !data.claims.length && (
          <p>No recorded claim activity returned.</p>
        )}
      </section>
      <section className="sec" aria-labelledby="use-cases-heading">
        <h2 id="use-cases-heading">AgentShield workflows</h2>
        <p className="dim">
          Shows whether each backend is configured for this server. Open a
          workflow to see its live records.
        </p>
        <div className="cards">
          {useCases.map((item) => {
            const on = backends[item.backend];
            return (
              <Link
                prefetch={false}
                key={item.title}
                href={item.href}
                className="card"
              >
                <h3>{item.title}</h3>
                <p className="dim">{item.text}</p>
                <Pill tone={on ? "ok" : "mut"}>
                  {on ? "Backend configured" : "Backend not configured"}
                </Pill>
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}
