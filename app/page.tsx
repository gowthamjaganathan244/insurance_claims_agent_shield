import Link from "next/link";
import { commandEvents } from "@/lib/data";
import { Storyline } from "@/components/storyline";
import { CommandAnalysis } from "@/components/command-analysis";
import type { Style } from "@/lib/types";
const pipeline = [
  ["Intake", 388, "ok", "Healthy"],
  ["Security", 1204, "ok", "Healthy"],
  ["Assessment", 842, "warn", "41 held"],
  ["Decision", 1096, "ok", "Healthy"],
  ["Payment", 512, "warn", "23 retrying"],
  ["Comms", 176, "ok", "Healthy"],
] as const;
export default function CommandPage() {
  return (
    <main id="app" tabIndex={-1}>
      <section className="hero">
        <h1 className="entrance">
          <span>4,218</span> claims
          <br />
          <em>in motion.</em>
        </h1>
        <Link prefetch={false} className="need lq entrance" href="/claims">
          <i className="dot warn p" aria-hidden="true" />
          <b>37</b>
          <span>need human attention</span>
        </Link>
        <div className="pipe lq entrance" aria-label="Claims processing flow">
          {pipeline.map(([label, count, tone, status], index) => (
            <div
              key={label}
              className={`stg ${tone}`}
              style={
                {
                  "--d": `${tone === "warn" ? 7.5 : 3.6 + 0.3 * index}s`,
                  "--dl": `${-0.7 * index}s`,
                } as Style
              }
            >
              <div className="trk" aria-hidden="true" />
              <b>{count.toLocaleString("en-AU")}</b>
              <span>
                <i className={`dot ${tone}`} aria-hidden="true" />
                {label}
              </span>
              <small>{status}</small>
            </div>
          ))}
        </div>
        <p className="cap">
          Claims move left to right. Amber means a stage is slowed or holding
          claims.
        </p>
      </section>
      <section className="sec">
        <div className="sec-h">
          <h2>Operational storyline</h2>
          <p className="lede">
            CLM-48213, Marlow &amp; Co. Fabrication. What AgentShield saw,
            minute by minute.
          </p>
        </div>
        <div className="stw">
          <Storyline events={commandEvents} />
          <div className="sticky">
            <CommandAnalysis />
          </div>
        </div>
      </section>
      <p className="cap" style={{ marginTop: 64 }}>
        Slow API calls can hold claims too.{" "}
        <Link prefetch={false} className="tag acc" href="/reliability">
          See the impact on claims
        </Link>
      </p>
    </main>
  );
}
