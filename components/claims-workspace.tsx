"use client";
import Link from "next/link";
import { useState } from "react";
import { CreateClaim } from "./create-claim";
import type { ClaimsPageData } from "@/lib/live-claims";
import { useLiveClaims } from "./use-live-claims";
import { ClaimTime } from "./live-claim-panel";
import { DataState, PageHeading, Pill } from "./ui";
const tone = (status: string) =>
  status === "SUBMITTED" ? "acc" : status === "CANCELLED" ? "warn" : "mut";
export function ClaimsWorkspace() {
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const { data, error, loading, updated, refresh } =
    useLiveClaims<ClaimsPageData>(
      `/api/claims${cursor ? `?nextToken=${encodeURIComponent(cursor)}` : ""}`,
    );
  const claims = data?.claims ?? [];
  // Filters come from statuses actually returned; no invented categories.
  const statuses = [...new Set(claims.map((claim) => claim.status))].sort();
  const status = filter === "All" || statuses.includes(filter) ? filter : "All";
  const needle = query.trim().toLowerCase();
  const visible = claims.filter(
    (claim) =>
      (status === "All" || claim.status === status) &&
      (!needle ||
        claim.claimId.toLowerCase().includes(needle) ||
        claim.policyNumber.toLowerCase().includes(needle) ||
        claim.claimType.toLowerCase().includes(needle)),
  );
  return (
    <>
      <PageHeading
        title="Claims"
        actions={
          <>
            <button
              className="btn"
              disabled={loading}
              onClick={() => void refresh()}
            >
              Refresh claims
            </button>
            <CreateClaim />
          </>
        }
      >
        Your claims, newest first. Open a claim for documents, assessment,
        approvals, payments and activity.
      </PageHeading>
      <div className="claims-toolbar">
        <div
          className="chips"
          role="group"
          aria-label="Filter claims on this page"
        >
          {["All", ...statuses].map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={status === name}
              onClick={() => setFilter(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <label className="search">
          <span className="sr-only">Search claims on this page</span>
          <input
            type="search"
            placeholder="Search claims"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <p className="dim sm" role="status">
        {loading
          ? "Loading claims…"
          : data
            ? `${visible.length} of ${claims.length} claim${claims.length === 1 ? "" : "s"} shown on this page`
            : "Claims unavailable"}
        {updated && (
          <>
            {" "}
            · Last successful update: <ClaimTime value={updated} />
          </>
        )}
      </p>
      {error && (
        <DataState
          loading={false}
          error={`${error} Use Refresh claims to try again.`}
        />
      )}
      <div className="claims-table-wrap" aria-busy={loading}>
        <table className="tbl claims-table">
          <caption className="sr-only">
            Your claims on this page, newest first
          </caption>
          <thead>
            <tr>
              <th scope="col">Claim</th>
              <th scope="col">Policy</th>
              <th scope="col">Type</th>
              <th scope="col">Status</th>
              <th scope="col">Created</th>
              <th scope="col">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((claim) => (
              <tr className="claim-row" key={claim.claimId}>
                <td data-label="Claim">
                  <code className="claim-id">{claim.claimId}</code>
                </td>
                <td data-label="Policy">
                  <b>{claim.policyNumber}</b>
                </td>
                <td data-label="Type">{claim.claimType}</td>
                <td data-label="Status">
                  <Pill tone={tone(claim.status)}>{claim.status}</Pill>
                  {claim.cancelledAt && (
                    <small className="dim">
                      {" "}
                      <ClaimTime value={claim.cancelledAt} />
                    </small>
                  )}
                </td>
                <td data-label="Created">
                  <ClaimTime value={claim.createdAt} />
                </td>
                <td>
                  <Link
                    prefetch={false}
                    className="btn sm-btn"
                    href={`/claim/${encodeURIComponent(claim.claimId)}`}
                    aria-label={`View claim ${claim.claimId} (${claim.policyNumber})`}
                  >
                    View claim
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !error && !visible.length && (
          <p className="dim empty">
            {!claims.length
              ? "No claims are available for your account on this page."
              : "No claims on this page match the current filter or search."}
          </p>
        )}
      </div>
      <div className="acts pager">
        {cursor && (
          <button
            className="btn"
            disabled={loading}
            onClick={() => setCursor(null)}
          >
            First page
          </button>
        )}
        {data?.nextToken && (
          <button
            className="btn"
            disabled={loading}
            onClick={() => setCursor(data.nextToken)}
          >
            Next page
          </button>
        )}
      </div>
    </>
  );
}
