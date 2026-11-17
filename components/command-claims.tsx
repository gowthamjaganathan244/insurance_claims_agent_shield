"use client";
import Link from "next/link";
import { useState } from "react";
import {
  loadCommandSnapshot,
  type CommandSnapshot,
} from "@/lib/command-snapshot";
import type { LiveClaim } from "@/lib/live-claims";
import { useLiveClaims } from "./use-live-claims";
import { ClaimTime } from "./live-claim-panel";
import { useMonitoring } from "./monitoring-provider";
import { alarmHealth } from "@/lib/monitoring/health";
import { Kpis, Pill } from "./ui";

type Backend = "documents" | "operations" | "monitoring";
const useCases: {
  title: string;
  text: string;
  href: string;
  backend: Backend;
  index: string;
}[] = [
  {
    index: "01",
    title: "Malware scanning and quarantine",
    text: "GuardDuty scan results, document status and quarantine evidence.",
    href: "/security",
    backend: "documents",
  },
  {
    index: "02",
    title: "Email modernisation and delivery",
    text: "Stored SES template review and persisted delivery history.",
    href: "/communications",
    backend: "operations",
  },
  {
    index: "03",
    title: "API performance and scalability",
    text: "API Gateway and Lambda latency, volume and error measurements.",
    href: "/reliability",
    backend: "monitoring",
  },
  {
    index: "04",
    title: "Security incident investigation",
    text: "Per-claim document findings, isolation timestamps and audit trail.",
    href: "/security",
    backend: "documents",
  },
  {
    index: "05",
    title: "Release reliability",
    text: "CloudWatch alarm states and error rates for the claims service.",
    href: "/reliability",
    backend: "monitoring",
  },
];
const href = (claim: LiveClaim) =>
  `/claim/${encodeURIComponent(claim.claimId)}`;
const statusTone = (status: string) =>
  status === "CANCELLED" ? "warn" : status === "SUBMITTED" ? "acc" : "mut";
const nextAction = (claim: LiveClaim) =>
  claim.status === "SUBMITTED"
    ? "Review claim and evidence"
    : claim.status === "CANCELLED"
      ? "View retained record"
      : "View claim status";

