"use client";
import Link from "next/link";
import { useState } from "react";
import { useClaims } from "./claim-store";
import { StatusTag } from "./ui";
import { Journey } from "./journey";
import { Analysis } from "./analysis";
import { aud, claimEvents, riskColor } from "@/lib/claims";
import { scanLabels } from "@/lib/data";
import type { Claim } from "@/lib/types";
export function ClaimFacts({ claim }: { claim: Claim }) {
  return (
    <dl className="kv">
      <dt>Type</dt>
      <dd>{claim.type}</dd>
      <dt>Exposure</dt>
      <dd>{aud(claim.amt)}</dd>
      <dt>Location</dt>
      <dd>{claim.loc}</dd>
    </dl>
  );
}
export function ClaimsWorkspace() {
  const { claims } = useClaims();
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState("CLM-48213");
  const visible = claims
    .filter((claim) => filter === "All" || claim.status === filter)
    .sort((a, b) => b.risk - a.risk);
  const claim = visible.find((item) => item.id === selected) ?? visible[0];
  return (
    <>
      <div className="chips" role="group" aria-label="Filter claims">
        {["All", "Processing", "In review", "Escalated", "Approved"].map(
          (name) => (
            <button
              key={name}
              aria-pressed={filter === name}
              onClick={() => setFilter(name)}
            >
              {name}
            </button>
          ),
        )}
      </div>
      <div className="ws">
        <div className="queue">
          {visible.map((item) => (
            <Link
              prefetch={false}
              key={item.id}
              className="row"
              href={`/claim/${item.id}`}
              aria-current={item.id === claim?.id ? "true" : undefined}
              onClick={(event) => {
                if (
                  matchMedia("(min-width:1180px)").matches &&
                  !event.ctrlKey &&
                  !event.metaKey &&
                  !event.shiftKey &&
                  !event.altKey
                ) {
                  event.preventDefault();
                  setSelected(item.id);
                }
              }}
            >
              <div>
                <div className="t">{item.name}</div>
                <div className="s">
                  {item.id}, {item.type}, {item.loc}
                </div>
              </div>
              <div className="mid s">{aud(item.amt)}</div>
              <div className="row-status">
                <span aria-label={`Risk ${item.risk} out of 100`}>
                  <i className="rk" aria-hidden="true">
                    <i
                      style={{
                        width: `${item.risk}%`,
                        background: riskColor(item.risk),
                      }}
                    />
                  </i>
                  {item.risk}
                </span>
                <StatusTag status={item.status} />
              </div>
            </Link>
          ))}
          {!visible.length && (
            <p className="lede">No {filter.toLowerCase()} claims right now.</p>
          )}
        </div>
        {claim && (
          <>
            <div className="pane" key={claim.id}>
              <p className="dim sm" style={{ margin: 0 }}>
                {claim.id}
              </p>
              <h2 style={{ margin: "4px 0 12px" }}>{claim.name}</h2>
              <StatusTag status={claim.status} />
              <div style={{ margin: "26px 0" }}>
                <Journey claim={claim} />
              </div>
              <Analysis claim={claim} />
              <ClaimFacts claim={claim} />
              <div className="acts">
                <Link
                  prefetch={false}
                  className="btn ok"
                  href={`/claim/${claim.id}`}
                >
                  Open investigation
                </Link>
              </div>
            </div>
            <div className="pane">
              <h3 style={{ marginBottom: 18 }}>Security activity</h3>
              {claim.docs.map((doc) => (
                <div className="row document-summary" key={doc.n}>
                  <div className="t sm">{doc.n}</div>
                  <span className={`tag ${scanLabels[doc.s][1]}`}>
                    {scanLabels[doc.s][0]}
                  </span>
                </div>
              ))}
              <ul className="tl" style={{ marginTop: 26 }}>
                {claimEvents(claim)
                  .slice(-4)
                  .map((event, index) => (
                    <li key={index} className={event[3]}>
                      <b className="sm">{event[1]}</b>
                      <small>
                        {event[0]} AEST, {event[4]}
                      </small>
                    </li>
                  ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </>
  );
}
