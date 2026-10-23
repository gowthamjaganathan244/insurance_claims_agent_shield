"use client";
import { useState } from "react";
import { useLiveClaims } from "./use-live-claims";
import { ClaimTime } from "./live-claim-panel";
import { Alert, DataState, Kpis, Pill } from "./ui";
interface OperationData {
  version: number;
  canOperate: boolean;
  assessment: Record<string, unknown> | null;
  decision: Record<string, unknown> | null;
  payment: Record<string, unknown> | null;
  events: {
    eventId: string;
    action: string;
    createdAt: string;
    details: Record<string, unknown>;
  }[];
  nextToken: string | null;
}
export type OperationsView =
  "assessment" | "approvals" | "payments" | "activity" | "email";
const viewActions: Record<OperationsView, [string, string][]> = {
  assessment: [["assessment", "Record human assessment"]],
  approvals: [["decision", "Record approval/rejection"]],
  payments: [
    ["payment", "Record payment workflow (no transfer)"],
    ["reconciliation", "Record manual reconciliation"],
  ],
  activity: [],
  email: [["email", "Send approved claim email"]],
};
const viewEvents: Record<OperationsView, (action: string) => boolean> = {
  assessment: (a) => a === "assessment",
  approvals: (a) => a === "decision",
  payments: (a) => a === "payment" || a === "reconciliation",
  activity: () => true,
  email: (a) => a.startsWith("email"),
};
const actionLabels: Record<string, string> = {
  assessment: "Assessment recorded",
  decision: "Decision recorded",
  payment: "Payment record created",
  reconciliation: "Reconciliation recorded",
  email: "Email attempt",
  email_delivery: "Email provider event",
};
const aud = (minor: unknown) =>
  (Number(minor) / 100).toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
  });
