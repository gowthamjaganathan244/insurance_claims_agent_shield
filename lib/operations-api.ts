import "server-only";
import { currentSession } from "./auth/session";
import { AuthError } from "./auth/cognito";
export async function operationsApi(
  path: string,
  body?: object,
  token?: string,
) {
  const session = await currentSession();
  if (!session) throw new AuthError("Sign in to access operations.", 401);
  const configured = process.env.OPERATIONS_API_ORIGIN;
  if (!configured)
    throw new AuthError("Operations backend is not connected.", 503);
  const origin = new URL(configured);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    !/^[a-z0-9]+\.execute-api\.ap-southeast-2\.amazonaws\.com$/.test(
      origin.hostname,
    )
  )
    throw new AuthError("Operations backend configuration is invalid.", 503);
  if (
    !/^\/claims\/[A-Za-z0-9_-]{1,128}\/operations$/.test(path) &&
    path !== "/templates"
  )
    throw new AuthError("Invalid operation.");
  if (token && (token.length > 4096 || !/^[A-Za-z0-9_=-]+$/.test(token)))
    throw new AuthError("Invalid cursor.");
  const url = new URL(path, origin);
  if (token) url.searchParams.set("nextToken", token);
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${session.tokens.accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new AuthError(
      response.status === 403
        ? "Operator access is required for this action."
        : response.status === 409
          ? "Record changed or action is not eligible. Refresh before continuing."
          : response.status === 404
            ? "Claim or operations endpoint not found."
            : "Operations service unavailable or request rejected.",
      [400, 401, 403, 404, 409].includes(response.status)
        ? response.status
        : 503,
    );
  const raw = await response.text();
  if (raw.length > 524288)
    throw new AuthError("Operations response is too large.", 502);
  const data = JSON.parse(raw);
  const invalid = () => {
    throw new AuthError("Operations returned incomplete records.", 502);
  };
  if (!data || typeof data !== "object" || Array.isArray(data)) invalid();
  if (body) {
    if (
      data.recorded !== true ||
      typeof data.eventId !== "string" ||
      !/^[0-9a-f-]{36}$/.test(data.eventId)
    )
      invalid();
    return {
      recorded: true,
      eventId: data.eventId,
      ...(typeof data.warning === "string"
        ? {
            warning:
              "Email attempt recorded; acceptance is unknown. Do not resend automatically.",
          }
        : {}),
    };
  }
  if (path === "/templates") {
    if (
      !Array.isArray(data.templates) ||
      typeof data.deliveryTrackingConfigured !== "boolean"
    )
      invalid();
    const templates = data.templates.map((item: Record<string, unknown>) => {
      if (
        !item ||
        item.name !== "AgentShieldClaimCreated" ||
        ![item.subject, item.text, item.html].every(
          (v) => typeof v === "string",
        )
      )
        invalid();
      return {
        name: item.name,
        subject: item.subject,
        text: item.text,
        html: item.html,
      };
    });
    return {
      templates,
      deliveryTrackingConfigured: data.deliveryTrackingConfigured,
    };
  }
  if (
    !Number.isSafeInteger(data.version) ||
    data.version < 0 ||
    typeof data.canOperate !== "boolean" ||
    !Array.isArray(data.events) ||
    data.events.length > 25 ||
    !(data.nextToken === null || typeof data.nextToken === "string")
  )
    invalid();
  for (const field of ["assessment", "decision", "payment"]) {
    if (
      data[field] !== null &&
      (!data[field] ||
        typeof data[field] !== "object" ||
        Array.isArray(data[field]))
    )
      invalid();
  }
  const events = data.events.map((item: Record<string, unknown>) => {
    if (
      !item ||
      typeof item.eventId !== "string" ||
      typeof item.action !== "string" ||
      typeof item.createdAt !== "string" ||
      !Number.isFinite(Date.parse(item.createdAt)) ||
      !item.details ||
      typeof item.details !== "object" ||
      Array.isArray(item.details)
    )
      invalid();
    return {
      eventId: item.eventId,
      action: item.action,
      createdAt: item.createdAt,
      details: item.details,
    };
  });
  return {
    version: data.version,
    canOperate: data.canOperate,
    assessment: data.assessment,
    decision: data.decision,
    payment: data.payment,
    events,
    nextToken: data.nextToken,
  };
}
