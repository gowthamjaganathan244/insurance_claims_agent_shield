"use client";
import { useState } from "react";
import type { ClaimsPageData } from "@/lib/live-claims";
import { useLiveClaims } from "./use-live-claims";
import { ClaimDocuments } from "./claim-documents";
export function SecurityDocuments() {
  const [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState("");
  const { data, error, loading, refresh } = useLiveClaims<ClaimsPageData>(
    `/api/claims${cursor ? `?nextToken=${encodeURIComponent(cursor)}` : ""}`,
  );
  const id = data?.claims.some((c) => c.claimId === selected)
    ? selected
    : data?.claims[0]?.claimId;
  return (
    <section className="sec">
      <h2>Security by claim</h2>
      <p className="dim">
        Choose one of your authorised claims. Document metadata comes from the
        security read endpoint; no incidents or threat names are inferred.
      </p>
      {loading && <p role="status">Loading authorised claims…</p>}
      {error && <p role="alert">{error}</p>}
      <label htmlFor="security-claim">Claim</label>
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
            {c.policyNumber} · {c.claimId}
          </option>
        ))}
      </select>
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
      {id && <ClaimDocuments key={id} claimId={id} />}
    </section>
  );
}
