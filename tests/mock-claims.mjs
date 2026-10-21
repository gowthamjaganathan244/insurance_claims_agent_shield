// Imported only by the isolated test launcher. Never by production code.
const records = new Map();
export const claimId = "11111111-1111-4111-8111-111111111111";
export async function mockClaims(url, init) {
  const token = new Headers(init?.headers).get("Authorization")?.split(" ")[1];
  let owner;
  try {
    owner = JSON.parse(Buffer.from(token.split(".")[1], "base64url")).sub;
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const reply = (body, status = 200) => Response.json(body, { status });
  if (owner.includes("claims-failure-"))
    return reply({ error: "private internal error" }, 500);
  if (owner.includes("claims-empty-"))
    return reply({ claims: [], nextToken: null });
  if (!records.has(owner))
    records.set(owner, {
      claimId,
      ownerSub: owner,
      policyNumber: "POL-TEST",
      claimType: "Property",
      description: "Contract fixture description",
      status: "SUBMITTED",
      createdAt: "2026-10-21T00:00:00+00:00",
    });
  const record = records.get(owner);
  if (url.pathname === "/claims") {
    if (owner.includes("claims-invalid-"))
      return reply({ claims: [{ claimId, ownerSub: owner }], nextToken: null });
    if (url.searchParams.has("nextToken"))
      return reply({ claims: [], nextToken: null });
    return reply({
      claims: [
        record,
        { ...record, claimId: "foreign", ownerSub: "another-user" },
        { ...record, claimId: "unowned", ownerSub: undefined },
      ],
      nextToken: "test-page-2",
    });
  }
  if (url.pathname !== `/claims/${claimId}`)
    return reply({ error: "Claim not found" }, 404);
  if (init.method === "PATCH" || init.method === "DELETE") {
    if (record.status !== "SUBMITTED")
      return reply({ error: "Claim not found or cannot be edited" }, 404);
    if (init.method === "PATCH")
      record.description = JSON.parse(init.body).description;
    else {
      record.status = "CANCELLED";
      record.cancelledAt = new Date().toISOString();
    }
  }
  return reply(record);
}
