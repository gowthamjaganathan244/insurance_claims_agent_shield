"use client";
import Link from "next/link";
import { useState } from "react";
import type { ClaimsPageData } from "@/lib/live-claims";
import { useLiveClaims } from "./use-live-claims";
import { ClaimTime, LiveClaimPanel } from "./live-claim-panel";
export function ClaimsWorkspace() {
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState("");
  const { data, error, loading, updated, refresh } =
    useLiveClaims<ClaimsPageData>(
      `/api/claims${cursor ? `?nextToken=${encodeURIComponent(cursor)}` : ""}`,
    );
  const visible = (data?.claims ?? []).filter(
    (claim) => filter === "All" || claim.status === filter,
  );
  const claim = visible.find((item) => item.claimId === selected) ?? visible[0];
  return (
    <>
      <div
        className="chips"
        role="group"
        aria-label="Filter claims on this page"
      >
        {["All", "SUBMITTED", "CANCELLED"].map((name) => (
          <button
            key={name}
            aria-pressed={filter === name}
            onClick={() => setFilter(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="acts">
        <button
          className="btn"
          disabled={loading}
          onClick={() => void refresh()}
        >
          Refresh claims
        </button>
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
      <p className="dim sm" role="status">
        {loading
          ? "Loading claims…"
          : data
            ? `${visible.length} claims shown on this page`
            : "Claims unavailable"}
        {updated && (
          <>
            {" "}
            · Last successful update: <ClaimTime value={updated} />
          </>
        )}
      </p>
      {error && <p role="alert">{error} Use Refresh claims to try again.</p>}
      <div className="ws" aria-busy={loading}>
        <div className="queue">
          {visible.map((item) => (
            <Link
              prefetch={false}
              className="row"
              key={item.claimId}
              href={`/claim/${encodeURIComponent(item.claimId)}`}
              aria-current={
                claim?.claimId === item.claimId ? "true" : undefined
              }
              onClick={(event) => {
                if (
                  matchMedia("(min-width:1180px)").matches &&
                  !event.ctrlKey &&
                  !event.metaKey &&
                  !event.shiftKey &&
                  !event.altKey
                ) {
                  event.preventDefault();
                  setSelected(item.claimId);
                }
              }}
            >
              <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                <div className="t">{item.policyNumber}</div>
                <div className="s">
                  {item.claimId} · {item.claimType}
                </div>
              </div>
              <div className="row-status">
                <span className="tag acc">{item.status}</span>
              </div>
            </Link>
          ))}
          {!loading && !error && !visible.length && (
            <p className="lede">
              {filter === "All"
                ? "No claims are available for your account on this page."
                : "No claims match this status on this page."}
            </p>
          )}
        </div>
        {claim && (
          <>
            <div className="pane">
              <LiveClaimPanel
                key={`${claim.claimId}:${claim.description}:${claim.status}`}
                claim={claim}
                changed={() => void refresh()}
              />
              <div className="acts">
                <Link
                  prefetch={false}
                  className="btn"
                  href={`/claim/${encodeURIComponent(claim.claimId)}`}
                >
                  Open claim
                </Link>
              </div>
            </div>
            <div className="pane">
              <h3>Claim information</h3>
              <p className="dim">
                Only information returned by the claims service is displayed.
              </p>
              <p className="dim">
                Document scans, risk analysis, payment information and
                investigation history are not available from this claims API.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}
