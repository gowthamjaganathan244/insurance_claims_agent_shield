"use client";
import Link from "next/link";
import { useState } from "react";
import { ClaimOperations, type OperationsView } from "./claim-operations";
import { ClaimDocuments } from "./claim-documents";
import type { LiveClaim } from "@/lib/live-claims";
import { useLiveClaims } from "./use-live-claims";
import { ClaimTime, LiveClaimPanel } from "./live-claim-panel";
import { Alert, DataState, PageHeading, Pill } from "./ui";
import { Tabs } from "./tabs";
const tabs = [
  "Overview",
  "Documents",
  "Assessment",
  "Approvals",
  "Payments",
  "Activity",
];
const views: Record<number, OperationsView> = {
  2: "assessment",
  3: "approvals",
  4: "payments",
  5: "activity",
};
export function LiveClaimDetail({
  id,
  operationsEnabled = false,
}: {
  id: string;
  operationsEnabled?: boolean;
}) {
  const { data, error, loading, refresh } = useLiveClaims<LiveClaim>(
    `/api/claims/${encodeURIComponent(id)}`,
  );
  const [tab, setTab] = useState(0);
  return (
    <>
      <Link prefetch={false} href="/claims" className="dim back">
        ← Claims
      </Link>
      <PageHeading
        title={data ? data.policyNumber : "Claim"}
        actions={
          <button
            className="btn"
            disabled={loading}
            onClick={() => void refresh()}
          >
            Refresh claim
          </button>
        }
      >
        {data ? (
          <>
            {data.claimType} · <Pill>{data.status}</Pill> · created{" "}
            <ClaimTime value={data.createdAt} />
          </>
        ) : (
          id
        )}
      </PageHeading>
      <DataState
        loading={loading && !data}
        error={error}
        loadingText="Loading claim…"
      />
      {data && (
        <Tabs
          label="Claim sections"
          labels={tabs}
          active={tab}
          onChange={setTab}
          remount={false}
        >
          {tab === 0 && (
            <div className="pane">
              <LiveClaimPanel
                key={`${data.claimId}:${data.description}:${data.status}`}
                claim={data}
                changed={() => void refresh()}
              />
            </div>
          )}
          {tab === 1 && (
            <ClaimDocuments
              claimId={id}
              canUpload={data.status === "SUBMITTED"}
            />
          )}
          {tab >= 2 &&
            (operationsEnabled ? (
              <ClaimOperations claimId={id} view={views[tab]} />
            ) : (
              <Alert>
                The operations backend is not configured on this server.
                Assessments, approvals, payment records and audit history are
                unavailable.
              </Alert>
            ))}
        </Tabs>
      )}
    </>
  );
}
