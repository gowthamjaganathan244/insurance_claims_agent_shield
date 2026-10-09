"use client";
import { Analysis } from "./analysis";
import { useClaims } from "./claim-store";
export function CommandAnalysis() {
  const { claims } = useClaims();
  return <Analysis claim={claims[0]} />;
}
