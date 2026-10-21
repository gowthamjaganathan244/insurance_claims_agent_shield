export interface LiveClaim {
  claimId: string;
  policyNumber: string;
  claimType: string;
  description: string;
  status: string;
  createdAt: string;
  cancelledAt?: string;
}
export interface ClaimsPageData {
  claims: LiveClaim[];
  nextToken: string | null;
}
/** Project only verified, owned fields; do not send owner subjects to the UI. */
export function ownedClaim(value: unknown, owner: string): LiveClaim | null {
  if (!value || typeof value !== "object")
    throw new Error("Invalid claim response");
  const item = value as Record<string, unknown>;
  if (item.ownerSub !== owner) return null;
  for (const key of [
    "claimId",
    "policyNumber",
    "claimType",
    "description",
    "status",
    "createdAt",
  ])
    if (typeof item[key] !== "string" || !item[key])
      throw new Error("Incomplete claim response");
  if (!Number.isFinite(Date.parse(item.createdAt as string)))
    throw new Error("Invalid claim timestamp");
  if (
    item.cancelledAt !== undefined &&
    (typeof item.cancelledAt !== "string" ||
      !Number.isFinite(Date.parse(item.cancelledAt)))
  )
    throw new Error("Invalid cancellation timestamp");
  return {
    claimId: item.claimId as string,
    policyNumber: item.policyNumber as string,
    claimType: item.claimType as string,
    description: item.description as string,
    status: item.status as string,
    createdAt: item.createdAt as string,
    ...(item.cancelledAt ? { cancelledAt: item.cancelledAt as string } : {}),
  };
}
