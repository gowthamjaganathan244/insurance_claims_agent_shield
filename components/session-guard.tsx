"use client";
import { useEffect, useRef } from "react";

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    let checking = false;
    const hide = () => {
      if (container.current) container.current.style.visibility = "hidden";
    };
    const signedOut = () => {
      hide();
      window.location.replace("/login");
    };
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        if (!active) return;
        if (!response.ok) signedOut();
        else if (container.current)
          container.current.style.visibility = "visible";
      } catch {
        if (active) signedOut();
      } finally {
        checking = false;
      }
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) {
        hide();
        void check();
      }
    };
    const visible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("agentshield-session")
        : null;
    if (channel) channel.onmessage = signedOut;
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", restore);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", visible);
    const timer = setInterval(check, 60000);
    return () => {
      active = false;
      clearInterval(timer);
      channel?.close();
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", restore);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  return (
    <div ref={container} id="private-app">
      {children}
    </div>
  );
}
