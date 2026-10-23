"use client";
import { useState } from "react";
import { useLiveClaims } from "./use-live-claims";
import { ClaimTime } from "./live-claim-panel";
type DocumentRecord = {
  documentId: string;
  claimId: string;
  fileName?: string;
  status: string;
  scanStatus: string;
  createdAt?: string;
  scanCompletedAt?: string;
  quarantineCopiedAt?: string;
  sourceIsolatedAt?: string;
  quarantineCopyVerified?: boolean;
  sourceIsolationPending?: boolean;
};
export function ClaimDocuments({
  claimId,
  canUpload = false,
}: {
  claimId: string;
  canUpload?: boolean;
}) {
  const [cursor, setCursor] = useState<string | null>(null);
  const { data, error, loading, updated, refresh } = useLiveClaims<{
    documents: DocumentRecord[];
    nextToken: string | null;
  }>(
    `/api/claims/${claimId}/documents${cursor ? `?nextToken=${encodeURIComponent(cursor)}` : ""}`,
  );
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  return (
    <section className="sec">
      <h2>Document security evidence</h2>
      {canUpload && (
        <form
          className="record-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending) return;
            const file = new FormData(event.currentTarget).get("document");
            if (!(file instanceof File) || !file.size) return;
            setPending(true);
            setMessage("");
            let uploaded = false;
            try {
              const csrfResponse = await fetch("/api/auth/csrf", {
                cache: "no-store",
              });
              if (!csrfResponse.ok)
                throw new Error("Unable to start secure upload.");
              const { csrfToken } = await csrfResponse.json();
              const post = async (path: string, body: object) => {
                const response = await fetch(path, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrfToken,
                  },
                  body: JSON.stringify(body),
                });
                const value = await response.json();
                if (!response.ok)
                  throw new Error(value.error ?? "Upload not confirmed.");
                return value;
              };
              const intent = await post(
                `/api/claims/${claimId}/documents/upload-url`,
                {
                  fileName: file.name,
                  contentType: file.type,
                  sizeBytes: file.size,
                },
              );
              const form = new FormData();
              for (const [key, value] of Object.entries(intent.fields))
                form.append(key, value as string);
              form.append("file", file);
              const result = await fetch(intent.uploadUrl, {
                method: "POST",
                body: form,
                redirect: "error",
              });
              if (!result.ok)
                throw new Error("Storage upload was not confirmed.");
              uploaded = true;
              const complete = await post(
                `/api/claims/${claimId}/documents/${intent.documentId}/complete`,
                {},
              );
              setMessage(
                `Upload verified. Recorded status: ${complete.status}; scan: ${complete.scanStatus}. This does not confirm a clean scan.`,
              );
              window.dispatchEvent(new Event("agentshield:claims-changed"));
            } catch (failure) {
              setMessage(
                `${uploaded ? "File uploaded, but processing confirmation failed. Do not upload it again automatically. " : ""}${failure instanceof Error ? failure.message : "Upload not confirmed."}`,
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <label htmlFor={`upload-${claimId}`}>Upload PDF, PNG or JPEG</label>
          <input
            id={`upload-${claimId}`}
            name="document"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            required
            disabled={pending}
          />
          <p className="dim">
            Uploading stores a real document and may incur scanning charges.
            Scan processing depends on the configured AWS event flow.
          </p>
          <button className="btn" disabled={pending}>
            {pending ? "Uploading…" : "Upload document"}
          </button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
      <div className="acts">
        <button
          className="btn"
          disabled={loading}
          onClick={() => void refresh()}
        >
          Refresh documents
        </button>
        {cursor && (
          <button className="btn" onClick={() => setCursor(null)}>
            First document page
          </button>
        )}
        {data?.nextToken && (
          <button className="btn" onClick={() => setCursor(data.nextToken)}>
            Next document page
          </button>
        )}
      </div>
      {loading && <p role="status">Loading document evidence…</p>}
      {error && <p role="alert">{error}</p>}
      {updated && (
        <p className="dim">
          Last successful read: <ClaimTime value={updated} />
        </p>
      )}
      {data && !data.documents.length && (
        <p>No document records returned on this page.</p>
      )}
      {data?.documents.map((doc) => (
        <details className="inc" key={doc.documentId}>
          <summary>
            {doc.fileName ?? doc.documentId} · {doc.status}
          </summary>
          <div className="pane">
            <dl className="kv">
              <dt>Document</dt>
              <dd>{doc.documentId}</dd>
              <dt>Scan result</dt>
              <dd>{doc.scanStatus}</dd>
              <dt>Workflow status</dt>
              <dd>{doc.status}</dd>
              <dt>Verified quarantine copy</dt>
              <dd>
                {doc.quarantineCopyVerified === undefined
                  ? "Not recorded"
                  : String(doc.quarantineCopyVerified)}
              </dd>
              <dt>Source isolation pending</dt>
              <dd>
                {doc.sourceIsolationPending === undefined
                  ? "Not recorded"
                  : String(doc.sourceIsolationPending)}
              </dd>
            </dl>
            {doc.scanCompletedAt && (
              <p>
                Scan recorded: <ClaimTime value={doc.scanCompletedAt} />
              </p>
            )}
            {doc.quarantineCopiedAt && (
              <p>
                Copy recorded: <ClaimTime value={doc.quarantineCopiedAt} />
              </p>
            )}
            {doc.sourceIsolatedAt && (
              <p>
                Isolation recorded: <ClaimTime value={doc.sourceIsolatedAt} />
              </p>
            )}
            <p className="dim">
              Threat detection, quarantine copying and source isolation are
              separate recorded outcomes. No download access is provided.
            </p>
          </div>
        </details>
      ))}
    </section>
  );
}
