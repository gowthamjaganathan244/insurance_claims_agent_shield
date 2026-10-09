import { stages } from "@/lib/data";
import { isHeld } from "@/lib/claims";
import type { Claim } from "@/lib/types";
export function Journey({ claim }: { claim: Claim }) {
  const held = isHeld(claim);
  const stage = claim.status === "Approved" ? 6 : held ? 2 : 3;
  return (
    <div className="jy" role="list" aria-label="Claim journey">
      {stages.map((name, index) => (
        <div
          key={name}
          role="listitem"
          className={`js ${index < stage ? "done" : index === stage ? "cur" : "next"} ${held && index === 2 ? "hold" : ""}`}
        >
          <i className="jn" aria-hidden="true" />
          <b>{name}</b>
          <span>
            {held && index === 2
              ? "Held"
              : index < stage
                ? "Complete"
                : index === stage
                  ? "In progress"
                  : "Waiting"}
          </span>
          {held && index === 2 && (
            <div className="hd">
              <em>HELD</em>
              <div className="iv">
                AgentShield investigation
                <small>
                  {claim.status === "Escalated"
                    ? "Escalated to senior investigator"
                    : "Correlating evidence"}
                </small>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