export function CommandClaims({
  backends,
}: {
  backends: Record<Backend, boolean>;
}) {
  const { data, error, loading, updated, refresh } =
    useLiveClaims<CommandSnapshot>("/api/claims", loadCommandSnapshot, 60000);
  const monitoring = useMonitoring();
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("returned");
  const claims = data?.claims ?? [];
  const counts = new Map<string, number>();
  for (const claim of claims)
    counts.set(claim.status, (counts.get(claim.status) ?? 0) + 1);
  const statuses = [...counts].sort(([a], [b]) =>
    a === "SUBMITTED"
      ? -1
      : b === "SUBMITTED"
        ? 1
        : a === "CANCELLED"
          ? 1
          : b === "CANCELLED"
            ? -1
            : a.localeCompare(b),
  );
  const laneClaims = statuses.map(([status, count]) => ({
    status,
    count,
    preview: claims.filter((claim) => claim.status === status).slice(0, 6),
  }));
  const selected =
    claims.find((claim) => claim.claimId === selectedId) ?? claims[0];
  const needle = query.trim().toLowerCase();
  const recent = (data?.recent ?? []).filter(
    (claim) =>
      !needle ||
      `${claim.policyNumber} ${claim.claimId} ${claim.claimType} ${claim.status}`
        .toLowerCase()
        .includes(needle),
  );
  if (sort !== "returned")
    recent.sort((a, b) =>
      sort === "oldest"
        ? Date.parse(a.createdAt) - Date.parse(b.createdAt)
        : sort === "newest"
          ? Date.parse(b.createdAt) - Date.parse(a.createdAt)
          : sort === "status"
            ? a.status.localeCompare(b.status)
            : a.claimType.localeCompare(b.claimType),
    );
  const events = claims
    .flatMap((claim) => [
      { claim, at: claim.createdAt, label: "Claim created", tone: "acc" },
      ...(claim.cancelledAt
        ? [
            {
              claim,
              at: claim.cancelledAt,
              label: "Claim cancelled",
              tone: "warn",
            },
          ]
        : []),
    ])
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 10);
  return (
    <div className="pit-wall">
      <section
        className="hero overview-head pit-hero"
        aria-labelledby="pit-title"
      >
        <div className="pit-hero-top">
          <span>AGENTSHIELD / OPERATIONAL VIEW</span>
          <span>LIVE DATA / AUTHORISED CLAIMS</span>
        </div>
        <div className="pit-hero-main">
          <div>
            <p className="pit-kicker">
              <i aria-hidden="true" /> 01 / PIT WALL
            </p>
            <h1 id="pit-title">
              Live Pit Wall<span>.</span>
            </h1>
            <p className="pit-deck">
              Precision in every claim. A clear view of your work, the recorded
              claim states and the systems behind them.
            </p>
          </div>
          <div className="pit-hero-actions">
            <button
              className="btn"
              disabled={loading}
              onClick={() => void refresh()}
            >
              Refresh
            </button>
            <Link className="btn ok" prefetch={false} href="/claims">
              Open claims
            </Link>
          </div>
        </div>
        <div className="pit-live-strip">
          <span>
            CLAIMS DATA{" "}
            {updated ? (
              <>
                <ClaimTime value={updated} />
              </>
            ) : loading ? (
              "UPDATING"
            ) : (
              "UNAVAILABLE"
            )}
          </span>
          <span>
            MONITORED ALARMS{" "}
            <strong
              className={
                monitoring.data
                  ? alarmHealth(monitoring.data.alarms).tone
                  : "mut"
              }
            >
              {monitoring.data
                ? alarmHealth(monitoring.data.alarms).label
                : monitoring.loading
                  ? "Loading"
                  : "Unavailable"}
            </strong>
          </span>
        </div>
        <div aria-label="Recorded claim status counts" aria-busy={loading}>
          <Kpis
            items={[
              {
                label: data?.complete ? "Your claims" : "Loaded claims",
                value: data ? claims.length : loading ? "…" : null,
                hint: data
                  ? `${data.pages} page${data.pages === 1 ? "" : "s"} read`
                  : undefined,
              },
              ...statuses
                .slice(0, 2)
                .map(([status, count]) => ({
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

      <section className="sec pit-lane" aria-labelledby="pit-lane-title">
        <div className="pit-section-head">
          <div>
            <p className="pit-index">02 / CLAIM PIT LANE</p>
            <h2 id="pit-lane-title">Actual states. Clear lines.</h2>
          </div>
          <p>
            Each rail represents a status returned by the claim service.
            Cancelled claims have their own terminal lane.
          </p>
        </div>
        {loading && !data && (
          <p className="pit-state" role="status">
            Loading claim lanes…
          </p>
        )}
        {!data && !loading && (
          <p className="pit-state">Claim lanes unavailable.</p>
        )}
        {data && !claims.length && (
          <p className="pit-state">No authorised claims were returned.</p>
        )}
        {data && claims.length > 0 && (
          <div className="pit-lanes">
            {laneClaims.map(({ status, count, preview }) => (
              <div
                className={`pit-lane-row ${status === "CANCELLED" ? "is-terminal" : ""}`}
                key={status}
              >
                <div className="pit-lane-label">
                  <span className="pit-lane-marker" aria-hidden="true" />
                  <strong>{status}</strong>
                  <small>
                    {count} claim{count === 1 ? "" : "s"}
                  </small>
                </div>
                <div
                  className="pit-lane-track"
                  aria-label={`${status} claim selections`}
                >
                  {preview.map((claim) => (
                    <button
                      type="button"
                      className={`pit-claim ${selected?.claimId === claim.claimId ? "selected" : ""}`}
                      aria-pressed={selected?.claimId === claim.claimId}
                      onClick={() => setSelectedId(claim.claimId)}
                      key={claim.claimId}
                    >
                      <strong>{claim.policyNumber}</strong>
                      <span>{claim.claimType}</span>
                    </button>
                  ))}
                  {count > preview.length && (
                    <span className="pit-lane-more">
                      +{count - preview.length} more in Claims
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div className="pit-selection" role="status">
              <div>
                <small>SELECTED CLAIM</small>
                <strong>{selected.policyNumber}</strong>
                <span>
                  {selected.claimType} · {selected.status}
                </span>
              </div>
              <Link prefetch={false} href={href(selected)} className="btn ok">
                Open claim <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
        )}
      </section>

      <section
        className="sec pit-board"
        aria-labelledby="recent-claims-heading"
        aria-label="Recent claims"
      >
        <div className="pit-section-head">
          <div>
            <p className="pit-index">03 / STARTING GRID</p>
            <h2 id="recent-claims-heading">Recent claims</h2>
          </div>
          <p>
            First returned page. Search and sorting here apply to that page
            only.
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
            <div className="pit-board-summary pane">
              <p>
                {claims.length} distinct claim{claims.length === 1 ? "" : "s"}{" "}
                across {data.pages} returned page{data.pages === 1 ? "" : "s"}
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
            {!claims.length && (
              <p className="lede">No authorised claims were returned.</p>
            )}
            {claims.length > 0 && !data.recent.length && (
              <p>
                No authorised records were returned on the first page. Counts
                above include later pages.
              </p>
            )}
            {data.recent.length > 0 && (
              <div className="pit-board-tools">
                <label>
                  <span className="sr-only">Search recent claims</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search this page"
                  />
                </label>
                <label>
                  Sort{" "}
                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value)}
                  >
                    <option value="returned">Returned order</option>
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="status">Status</option>
                    <option value="type">Type</option>
                  </select>
                </label>
              </div>
            )}
            <div className="queue" aria-label="Recent claims">
              {recent.map((claim) => (
                <Link
                  prefetch={false}
                  className="row pit-board-row"
                  key={claim.claimId}
                  href={href(claim)}
                >
                  <div className="pit-board-primary">
                    <span className="t">{claim.policyNumber}</span>
                    <span className="s">{claim.claimType}</span>
                  </div>
                  <div className="pit-board-date">
                    <span>CREATED</span>
                    <ClaimTime value={claim.createdAt} />
                  </div>
                  <div className="row-status">
                    <Pill tone={statusTone(claim.status)}>{claim.status}</Pill>
                    <span className="pit-next">{nextAction(claim)} ↗</span>
                  </div>
                  <span className="pit-uuid">{claim.claimId}</span>
                </Link>
              ))}
            </div>
            {data.recent.length > 0 && !recent.length && (
              <p className="pit-state">
                No claims on this page match your search.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="sec pit-feed" aria-labelledby="pit-feed-title">
        <div className="pit-section-head">
          <div>
            <p className="pit-index">04 / RACE CONTROL FEED</p>
            <h2 id="pit-feed-title">Recorded activity</h2>
          </div>
          <p>
            Creation and cancellation events from claim records. Assessment,
            approval and payment history remains in each claim’s Activity tab.
          </p>
        </div>
        {!data ? (
          <p>Activity unavailable</p>
        ) : !events.length ? (
          <p>No recorded claim activity returned.</p>
        ) : (
          <ol className="pit-events">
            {events.map((event) => (
              <li key={`${event.claim.claimId}:${event.label}`}>
                <span
                  className={`pit-event-dot ${event.tone}`}
                  aria-hidden="true"
                />
                <details>
                  <summary>
                    <span className="pit-event-action">{event.label}</span>
                    <strong>{event.claim.policyNumber}</strong>
                    <ClaimTime value={event.at} />
                    <span className="pit-expand">Details</span>
                  </summary>
                  <div className="pit-event-detail">
                    <p>Claim type: {event.claim.claimType}</p>
                    <p>
                      Claim reference: <code>{event.claim.claimId}</code>
                    </p>
                    <p>Recorded status: {event.claim.status}</p>
                    <Link prefetch={false} href={href(event.claim)}>
                      Open claim ↗
                    </Link>
                  </div>
                </details>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="sec pit-systems" aria-labelledby="use-cases-heading">
        <div className="pit-section-head">
          <div>
            <p className="pit-index">05 / ENGINEERING BAY</p>
            <h2 id="use-cases-heading">Connected workflows</h2>
          </div>
          <p>
            Configuration shows whether a backend is connected here. Open a
            workflow to inspect its actual records and health.
          </p>
        </div>
        <div className="pit-system-list">
          {useCases.map((item) => (
            <Link
              prefetch={false}
              key={item.title}
              href={item.href}
              className="pit-system"
            >
              <span className="pit-system-index">{item.index}</span>
              <span className="pit-system-body">
                <strong>{item.title}</strong>
                <small>{item.text}</small>
              </span>
              <Pill tone={backends[item.backend] ? "ok" : "mut"}>
                {backends[item.backend]
                  ? "Backend configured"
                  : "Backend not configured"}
              </Pill>
              <span className="pit-system-arrow" aria-hidden="true">
                ↗
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
