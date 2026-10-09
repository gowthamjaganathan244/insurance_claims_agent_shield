import type { CSSProperties } from "react";
export type Tone = "ok" | "warn" | "bad" | "acc";
export type ScanStatus = "ok" | "sus" | "mal" | "pend";
export type ClaimStatus =
  "Processing" | "In review" | "Escalated" | "Approved" | "Quarantined";
export interface ClaimDocument {
  n: string;
  s: ScanStatus;
}
export interface Claim {
  id: string;
  name: string;
  type: string;
  amt: number;
  status: ClaimStatus;
  risk: number;
  loc: string;
  docs: ClaimDocument[];
}
export type ClaimEvent = [
  time: string,
  title: string,
  detail: string,
  tone: Tone,
  actor: string,
];
export interface Incident {
  id: string;
  sev: string;
  c: Tone;
  t: string;
  st: string;
  when: string;
  claim: string;
  src: string;
  ev: string[];
  root: string;
  ai: string;
  fix: string;
  ap: string;
  proc: string;
  tl: string[][];
}
export type Template = [name: string, channel: string, message: string];
export type Style = CSSProperties & { [key: `--${string}`]: string | number };
