"use client";
import { useState } from "react";
import Link from "next/link";
import type { ClaimsPageData } from "@/lib/live-claims";
import { useLiveClaims } from "./use-live-claims";
import { ClaimDocuments } from "./claim-documents";
import { ClaimTime } from "./live-claim-panel";
export function SecurityDocuments() {
  const [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState("");
  const { data, error, loading, updated, refresh } =
    useLiveClaims<ClaimsPageData>(
      `/api/claims${cursor ? `?nextToken=${encodeURIComponent(cursor)}` : ""}`,
    );
  const claim =
    data?.claims.find((c) => c.claimId === selected) ?? data?.claims[0];
  const id = claim?.claimId;
  return (
    <section
      className="sec inspection-workspace"
      aria-labelledby="inspection-selector-title"
    >
      <div className="inspection-section-head">
        <span>01 / INSPECTION SELECTOR</span>
        <h2 id="inspection-selector-title">Choose a claim</h2>
        <p>
          Only your authorised claims appear here. Select one to inspect its
          recorded document evidence.
        </p>
      </div>
      {loading && <p role="status">Loading authorised claims…</p>}
      {error && <p role="alert">{error}</p>}
      <div className="inspection-selector">
        <div>
          <label htmlFor="security-claim">Claim reference</label>
          <p className="dim sm">
            {updated ? (
              <>
                Last successful claim read: <ClaimTime value={updated} />
              </>
            ) : (
              "Claim list not yet available"
            )}
          </p>
        </div>
        <select
          className="claim-selector"
          id="security-claim"
          value={id ?? ""}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="" disabled>
            Select a claim
          </option>
          {data?.claims.map((c) => (
            <option key={c.claimId} value={c.claimId}>
              {c.policyNumber} · {c.claimType}
            </option>
          ))}
        </select>
      </div>
      <div className="acts">
        <button
          className="btn"
          onClick={() => void refresh()}
          disabled={loading}
        >
          Refresh claims
        </button>
        {cursor && (
          <button className="btn" onClick={() => setCursor(null)}>
            First claims page
          </button>
        )}
        {data?.nextToken && (
          <button className="btn" onClick={() => setCursor(data.nextToken)}>
            Next claims page
          </button>
        )}
      </div>
      {data && !data.claims.length && (
        <p>No authorised claims returned on this page.</p>
      )}
      {claim && (
        <div className="inspection-identity">
          <div>
            <small>SELECTED CLAIM</small>
            <strong>{claim.policyNumber}</strong>
            <span>
              {claim.claimType} · {claim.status}
            </span>
          </div>
          <Link
            href={`/claim/${encodeURIComponent(claim.claimId)}`}
            prefetch={false}
          >
            Open claim ↗
          </Link>
          <code>{claim.claimId}</code>
        </div>
      )}
      {id && <ClaimDocuments key={id} claimId={id} inspection />}
    </section>
  );
}
