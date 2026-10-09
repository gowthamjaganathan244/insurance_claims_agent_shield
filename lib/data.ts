import fixture from "./fixtures.json";
import type {
  Claim,
  ClaimEvent,
  Incident,
  Template,
  ScanStatus,
} from "./types";
export const initialClaims = fixture.claims as Claim[];
export const commandEvents = fixture.EV as ClaimEvent[];
export const incidents = fixture.incidents as Incident[];
export const templates = fixture.tpls as Template[];
export const deployments = fixture.deploys;
export const alerts = fixture.alerts;
export const stages = [
  "Lodged",
  "Documents",
  "Security check",
  "Assessment",
  "Decision",
  "Payment",
];
export const scanLabels: Record<ScanStatus, [string, string]> = {
  ok: ["Clean", "ok"],
  sus: ["Suspicious", "warn"],
  mal: ["Malware found", "bad"],
  pend: ["Scanning", "acc"],
};
export const scanEvidence: Record<ScanStatus, string[]> = {
  mal: [
    "Macro-enabled object executed in sandbox",
    "Outbound beacon attempted and blocked",
    "Hash matches two earlier uploads",
  ],
  sus: [
    "Metadata edited after incident date",
    "PDF producer changed after signature",
  ],
  ok: ["No threats found", "Signature and metadata consistent"],
  pend: ["Queued for scanning"],
};
