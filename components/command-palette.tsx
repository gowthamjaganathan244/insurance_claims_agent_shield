"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { loadCommandSnapshot } from "@/lib/command-snapshot";
import type { LiveClaim } from "@/lib/live-claims";

const destinations = [
  { href: "/", label: "Overview", detail: "Pit wall" },
  { href: "/claims", label: "Claims", detail: "Starting grid" },
  { href: "/security", label: "Security", detail: "Document inspection" },
  {
    href: "/communications",
    label: "Communications",
    detail: "Customer messages",
  },
  { href: "/reliability", label: "Reliability", detail: "Service telemetry" },
];

export function CommandPalette() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [claims, setClaims] = useState<LiveClaim[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [partial, setPartial] = useState(false);
  const [active, setActive] = useState(0);
  const loadingClaims = state === "loading";
  const needle = query.trim().toLowerCase();
  const routes = destinations.filter((item) =>
    `${item.label} ${item.detail}`.toLowerCase().includes(needle),
  );
  const matching = needle
    ? claims
        .filter((claim) =>
          `${claim.claimId} ${claim.policyNumber} ${claim.claimType} ${claim.status}`
            .toLowerCase()
            .includes(needle),
        )
        .slice(0, 8)
    : claims.slice(0, 4);
  const results = [
    ...routes.map((item) => ({ ...item, kind: "Destination" })),
    ...matching.map((claim) => ({
      href: `/claim/${encodeURIComponent(claim.claimId)}`,
      label: claim.policyNumber,
      detail: `${claim.claimType} · ${claim.status} · ${claim.claimId}`,
      kind: "Claim",
    })),
  ];
  const selected = Math.min(active, Math.max(0, results.length - 1));

  function close() {
    dialog.current?.close();
    trigger.current?.focus();
  }
  function open() {
    if (!dialog.current || dialog.current.open) return;
    setQuery("");
    setActive(0);
    dialog.current.showModal();
    input.current?.focus();
  }
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (dialog.current?.open) dialog.current.close();
        else trigger.current?.click();
      }
    }
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    if (!loadingClaims || !dialog.current?.open) return;
    const controller = new AbortController();
    loadCommandSnapshot("/api/claims", controller.signal)
      .then((snapshot) => {
        setClaims(snapshot.claims);
        setPartial(!snapshot.complete);
        setState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("error");
      });
    return () => controller.abort();
  }, [loadingClaims]);
  function begin() {
    setClaims([]);
    setState("loading");
    open();
  }
  return (
    <>
      <button
        className="command-trigger"
        ref={trigger}
        type="button"
        onClick={begin}
        aria-label="Search and navigate"
      >
        <span aria-hidden="true">⌕</span>
        <span>Search</span>
        <kbd>⌘ K</kbd>
      </button>
      <dialog
        className="command-dialog"
        ref={dialog}
        aria-label="Search and navigate"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
        onClose={() => trigger.current?.focus()}
      >
        <div className="command-head">
          <label htmlFor="command-query" className="sr-only">
            Search destinations and your claims
          </label>
          <input
            ref={input}
            id="command-query"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((value) => Math.min(value + 1, results.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((value) => Math.max(value - 1, 0));
              }
              if (event.key === "Enter" && results[selected]) {
                event.preventDefault();
                window.location.assign(results[selected].href);
              }
            }}
            placeholder="Search destinations or your claims"
            autoComplete="off"
          />
          <button
            className="command-close"
            type="button"
            onClick={close}
            aria-label="Close search"
          >
            Esc
          </button>
        </div>
        <div className="command-results" role="status" aria-live="polite">
          {state === "loading" && <p>Loading your claims…</p>}
          {state === "error" && (
            <p>Claim search unavailable. Destinations remain available.</p>
          )}
          {partial && <p>Claim search covers the first 10 pages returned.</p>}
          {!results.length && state !== "loading" && (
            <p>No matching destinations or loaded claims.</p>
          )}
          {results.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={index === selected ? "selected" : ""}
              onMouseEnter={() => setActive(index)}
              onClick={() => dialog.current?.close()}
            >
              <span>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
              <em>{item.kind}</em>
            </Link>
          ))}
        </div>
        <p className="command-foot">
          ↑ ↓ to select · Enter to open · Esc to close
        </p>
      </dialog>
    </>
  );
}
