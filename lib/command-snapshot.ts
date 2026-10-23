import type { ClaimsPageData, LiveClaim } from "./live-claims";
export interface CommandSnapshot {
  recent: LiveClaim[];
  claims: LiveClaim[];
  pages: number;
  complete: boolean;
}
export async function loadCommandSnapshot(
  url: string,
  signal: AbortSignal,
): Promise<CommandSnapshot> {
  const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
  const records = new Map<string, LiveClaim>();
  const visited = new Set<string>();
  let cursor: string | null = null;
  let recent: LiveClaim[] = [];
  // Bound request cost and latency; never label a bounded result as a full total.
  for (let page = 1; page <= 10; page++) {
    const response = await fetch(
      cursor ? `${url}?nextToken=${encodeURIComponent(cursor)}` : url,
      {
        cache: "no-store",
        signal: boundedSignal,
      },
    );
    const body = await response.json();
    if (!response.ok) {
      if (response.status === 401) window.location.replace("/login");
      throw new Error(body.error ?? "Unable to load claims.");
    }
    const data = body as ClaimsPageData;
    if (
      !Array.isArray(data.claims) ||
      !(data.nextToken === null || typeof data.nextToken === "string")
    )
      throw new Error("Incomplete claims response. Counts unavailable.");
    if (page === 1) recent = data.claims;
    for (const claim of data.claims) {
      const previous = records.get(claim.claimId);
      if (previous && JSON.stringify(previous) !== JSON.stringify(claim))
        throw new Error(
          "Claims changed during pagination. Refresh to recalculate counts.",
        );
      records.set(claim.claimId, claim);
    }
    cursor = data.nextToken;
    if (!cursor || page === 10)
      return {
        recent,
        claims: [...records.values()],
        pages: page,
        complete: !cursor,
      };
    if (visited.has(cursor))
      throw new Error("Claims pagination repeated. Counts unavailable.");
    visited.add(cursor);
  }
  throw new Error("Counts unavailable.");
}
