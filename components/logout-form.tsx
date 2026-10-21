"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { authRequest } from "./auth-request";
export function LogoutForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await authRequest("/api/auth/logout", {});
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("agentshield-session");
        channel.postMessage("signed-out");
        channel.close();
      }
      window.location.replace(result.redirect);
    } catch {
      setError("Sign-out could not be completed. Please try again.");
      setBusy(false);
    }
  }
  return (
    <form className="auth-form" onSubmit={submit} aria-busy={busy}>
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      <button className="btn ok auth-submit" disabled={busy}>
        {busy ? "Signing out…" : "Sign out"}
      </button>
      <Link prefetch={false} className="auth-text-button" href="/">
        Stay signed in
      </Link>
    </form>
  );
}