export function ClaimOperations({
  claimId,
  view = "activity",
  communicationsOnly = false,
}: {
  claimId: string;
  view?: OperationsView;
  /** @deprecated use view="email" */
  communicationsOnly?: boolean;
}) {
  const mode: OperationsView = communicationsOnly ? "email" : view;
  const [cursor, setCursor] = useState<string | null>(null);
  const { data, error, loading, updated, refresh } =
    useLiveClaims<OperationData>(
      `/api/claims/${claimId}/operations${cursor ? `?nextToken=${encodeURIComponent(cursor)}` : ""}`,
      undefined,
      60000,
    );
  const actions = viewActions[mode];
  const [chosen, setChosen] = useState<string | null>(null);
  const action =
    chosen && actions.some(([value]) => value === chosen)
      ? chosen
      : actions[0]?.[0];
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const events = data?.events.filter((item) => viewEvents[mode](item.action));
  return (
    <div className="ops">
      <div className="ops-bar">
        <p className="dim sm" role="status">
          {loading
            ? "Loading records…"
            : updated
              ? "Records loaded"
              : "Records unavailable"}
          {updated && (
            <>
              {" "}
              · Last read <ClaimTime value={updated} />
            </>
          )}
        </p>
        <button
          className="btn"
          disabled={loading}
          onClick={() => void refresh()}
        >
          Refresh
        </button>
      </div>
      <DataState loading={loading && !data} error={error} />
      {data && (
        <>
          <Summary mode={mode} data={data} />
          {actions.length > 0 &&
            (data.canOperate ? (
              <form
                className="pane record-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (pending || !action) return;
                  setPending(true);
                  setMessage("");
                  const fields = new FormData(event.currentTarget);
                  try {
                    const csrfResponse = await fetch("/api/auth/csrf", {
                      cache: "no-store",
                    });
                    if (!csrfResponse.ok)
                      throw new Error("Secure form unavailable.");
                    const { csrfToken } = await csrfResponse.json();
                    const amountText = String(fields.get("amount") ?? "");
                    const parts = amountText.split(".");
                    const cents = /^\d+(\.\d{1,2})?$/.test(amountText)
                      ? Number(parts[0]) * 100 +
                        Number((parts[1] ?? "").padEnd(2, "0"))
                      : 0;
                    const picked = fields.getAll("evidence").map(String);
                    const body = {
                      action,
                      version: data.version,
                      requestId: crypto.randomUUID(),
                      note: fields.get("note"),
                      documentIds: picked.length
                        ? picked
                        : String(fields.get("documents") ?? "")
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                      outcome: fields.get("outcome"),
                      amountMinor: cents,
                      reference: fields.get("reference"),
                      confirmEmail: fields.get("confirmEmail") === "on",
                    };
                    const response = await fetch(
                      `/api/claims/${claimId}/operations`,
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          "X-CSRF-Token": csrfToken,
                        },
                        body: JSON.stringify(body),
                      },
                    );
                    const result = await response.json();
                    if (!response.ok)
                      throw new Error(
                        result.error ?? "Action was not confirmed.",
                      );
                    setMessage(result.warning ?? "Action recorded.");
                    void refresh();
                    window.dispatchEvent(
                      new Event("agentshield:claims-changed"),
                    );
                  } catch (failure) {
                    setMessage(
                      `${failure instanceof Error ? failure.message : "Action not confirmed."} Refresh history before resubmitting.`,
                    );
                  } finally {
                    setPending(false);
                  }
                }}
              >
                {actions.length > 1 ? (
                  <>
                    <label htmlFor={`operation-action-${mode}`}>Action</label>
                    <select
                      id={`operation-action-${mode}`}
                      name="action"
                      value={action}
                      onChange={(event) => setChosen(event.target.value)}
                      disabled={pending}
                    >
                      {actions.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <h3>{actions[0][1]}</h3>
                )}
                <label htmlFor={`operation-note-${mode}`}>
                  Reason / evidence note
                </label>
                <textarea
                  id={`operation-note-${mode}`}
                  name="note"
                  required
                  maxLength={2000}
                  disabled={pending}
                />
                {action === "assessment" && (
                  <EvidencePicker claimId={claimId} disabled={pending} />
                )}
                {(action === "decision" || action === "reconciliation") && (
                  <>
                    <label htmlFor={`operation-outcome-${mode}`}>
                      {action === "decision"
                        ? "Decision outcome"
                        : "Reconciliation outcome"}
                    </label>
                    <select
                      id={`operation-outcome-${mode}`}
                      name="outcome"
                      disabled={pending}
                    >
                      {(action === "decision"
                        ? ["APPROVED", "REJECTED"]
                        : ["MATCHED", "DISCREPANCY"]
                      ).map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </>
                )}
                {action === "payment" && (
                  <>
                    <label htmlFor="operation-amount">
                      Payment record amount (AUD)
                    </label>
                    <input
                      id="operation-amount"
                      name="amount"
                      inputMode="decimal"
                      pattern="\d+(\.\d{1,2})?"
                      required
                      disabled={pending}
                    />
                    <label htmlFor="operation-reference">
                      Payment record reference
                    </label>
                    <input
                      id="operation-reference"
                      name="reference"
                      maxLength={128}
                      required
                      disabled={pending}
                    />
                  </>
                )}
                {action === "email" && (
                  <label>
                    <input
                      type="checkbox"
                      name="confirmEmail"
                      required
                      disabled={pending}
                    />{" "}
                    I confirm sending a real email to the configured, verified
                    test recipient.
                  </label>
                )}
                <button className="btn ok" disabled={pending}>
                  {pending ? "Recording…" : "Submit recorded action"}
                </button>
              </form>
            ) : (
              <Alert>
                Only explicitly authorised operators can record assessments,
                decisions, payment records or email actions.
              </Alert>
            ))}
          {message && (
            <Alert tone={message === "Action recorded." ? "ok" : "warn"}>
              {message}
            </Alert>
          )}
          <h3>
            {mode === "email"
              ? "Email history"
              : mode === "activity"
                ? "Audit history"
                : "History"}
          </h3>
          {!events?.length && (
            <p className="dim">No recorded events on this page.</p>
          )}
          <ol className="timeline">
            {events?.map((item) => (
              <li key={item.eventId}>
                <b>{actionLabels[item.action] ?? item.action}</b>{" "}
                <ClaimTime value={item.createdAt} />
                {Boolean(item.details.outcome) && (
                  <Pill
                    tone={
                      ["APPROVED", "MATCHED"].includes(
                        String(item.details.outcome),
                      )
                        ? "ok"
                        : "warn"
                    }
                  >
                    {String(item.details.outcome)}
                  </Pill>
                )}
                <p>
                  {String(
                    item.details.note ?? item.details.providerEvent ?? "",
                  )}
                </p>
                {item.action === "email" && (
                  <p className="dim sm">
                    Email state: {String(item.details.status)}. SES acceptance
                    is not delivery confirmation.
                  </p>
                )}
              </li>
            ))}
          </ol>
          <div className="acts">
            {cursor && (
              <button className="btn" onClick={() => setCursor(null)}>
                Latest events
              </button>
            )}
            {data.nextToken && (
              <button className="btn" onClick={() => setCursor(data.nextToken)}>
                Older events
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
function Summary({
  mode,
  data,
}: {
  mode: OperationsView;
  data: OperationData;
}) {
  if (mode === "assessment")
    return (
      <>
        <Kpis
          items={[
            {
              label: "Assessment",
              value: data.assessment ? "Recorded" : "Not recorded",
              tone: data.assessment ? "ok" : undefined,
            },
            {
              label: "Evidence documents",
              value: Array.isArray(data.assessment?.documentIds)
                ? (data.assessment.documentIds as unknown[]).length
                : data.assessment
                  ? null
                  : 0,
            },
            {
              label: "Automated risk score",
              value: "Not configured",
              hint: "No approved scoring rules; no score is inferred.",
            },
          ]}
        />
        {data.assessment && (
          <p>Assessment note: {String(data.assessment.note)}</p>
        )}
      </>
    );
  if (mode === "approvals")
    return (
      <Kpis
        items={[
          {
            label: "Decision",
            value: String(data.decision?.outcome ?? "Not recorded"),
            tone:
              data.decision?.outcome === "APPROVED"
                ? "ok"
                : data.decision?.outcome === "REJECTED"
                  ? "bad"
                  : undefined,
          },
          {
            label: "Prerequisite",
            value: data.assessment
              ? "Assessment recorded"
              : "Assessment needed",
            tone: data.assessment ? "ok" : "warn",
          },
        ]}
      />
    );
  if (mode === "payments")
    return (
      <>
        <Kpis
          items={[
            {
              label: "Payment record",
              value: String(data.payment?.status ?? "Not recorded"),
            },
            {
              label: "Reconciliation",
              value: data.payment
                ? String(data.payment.reconciliation ?? "UNRECONCILED")
                : null,
            },
            {
              label: "Prerequisite",
              value:
                data.decision?.outcome === "APPROVED"
                  ? "Claim approved"
                  : "Approval needed",
              tone: data.decision?.outcome === "APPROVED" ? "ok" : "warn",
            },
          ]}
        />
        {data.payment && (
          <p>
            Recorded amount: {aud(data.payment.amountMinor)}. No money
            transferred by AgentShield.
          </p>
        )}
      </>
    );
  return null;
}
type DocumentOption = {
  documentId: string;
  fileName?: string;
  scanStatus: string;
};
function EvidencePicker({
  claimId,
  disabled,
}: {
  claimId: string;
  disabled: boolean;
}) {
  const { data, error, loading } = useLiveClaims<{
    documents: DocumentOption[];
  }>(`/api/claims/${claimId}/documents`, undefined, 240000);
  if (data?.documents.length)
    return (
      <fieldset className="evidence">
        <legend>Evidence documents (choose 1–5)</legend>
        {data.documents.map((doc) => (
          <label key={doc.documentId}>
            <input
              type="checkbox"
              name="evidence"
              value={doc.documentId}
              disabled={disabled}
            />{" "}
            {doc.fileName ?? doc.documentId}{" "}
            <span className="dim sm">· scan {doc.scanStatus}</span>
          </label>
        ))}
      </fieldset>
    );
  return (
    <>
      <label htmlFor="operation-documents">
        Assessment document IDs (1–5, comma separated)
      </label>
      <input
        id="operation-documents"
        name="documents"
        required
        disabled={disabled}
      />
      <p className="dim sm">
        {loading
          ? "Loading claim documents…"
          : error
            ? `Documents could not be listed (${error}). Enter IDs manually.`
            : "No documents were returned for this claim."}
      </p>
    </>
  );
}
