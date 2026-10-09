import { commandEvents, scanLabels } from "./data";
import type { Claim, ClaimEvent } from "./types";
export const aud = (value: number) => "$" + value.toLocaleString("en-AU");
export const riskColor = (risk: number) =>
  `var(--${risk >= 70 ? "bad" : risk >= 40 ? "warn" : "ok"})`;
export const severity = (risk: number) =>
  risk > 70 ? "Severe" : risk > 40 ? "Elevated" : "Low";
export const isHeld = (claim: Claim) =>
  claim.status === "Quarantined" ||
  (claim.status !== "Approved" &&
    (claim.risk >= 70 || claim.docs.some((doc) => doc.s === "mal")));
export function claimEvents(claim: Claim): ClaimEvent[] {
  if (claim.id === "CLM-48213") return commandEvents;
  return [
    ["09:02", "Claim submitted", claim.loc, "ok", "Customer"],
    [
      "09:04",
      "Documents uploaded",
      `${claim.docs.length} files received`,
      "ok",
      "Customer",
    ],
    ...claim.docs
      .filter((doc) => doc.s === "mal" || doc.s === "sus")
      .map((doc, index): ClaimEvent => [
        `09:${11 + index * 2}`,
        `${scanLabels[doc.s][0]}: ${doc.n}`,
        doc.s === "mal" ? "Isolated and sandboxed" : "Flagged for review",
        doc.s === "mal" ? "bad" : "warn",
        "scan-worker",
      ]),
    [
      "09:19",
      "Analysis ready",
      `Risk ${claim.risk} of 100`,
      "acc",
      "AgentShield",
    ],
    ...(claim.status === "Escalated"
      ? [
          [
            "09:31",
            "Claim escalated",
            "Awaiting senior approval",
            "bad",
            "AgentShield",
          ] as ClaimEvent,
        ]
      : []),
  ];
}
export function seed(start: number) {
  let value = start;
  return () => (value = (16807 * value) % 2147483647) / 2147483647;
}
