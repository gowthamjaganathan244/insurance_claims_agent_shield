"use client";
import { useState } from "react";
import { useLiveClaims } from "./use-live-claims";
import { ClaimTime } from "./live-claim-panel";
import { ClaimOperations } from "./claim-operations";
import type { ClaimsPageData } from "@/lib/live-claims";
import { Tabs } from "./tabs";
import { reviewTemplate } from "@/lib/template-review";
import { Alert, Pill } from "./ui";
import { TemplateVersions } from "./template-versions";
function Modernisation({
  template,
}: {
  template: { subject: string; text: string; html: string };
}) {
  const findings = reviewTemplate(template);
  const open = findings.filter((f) => !f.passed).length;
  return (
    <>
      <h3>
        {open
          ? `${open} improvement${open === 1 ? "" : "s"} suggested`
          : "No issues found by the rule checks"}
      </h3>
      <p className="dim sm">
        Rule-based checks of the stored SES content. Nothing is rewritten or
        published from this page; SES keeps only the current template version.
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th scope="col">Check</th>
            <th scope="col">Result</th>
            <th scope="col">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => (
            <tr key={f.id}>
              <td>{f.title}</td>
              <td>
                <Pill tone={f.passed ? "ok" : "warn"}>
                  {f.passed ? "Pass" : "Improve"}
                </Pill>
              </td>
              <td className="dim">{f.evidence}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
export function Communications({ connected = false }: { connected?: boolean }) {
  return connected ? <LiveCommunications /> : <UnavailableCommunications />;
}
function UnavailableCommunications() {
  const [tab, setTab] = useState(0);
  return (
    <div className="comm-card">
      <div className="comm-bar">
        <p className="dim sm" role="status">
          Email templates: not connected. No template content has been loaded.
        </p>
      </div>
      <div className="glass lq">
        <Tabs
          label="Email data availability"
          labels={[
            "Preview",
            "Variables",
            "Version history",
            "Delivery status",
            "Audit trail",
          ]}
          active={tab}
          onChange={setTab}
        >
          {tab === 0 && (
            <>
              <h3>Template preview unavailable</h3>
              <p className="dim">
                Template reading and editing are not connected.
              </p>
            </>
          )}
          {tab === 1 && (
            <p className="dim">
              Template variables unavailable until the stored template is
              retrieved.
            </p>
          )}
          {tab === 2 && (
            <p className="dim">
              Content review needs the stored template, which is not connected.
            </p>
          )}
          {tab === 3 && (
            <>
              <h3>Delivery tracking not configured</h3>
              <p className="dim">
                No SES configuration sets were found in the supplied inventory.
                Current configuration has not been refreshed. Sent, delivered,
                bounced and complaint counts are unavailable.
              </p>
            </>
          )}
          {tab === 4 && (
            <p className="dim">
              Message activity and audit history not connected.
            </p>
          )}
        </Tabs>
      </div>
    </div>
  );
}

function LiveCommunications() {
  const [tab, setTab] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const templates = useLiveClaims<{
    templates: { name: string; subject: string; text: string; html: string }[];
    deliveryTrackingConfigured: boolean;
  }>("/api/operations/templates", undefined, 240000);
  const claims = useLiveClaims<ClaimsPageData>(
    `/api/claims${cursor ? `?nextToken=${encodeURIComponent(cursor)}` : ""}`,
    undefined,
    60000,
  );
  const template = templates.data?.templates[0];
  const claimId = claims.data?.claims.some((c) => c.claimId === selected)
    ? selected
    : claims.data?.claims[0]?.claimId;
  const variables = template
    ? [
        ...new Set(
          [template.subject, template.text, template.html]
            .join("\n")
            .match(/{{[^{}]+}}/g) ?? [],
        ),
      ]
    : [];
  return (
    <>
      <div className="comm-bar">
        <p className="dim sm" role="status">
          {template ? (
            <>
              <b className="comm-name">{template.name}</b> · stored SES template
            </>
          ) : templates.loading ? (
            "Loading SES template…"
          ) : (
            "Template unavailable"
          )}
          {templates.updated && (
            <>
              {" "}
              · Last read <ClaimTime value={templates.updated} />
            </>
          )}
        </p>
        <button
          className="btn"
          disabled={templates.loading}
          onClick={() => void templates.refresh()}
        >
          Refresh templates
        </button>
      </div>
      {templates.error && <Alert tone="bad">{templates.error}</Alert>}
      <div className="comm-card">
        <div className="glass lq">
          <Tabs
            label="Email data availability"
            labels={[
              "Preview",
              "Variables",
              "Content modernisation",
              "Versions & approval",
              "Delivery status",
              "Audit trail",
            ]}
            active={tab}
            onChange={setTab}
          >
            {tab === 0 &&
              (template ? (
                <>
                  <h3>{template.subject}</h3>
                  <pre
                    style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                  >
                    {template.text || template.html}
                  </pre>
                  <p className="dim">
                    Stored SES content, shown as text. Template HTML is never
                    executed.
                  </p>
                </>
              ) : (
                <p>Template preview unavailable</p>
              ))}
            {tab === 1 &&
              (template ? (
                <p>
                  {variables.join(", ") ||
                    "No variable placeholders found in this template."}
                </p>
              ) : (
                <p>Template variables unavailable</p>
              ))}
            {tab === 2 &&
              (template ? (
                <Modernisation template={template} />
              ) : (
                <p>Content review unavailable until the template loads.</p>
              ))}
            {tab === 3 && <TemplateVersions current={template} />}
            {tab === 4 && (
              <>
                <h3>
                  {templates.data
                    ? templates.data.deliveryTrackingConfigured
                      ? "Delivery event recording configured"
                      : "Delivery tracking not configured"
                    : "Delivery tracking configuration unavailable"}
                </h3>
                <p>
                  Only persisted SES events for your selected claim appear
                  below. SES acceptance does not establish delivery. Historical
                  emails sent by the existing claims service are unavailable
                  here unless separately recorded.
                </p>
              </>
            )}
            {tab === 5 && (
              <p>
                Read the selected claim’s persisted email events below. No
                synthetic message statistics are calculated.
              </p>
            )}
          </Tabs>
        </div>
      </div>
      <section className="sec">
        <h2>Claim email activity</h2>
        <p className="dim">
          Persisted send attempts and SES provider events for one of your
          claims. SES accepting a message is not the same as inbox delivery.
        </p>
        {claims.error && <Alert tone="bad">{claims.error}</Alert>}
        <div className="picker">
          <div className="picker-field">
            <label htmlFor="communication-claim">Claim</label>
            <select
              className="claim-selector"
              id="communication-claim"
              value={claimId ?? ""}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="" disabled>
                {claims.loading ? "Loading claims…" : "Select a claim"}
              </option>
              {claims.data?.claims.map((claim) => (
                <option key={claim.claimId} value={claim.claimId}>
                  {claim.policyNumber} · {claim.claimId}
                </option>
              ))}
            </select>
          </div>
          <div className="acts">
            <button
              className="btn"
              disabled={claims.loading}
              onClick={() => void claims.refresh()}
            >
              Refresh claims
            </button>
            {cursor && (
              <button className="btn" onClick={() => setCursor(null)}>
                First claims page
              </button>
            )}
            {claims.data?.nextToken && (
              <button
                className="btn"
                onClick={() => setCursor(claims.data!.nextToken)}
              >
                Next claims page
              </button>
            )}
          </div>
        </div>
        {claims.data && !claims.data.claims.length && (
          <p>No authorised claims returned.</p>
        )}
        {claimId && (
          <ClaimOperations key={claimId} claimId={claimId} communicationsOnly />
        )}
      </section>
    </>
  );
}
