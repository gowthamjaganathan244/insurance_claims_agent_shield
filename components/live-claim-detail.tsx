"use client";
import Link from "next/link";
import type { LiveClaim } from "@/lib/live-claims";
import { useLiveClaims } from "./use-live-claims";
import { LiveClaimPanel } from "./live-claim-panel";
export function LiveClaimDetail({ id }: { id: string }) {
  const { data, error, loading, refresh } = useLiveClaims<LiveClaim>(
    `/api/claims/${encodeURIComponent(id)}`,
  );
  return (
    <>
      <Link prefetch={false} href="/claims" className="dim">
        Back to claims
      </Link>
      <h1 className="pg">Claim details</h1>
      <button className="btn" disabled={loading} onClick={() => void refresh()}>
        Refresh claim
      </button>
      {loading && <p role="status">Loading claim…</p>}
      {error && <p role="alert">{error}</p>}
      {data && (
        <div className="pane">
          <LiveClaimPanel
            key={`${data.claimId}:${data.description}:${data.status}`}
            claim={data}
            changed={() => void refresh()}
          />
        </div>
      )}
    </>
  );
}
