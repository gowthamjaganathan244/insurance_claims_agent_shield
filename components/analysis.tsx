"use client";
import { useRouter } from "next/navigation";
import { useClaims } from "./claim-store";
import { riskColor, severity } from "@/lib/claims";
import type { Claim, ClaimStatus, Style } from "@/lib/types";
export function Analysis({
  claim,
  onEvidence,
}: {
  claim: Claim;
  onEvidence?: () => void;
}) {
  const { update } = useClaims();
  const router = useRouter();
  const high = claim.risk > 70;
  const medium = claim.risk > 40;
  const action: ClaimStatus = high
    ? "Escalated"
    : medium
      ? "In review"
      : "Approved";
  const evidence = claim.docs.filter(
    (doc) => doc.s === "mal" || doc.s === "sus",
  ).length;
  return (
    <section
      className="an lq"
      style={{ "--c": riskColor(claim.risk) } as Style}
      aria-label="AgentShield Analysis"
    >
      <div>
        <div className="lb">AgentShield Analysis</div>
        <div className="sc">
          {claim.risk}
          <small> / 100</small>
        </div>
        <div
          className="lb"
          style={{ marginTop: 8, color: riskColor(claim.risk) }}
        >
          {severity(claim.risk)}
        </div>
        <div className="seg" aria-hidden="true">
          {Array.from({ length: 20 }, (_, index) => (
            <i
              key={index}
              className={index < Math.round(claim.risk / 5) ? "on" : ""}
            />
          ))}
        </div>
      </div>
      <div>
        <p>
          {high
            ? "Executable payload or tampering detected. Similar sender behaviour was identified across two previous claims."
            : medium
              ? "Inconsistencies found in flagged files. Metadata changed after the stated incident date, but nothing conclusive."
              : "Documents are clean and consistent with the claim narrative. History is unremarkable."}
        </p>
        <div className="m">
          <div>
            <b>{Math.min(97, Math.round(58 + 0.4 * claim.risk))}%</b>
            <span>confidence</span>
          </div>
          <div>
            <b>{evidence + Math.round(claim.risk / 14)}</b>
            <span>evidence items</span>
          </div>
          <div>
            <b>{high ? 2 : medium ? 1 : 0}</b>
            <span>correlated events</span>
          </div>
        </div>
      </div>
      <div className="nx">
        <small>Recommended next action</small>
        <div>
          {claim.status === "Approved"
            ? "Claim approved. No further action."
            : high
              ? "Quarantine documents and escalate before payment release."
              : medium
                ? "Check the flagged documents manually before approval."
                : "Approve under the standard threshold."}
        </div>
      </div>
      <div className="acts">
        <button
          className="btn"
          onClick={() =>
            onEvidence
              ? onEvidence()
              : router.push(`/claim/${claim.id}?evidence=1`)
          }
        >
          Review evidence
        </button>
        <button
          className="btn ok"
          disabled={claim.status === "Approved"}
          onClick={() => update(claim.id, action)}
        >
          Approve action
        </button>
        <button
          className="btn warn"
          onClick={() => update(claim.id, "Escalated")}
        >
          Escalate
        </button>
      </div>
    </section>
  );
}
