import { requireSession } from "@/lib/auth/session";
import Link from "next/link";
export default async function CommandPage() {
  await requireSession();
  return (
    <main id="app" tabIndex={-1}>
      <section className="hero">
        <h1 className="entrance">
          Claims
          <br />
          <em>overview.</em>
        </h1>
        <Link prefetch={false} className="need lq entrance" href="/claims">
          <span>View your claims</span>
        </Link>
        <div
          className="pipe lq entrance"
          aria-label="Operational data availability"
        >
          {[
            "Intake",
            "Security",
            "Assessment",
            "Decision",
            "Payment",
            "Comms",
          ].map((label) => (
            <div className="stg" key={label}>
              <b aria-label="Unavailable">—</b>
              <span>{label}</span>
              <small>Not connected</small>
            </div>
          ))}
        </div>
        <p className="cap">
          Operational aggregates are not connected. No total is inferred from a
          page of claims.
        </p>
      </section>
      <section className="sec">
        <div className="sec-h">
          <h2>Claim totals and statuses</h2>
          <p className="lede">Metrics unavailable</p>
        </div>
        <div className="pane">
          <p>
            Account-wide counts are not available yet. Open Claims to view
            authorised records and their recorded statuses.
          </p>
          <Link prefetch={false} className="tag acc" href="/claims">
            Open Claims
          </Link>
        </div>
      </section>
      <section className="sec">
        <div className="sec-h">
          <h2>Operational storyline</h2>
          <p className="lede">Activity feed not connected</p>
        </div>
        <div className="pane">
          <p className="dim">
            No operational history has been loaded. Investigation, risk and
            payment information is unavailable.
          </p>
        </div>
      </section>
      <p className="cap" style={{ marginTop: 64 }}>
        <Link prefetch={false} className="tag acc" href="/reliability">
          View monitoring availability
        </Link>
      </p>
    </main>
  );
}
