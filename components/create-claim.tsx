"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
export function CreateClaim() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const close = () => {
    if (pending) return;
    dialog.current?.close();
  };
  return (
    <>
      <button
        ref={opener}
        type="button"
        className="btn ok"
        aria-haspopup="dialog"
        onClick={() => {
          setError("");
          dialog.current?.showModal();
        }}
      >
        New claim
      </button>
      <dialog
        ref={dialog}
        className="modal"
        aria-labelledby="new-claim-title"
        onClose={() =>
          // Run after the browser's own focus restoration (WebKit does not
          // focus a tapped button, so native restore can target <body>).
          requestAnimationFrame(() => opener.current?.focus())
        }
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <form
          className="record-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending) return;
            const form = new FormData(event.currentTarget);
            setPending(true);
            setError("");
            try {
              const csrfResponse = await fetch("/api/auth/csrf", {
                cache: "no-store",
              });
              if (!csrfResponse.ok)
                throw new Error("Unable to start a secure form.");
              const { csrfToken } = await csrfResponse.json();
              const response = await fetch("/api/claims", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-CSRF-Token": csrfToken,
                },
                body: JSON.stringify({
                  policyNumber: form.get("policyNumber"),
                  claimType: form.get("claimType"),
                  description: form.get("description"),
                  confirmEmail: form.get("confirmEmail") === "on",
                }),
              });
              const body = await response.json();
              if (!response.ok)
                throw new Error(body.error ?? "Creation was not confirmed.");
              window.dispatchEvent(new Event("agentshield:claims-changed"));
              dialog.current?.close();
              router.push(`/claim/${encodeURIComponent(body.claimId)}`);
            } catch (failure) {
              setError(
                `${failure instanceof Error ? failure.message : "Creation was not confirmed."} Check your claims before resubmitting; a timed-out request may have succeeded.`,
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="modal-head">
            <h2 id="new-claim-title">New claim</h2>
            <button
              type="button"
              className="btn"
              onClick={close}
              disabled={pending}
            >
              Close
            </button>
          </div>
          <label htmlFor="new-policy">Policy number</label>
          <input
            id="new-policy"
            name="policyNumber"
            required
            maxLength={128}
            autoComplete="off"
            disabled={pending}
          />
          <label htmlFor="new-type">Claim type</label>
          <input
            id="new-type"
            name="claimType"
            required
            maxLength={128}
            disabled={pending}
          />
          <label htmlFor="new-description">Description</label>
          <textarea
            id="new-description"
            name="description"
            required
            maxLength={8000}
            disabled={pending}
          />
          <label className="check">
            <input
              type="checkbox"
              name="confirmEmail"
              required
              disabled={pending}
            />{" "}
            Creating this claim may send a real confirmation email to my
            verified account address.
          </label>
          <button className="btn ok" disabled={pending}>
            {pending ? "Creating…" : "Create claim"}
          </button>
          {error && <p role="alert">{error}</p>}
        </form>
      </dialog>
    </>
  );
}
