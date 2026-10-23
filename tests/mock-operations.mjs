// Isolated CI transport only. Production imports no mock backend.
const records = new Map();
export async function mockOperations(url, init) {
  const token = new Headers(init?.headers).get("Authorization")?.split(" ")[1];
  const owner = JSON.parse(Buffer.from(token.split(".")[1], "base64url")).sub;
  const operator = owner.includes("operator-");
  if (url.pathname === "/templates")
    return operator
      ? Response.json({
          templates: [
            {
              name: "AgentShieldClaimCreated",
              subject: "Claim {{claimId}}",
              text: "Stored test contract {{status}}",
              html: "<script>window.templateExecuted=true</script>",
            },
          ],
          deliveryTrackingConfigured: false,
        })
      : Response.json({ error: "Operator required" }, { status: 403 });
  const id = url.pathname.split("/")[2];
  if (id !== "11111111-1111-4111-8111-111111111111")
    return Response.json({ error: "Not found" }, { status: 404 });
  if (!records.has(owner))
    records.set(owner, {
      version: 0,
      assessment: null,
      decision: null,
      payment: null,
      events: [],
      nextToken: null,
    });
  const state = records.get(owner);
  if (init.method === "POST") {
    if (!operator)
      return Response.json({ error: "Operator required" }, { status: 403 });
    const body = JSON.parse(init.body);
    if (body.version !== state.version)
      return Response.json({ error: "Conflict" }, { status: 409 });
    const details = { note: body.note, recordedAt: new Date().toISOString() };
    if (body.action === "assessment")
      state.assessment = { ...details, riskScore: null };
    if (body.action === "decision") {
      if (!state.assessment)
        return Response.json({ error: "Assessment required" }, { status: 409 });
      state.decision = { ...details, outcome: body.outcome };
    }
    if (body.action === "payment") {
      if (state.decision?.outcome !== "APPROVED")
        return Response.json({ error: "Approval required" }, { status: 409 });
      state.payment = {
        ...details,
        amountMinor: body.amountMinor,
        status: "RECORDED",
        reconciliation: "UNRECONCILED",
        moneyTransferred: false,
      };
    }
    // Mirrors backend/operations-api: needs a payment record and a valid outcome.
    if (body.action === "reconciliation") {
      if (!state.payment || !["MATCHED", "DISCREPANCY"].includes(body.outcome))
        return Response.json(
          { error: "Payment record and reconciliation outcome required" },
          { status: 409 },
        );
      details.outcome = body.outcome;
      state.payment = {
        ...state.payment,
        reconciliation: body.outcome,
        reconciliationNote: body.note,
        reconciledAt: details.recordedAt,
      };
    }
    if (body.action === "email")
      return Response.json({ error: "Disabled" }, { status: 503 });
    state.version++;
    state.events.unshift({
      eventId: body.requestId,
      action: body.action,
      createdAt: details.recordedAt,
      details,
    });
    return Response.json(
      { recorded: true, eventId: body.requestId },
      { status: 201 },
    );
  }
  return Response.json({ ...state, canOperate: operator });
}
