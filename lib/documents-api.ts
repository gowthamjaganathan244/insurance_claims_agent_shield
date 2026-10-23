import "server-only";
import { currentSession } from "./auth/session";
import { authConfig } from "./auth/config";
import { AuthError } from "./auth/cognito";
export async function documentsApi(
  id: string,
  operation: "list" | "upload" | "complete",
  body?: object,
  token?: string,
  documentId?: string,
) {
  const session = await currentSession();
  if (!session) throw new AuthError("Sign in to access documents.", 401);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id))
    throw new AuthError("Claim not found.", 404);
  if (token && (token.length > 4096 || !/^[A-Za-z0-9_=-]+$/.test(token)))
    throw new AuthError("Invalid pagination token.");
  if (operation === "complete" && !/^[0-9a-f]{32}$/.test(documentId ?? ""))
    throw new AuthError("Invalid document ID.");
  const path = `/claims/${encodeURIComponent(id)}/documents${operation === "upload" ? "/upload-url" : operation === "complete" ? `/${documentId}/complete` : ""}`;
  const origin = new URL(
    operation === "list" && process.env.DOCUMENTS_READ_API_ORIGIN
      ? process.env.DOCUMENTS_READ_API_ORIGIN
      : authConfig().apiOrigin,
  );
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
    throw new AuthError("Document backend configuration is invalid.", 503);
  const url = new URL(path, origin);
  if (token) url.searchParams.set("nextToken", token);
  let response: Response;
  try {
    response = await fetch(url, {
      method: operation === "list" ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${session.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new AuthError(
      "Document service unavailable. The operation was not confirmed.",
      503,
    );
  }
  if (!response.ok)
    throw new AuthError(
      response.status === 404
        ? "Document service not available for this claim. The read endpoint may not be deployed yet."
        : "Document request was rejected or could not be verified.",
      [400, 401, 403, 404, 409, 415, 429].includes(response.status)
        ? response.status
        : 502,
    );
  const data = await response.json();
  if (operation === "list") {
    if (
      !Array.isArray(data.documents) ||
      !(data.nextToken === null || typeof data.nextToken === "string")
    )
      throw new AuthError(
        "Document read endpoint is not connected. No scan evidence was loaded.",
        502,
      );
    const safe = [
      "documentId",
      "claimId",
      "fileName",
      "contentType",
      "status",
      "scanStatus",
      "createdAt",
      "verifiedAt",
      "scanCompletedAt",
      "quarantineCopiedAt",
      "sourceIsolatedAt",
      "quarantineCopyVerified",
      "sourceIsolationPending",
      "expectedSizeBytes",
      "actualSizeBytes",
    ];
    const documents = data.documents.map((item: Record<string, unknown>) => {
      if (
        !item ||
        item.claimId !== id ||
        typeof item.documentId !== "string" ||
        !/^[0-9a-f]{32}$/.test(item.documentId) ||
        typeof item.status !== "string" ||
        typeof item.scanStatus !== "string"
      )
        throw new AuthError("Invalid document evidence response.", 502);
      return Object.fromEntries(
        Object.entries(item).filter(
          ([key, value]) =>
            safe.includes(key) &&
            ["string", "number", "boolean"].includes(typeof value),
        ),
      );
    });
    return { documents, nextToken: data.nextToken };
  }
  if (operation === "complete") {
    if (
      data.claimId !== id ||
      data.documentId !== documentId ||
      typeof data.status !== "string" ||
      typeof data.scanStatus !== "string"
    )
      throw new AuthError("Upload verification was not confirmed.", 502);
    return {
      documentId: data.documentId,
      claimId: id,
      status: data.status,
      scanStatus: data.scanStatus,
    };
  }
  const upload = new URL(data.uploadUrl);
  const bucket = "agentshield-claim-documents-gj2026";
  const fields = data.fields;
  if (
    upload.protocol !== "https:" ||
    upload.username ||
    upload.password ||
    upload.search ||
    upload.hash ||
    ![
      `${bucket}.s3.ap-southeast-2.amazonaws.com`,
      `${bucket}.s3.amazonaws.com`,
    ].includes(upload.hostname) ||
    upload.pathname !== "/" ||
    !/^[0-9a-f]{32}$/.test(data.documentId) ||
    !fields ||
    typeof fields !== "object" ||
    !Object.values(fields).every((v) => typeof v === "string") ||
    typeof fields.key !== "string" ||
    !fields.key.startsWith(
      `incoming/${session.identity.sub}/${id}/${data.documentId}.`,
    )
  )
    throw new AuthError("Unsafe upload destination rejected.", 502);
  return { documentId: data.documentId, uploadUrl: upload.toString(), fields };
}
