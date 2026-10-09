"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useClaims } from "./claim-store";
import { StatusTag } from "./ui";
import { Journey } from "./journey";
import { Analysis } from "./analysis";
import { Storyline } from "./storyline";
import { Tabs } from "./tabs";
import { aud, claimEvents, isHeld, riskColor, severity } from "@/lib/claims";
import { incidents, scanLabels, scanEvidence } from "@/lib/data";
export function ClaimDetail({
  id,
  evidence = false,
}: {
  id: string;
  evidence?: boolean;
}) {
  const { claims, audit } = useClaims();
  const claim = claims.find((item) => item.id === id)!;
  const [tab, setTab] = useState(0);
  const [expanded, setExpanded] = useState<number[]>(
    evidence
      ? [
          Math.max(
            0,
            claim.docs.findIndex((doc) => doc.s === "mal" || doc.s === "sus"),
          ),
        ]
      : [],
  );
  const documents = useRef<HTMLElement>(null);
  const held = isHeld(claim);
  const events = [...claimEvents(claim), ...(audit[id] ?? [])];
  const linked = incidents.filter((incident) => incident.claim === id);
  function reviewEvidence() {
    setTab(0);
    setExpanded([
      Math.max(
        0,
        claim.docs.findIndex((doc) => doc.s === "mal" || doc.s === "sus"),
      ),
    ]);
    documents.current?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
        ? "auto"
        : "smooth",
      block: "center",
    });
    requestAnimationFrame(() =>
      documents.current
        ?.querySelector<HTMLButtonElement>('[aria-expanded="true"]')
        ?.focus({ preventScroll: true }),
    );
  }
  return (
    <>
      <Link prefetch={false} href="/claims" className="dim">
        Back to claims
      </Link>
      <div className="detail" style={{ marginTop: 20 }}>
        <div className="sticky">
          <p className="dim" style={{ margin: 0 }}>
            {claim.id}
          </p>
          <h1
            style={{ fontSize: "clamp(34px,5vw,60px)", margin: "6px 0 12px" }}
          >
            {claim.name}
          </h1>
          <StatusTag status={claim.status} />
          <dl className="kv">
            <dt>Claim type</dt>
            <dd>{claim.type}</dd>
            <dt>Exposure</dt>
            <dd>{aud(claim.amt)}</dd>
            <dt>Location</dt>
            <dd>{claim.loc}</dd>
            <dt>Stage</dt>
            <dd>
              {held
                ? "Security check, held"
                : claim.status === "Approved"
                  ? "Payment"
                  : "Assessment"}
            </dd>
            <dt>Risk</dt>
            <dd style={{ color: riskColor(claim.risk) }}>
              {severity(claim.risk)}, {claim.risk}/100
            </dd>
          </dl>
        </div>
        <div>
          <section>
            <h3 className="sh">Claim journey</h3>
            <Journey claim={claim} />
          </section>
          <section style={{ marginTop: 44 }}>
            <Analysis claim={claim} onEvidence={reviewEvidence} />
          </section>
          <section ref={documents} style={{ marginTop: 56 }}>
            <Tabs
              labels={[
                "Documents",
                "Storyline",
                "Decision and payment",
                "Incidents",
                "Audit",
              ]}
              active={tab}
              onChange={setTab}
              label="Investigation details"
            >
              {tab === 0 &&
                claim.docs.map((doc, index) => (
                  <div key={doc.n}>
                    <button
                      className="row document-summary"
                      aria-expanded={expanded.includes(index)}
                      aria-controls={`document-${index}`}
                      onClick={() =>
                        setExpanded((current) =>
                          current.includes(index)
                            ? current.filter((item) => item !== index)
                            : [...current, index],
                        )
                      }
                    >
                      <span className="t">{doc.n}</span>
                      <span className={`tag ${scanLabels[doc.s][1]}`}>
                        {scanLabels[doc.s][0]}
                      </span>
                    </button>
                    <div
                      className={`res ${expanded.includes(index) ? "open" : ""}`}
                      id={`document-${index}`}
                      inert={!expanded.includes(index)}
                      aria-hidden={!expanded.includes(index)}
                    >
                      <div>
                        <ul>
                          {scanEvidence[doc.s].map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              {tab === 1 && <Storyline events={events} />}
              {tab === 2 && (
                <div className="sg">
                  <div>
                    <b>Decision</b>
                    <p>
                      {claim.status === "Approved"
                        ? "Approved"
                        : held
                          ? "Pending, blocked by security hold"
                          : "Awaiting assessor"}
                    </p>
                  </div>
                  <div>
                    <b>Payment</b>
                    <p>
                      {claim.status === "Approved"
                        ? "Scheduled within 2 business days"
                        : held
                          ? `${aud(claim.amt)} on hold`
                          : "Not started"}
                    </p>
                  </div>
                </div>
              )}
              {tab === 3 &&
                (linked.length ? (
                  linked.map((incident) => (
                    <Link
                      prefetch={false}
                      className="row document-summary"
                      key={incident.id}
                      href={`/security#${incident.id}`}
                    >
                      <div>
                        <div className="t">{incident.t}</div>
                        <div className="s">
                          {incident.id}, {incident.when}
                        </div>
                      </div>
                      <span className={`tag ${incident.c}`}>
                        {incident.sev}
                      </span>
                    </Link>
                  ))
                ) : (
                  <p className="dim">No incidents linked to this claim.</p>
                ))}
              {tab === 4 &&
                events.map((event, index) => (
                  <div key={index} className="row audit-row">
                    <time className="dim sm">{event[0]}</time>
                    <span className="sm">{event[1]}</span>
                    <span className="dim sm">{event[4]}</span>
                  </div>
                ))}
            </Tabs>
          </section>
        </div>
      </div>
    </>
  );
}
