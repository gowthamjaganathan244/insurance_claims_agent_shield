"use client";
import { useState } from "react";
import type { LiveClaim } from "@/lib/live-claims";
export function ClaimTime({ value }: { value: string }) {
  return (
    <time dateTime={value}>
      {new Date(value).toLocaleString("en-AU", {
        timeZone: "Australia/Sydney",
        timeZoneName: "short",
      })}
    </time>
  );
}
export function LiveClaimPanel({
  claim,
  changed,
}: {
  claim: LiveClaim;
  changed: () => void;
}) {
  const [description, setDescription] = useState(claim.description);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function mutate(method: "PATCH" | "DELETE") {
    setPending(true);
    setError("");
    try {
      const csrf = await fetch("/api/auth/csrf", { cache: "no-store" });
      if (!csrf.ok) throw new Error("Reload the page to start a secure form.");
      const { csrfToken } = await csrf.json();
      const response = await fetch(
        `/api/claims/${encodeURIComponent(claim.claimId)}`,
        {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          body: JSON.stringify(method === "PATCH" ? { description } : {}),
          cache: "no-store",
        },
      );
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401) window.location.replace("/login");
        throw new Error(result.error ?? "Unable to update claim.");
      }
      setConfirm(false);
      changed();
      window.dispatchEvent(new Event("agentshield:claims-changed"));
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Unable to update claim.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <p className="dim sm" style={{ overflowWrap: "anywhere" }}>
        {claim.claimId}
      </p>
      <h2>{claim.policyNumber}</h2>
      <span className={`tag ${claim.status === "SUBMITTED" ? "acc" : "warn"}`}>
        {claim.status}
      </span>
      <dl className="kv">
        <dt>Claim type</dt>
        <dd>{claim.claimType}</dd>
        <dt>Created</dt>
        <dd>
          <ClaimTime value={claim.createdAt} />
        </dd>
        {claim.cancelledAt && (
          <>
            <dt>Cancelled</dt>
            <dd>
              <ClaimTime value={claim.cancelledAt} />
            </dd>
          </>
        )}
      </dl>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void mutate("PATCH");
        }}
      >
        <label htmlFor="claim-description">Description</label>
        <textarea
          id="claim-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          required
          disabled={pending || claim.status !== "SUBMITTED"}
          style={{ width: "100%", minHeight: 140 }}
        />
        {claim.status === "SUBMITTED" && (
          <div className="acts">
            <button
              className="btn ok"
              disabled={pending || description.trim() === claim.description}
            >
              Save description
            </button>
            <button
              className="btn warn"
              type="button"
              disabled={pending}
              onClick={() => setConfirm(true)}
            >
              Cancel claim
            </button>
          </div>
        )}
      </form>
      {confirm && (
        <div role="group" aria-label="Confirm claim cancellation">
          <p>
            Cancel this claim? The record will be retained and can no longer be
            edited.
          </p>
          <button
            className="btn warn"
            disabled={pending}
            onClick={() => void mutate("DELETE")}
          >
            Confirm cancellation
          </button>{" "}
          <button
            className="btn"
            disabled={pending}
            onClick={() => setConfirm(false)}
          >
            Keep claim
          </button>
        </div>
      )}
      {pending && <p role="status">Saving…</p>}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
