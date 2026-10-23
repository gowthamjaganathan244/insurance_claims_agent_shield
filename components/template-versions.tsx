"use client";
import { useState } from "react";
import { useLiveClaims } from "./use-live-claims";
import { ClaimTime } from "./live-claim-panel";
import { Alert, DataState, Kpis, Pill } from "./ui";
import { reviewTemplate } from "@/lib/template-review";
type Version = {
  number: number;
  status: "IMPORTED" | "DRAFT" | "APPROVED" | "REJECTED" | "SUPERSEDED";
  source: "SES_CURRENT" | "OPERATOR_DRAFT";
  subject: string;
  text: string;
  html: string;
  note: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  selfApproved: boolean;
  authoredByYou: boolean;
};
type History = {
  stateVersion: number;
  latest: number;
  approved: number | null;
  versions: Version[];
  events: {
    eventId: string;
    action: string;
    createdAt: string;
    details: Record<string, unknown>;
    byYou: boolean;
  }[];
};
const tone = (status: Version["status"]) =>
  status === "APPROVED"
    ? "ok"
    : status === "DRAFT"
      ? "acc"
      : status === "REJECTED"
        ? "bad"
        : "mut";
const actionLabel: Record<string, string> = {
  template_import: "Imported current SES template",
  template_draft: "Draft proposed",
  template_approve: "Draft approved",
  template_reject: "Draft rejected",
};
export function TemplateVersions({
  current,
}: {
  current?: { subject: string; text: string; html: string };
}) {
  const { data, error, loading, refresh } = useLiveClaims<History>(
    "/api/operations/templates/versions",
    undefined,
    120000,
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [drafting, setDrafting] = useState(false);
  const base = data?.versions[0] ?? current;
  const [draft, setDraft] = useState<{
    subject: string;
    text: string;
    html: string;
  } | null>(null);
  const editing =
    draft ??
    (base ? { subject: base.subject, text: base.text, html: base.html } : null);
  const findings = editing
    ? reviewTemplate(editing).filter((f) => !f.passed)
    : [];
  async function send(body: Record<string, unknown>) {
    if (!data || pending) return;
    setPending(true);
    setMessage("");
    try {
      const csrf = await fetch("/api/auth/csrf", { cache: "no-store" });
      if (!csrf.ok) throw new Error("Secure form unavailable.");
      const { csrfToken } = await csrf.json();
      const response = await fetch("/api/operations/templates/versions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({
          ...body,
          stateVersion: data.stateVersion,
          requestId: crypto.randomUUID(),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Action was not confirmed.");
      setMessage("Recorded.");
      setDrafting(false);
      setDraft(null);
      void refresh();
    } catch (failure) {
      setMessage(
        `${failure instanceof Error ? failure.message : "Action not confirmed."} Refresh before retrying.`,
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="template-versions">
      <DataState
        loading={loading && !data}
        error={error}
        loadingText="Loading template history…"
      />
      {data && (
        <>
          <Kpis
            items={[
              {
                label: "Approved version",
                value: data.approved ? `v${data.approved}` : "None",
                tone: data.approved ? "ok" : undefined,
              },
              { label: "Versions recorded", value: data.latest },
              {
                label: "Published to SES",
                value: "No",
                hint: "Approval is recorded only; the live SES template is unchanged.",
              },
            ]}
          />
          <div className="acts">
            <button
              className="btn"
              disabled={pending}
              onClick={() =>
                void send({
                  action: "import",
                  note: "Snapshot of the current SES template",
                })
              }
            >
              Import current SES template
            </button>
            <button
              className="btn ok"
              disabled={pending || !editing}
              onClick={() => setDrafting((value) => !value)}
              aria-expanded={drafting}
            >
              Propose draft
            </button>
            <button
              className="btn"
              disabled={loading}
              onClick={() => void refresh()}
            >
              Refresh
            </button>
          </div>
          {drafting && editing && (
            <form
              className="pane record-form"
              onSubmit={(event) => {
                event.preventDefault();
                const note = String(
                  new FormData(event.currentTarget).get("note") ?? "",
                );
                void send({ action: "draft", note, ...editing });
              }}
            >
              <label htmlFor="draft-subject">Subject</label>
              <input
                id="draft-subject"
                value={editing.subject}
                maxLength={200}
                required
                onChange={(e) =>
                  setDraft({ ...editing, subject: e.target.value })
                }
              />
              <label htmlFor="draft-text">Plain text</label>
              <textarea
                id="draft-text"
                value={editing.text}
                maxLength={20000}
                onChange={(e) => setDraft({ ...editing, text: e.target.value })}
              />
              <label htmlFor="draft-html">
                HTML (stored as text, never rendered here)
              </label>
              <textarea
                id="draft-html"
                value={editing.html}
                maxLength={40000}
                onChange={(e) => setDraft({ ...editing, html: e.target.value })}
              />
              <p className="dim sm" role="status">
                Content checks:{" "}
                {findings.length
                  ? `${findings.length} to improve (${findings.map((f) => f.title).join(", ")})`
                  : "no issues found"}
              </p>
              <label htmlFor="draft-note">Reason for change</label>
              <textarea id="draft-note" name="note" required maxLength={2000} />
              <button className="btn ok" disabled={pending}>
                {pending ? "Recording…" : "Record draft"}
              </button>
            </form>
          )}
          {message && (
            <Alert tone={message === "Recorded." ? "ok" : "warn"}>
              {message}
            </Alert>
          )}
          {!data.versions.length ? (
            <p className="dim empty">
              No versions recorded yet. Import the current SES template to start
              the history.
            </p>
          ) : (
            <table className="tbl">
              <caption className="sr-only">
                Template versions, newest first
              </caption>
              <thead>
                <tr>
                  <th scope="col">Version</th>
                  <th scope="col">Status</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Recorded</th>
                  <th scope="col">
                    <span className="sr-only">Review</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.versions.map((v) => (
                  <tr key={v.number}>
                    <td>
                      v{v.number}
                      <small className="dim">
                        {" "}
                        {v.source === "SES_CURRENT" ? "from SES" : "draft"}
                        {v.authoredByYou ? " · by you" : ""}
                      </small>
                    </td>
                    <td>
                      <Pill tone={tone(v.status)}>{v.status}</Pill>
                      {v.status === "APPROVED" && v.selfApproved && (
                        <small className="dim"> self-approved</small>
                      )}
                    </td>
                    <td>{v.subject}</td>
                    <td>
                      <ClaimTime value={v.createdAt} />
                    </td>
                    <td>
                      {v.status === "DRAFT" && (
                        <span className="acts">
                          <button
                            className="btn sm-btn ok"
                            disabled={pending}
                            onClick={() =>
                              void send({
                                action: "approve",
                                number: v.number,
                                note: `Approved v${v.number}`,
                              })
                            }
                          >
                            Approve v{v.number}
                          </button>
                          <button
                            className="btn sm-btn"
                            disabled={pending}
                            onClick={() =>
                              void send({
                                action: "reject",
                                number: v.number,
                                note: `Rejected v${v.number}`,
                              })
                            }
                          >
                            Reject
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h3>Template audit history</h3>
          {!data.events.length && (
            <p className="dim">No template events recorded.</p>
          )}
          <ol className="timeline">
            {data.events.map((e) => (
              <li key={e.eventId}>
                <b>{actionLabel[e.action] ?? e.action}</b>{" "}
                {typeof e.details.number === "number" &&
                  `v${e.details.number} `}
                <ClaimTime value={e.createdAt} />
                {e.byYou && <span className="dim sm"> · you</span>}
                {typeof e.details.note === "string" && <p>{e.details.note}</p>}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
