"use client";
import { useCallback, useEffect, useRef, useState } from "react";
export function useLiveClaims<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const failures = useRef(0);
  const refresh = useCallback(async () => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401) window.location.replace("/login");
        throw new Error(result.error ?? "Unable to load claims.");
      }
      if (!controller.signal.aborted) {
        setData(result);
        setError("");
        setUpdated(new Date().toISOString());
        failures.current = 0;
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        setData(null);
        setError(
          failure instanceof Error ? failure.message : "Unable to load claims.",
        );
        failures.current++;
      }
    } finally {
      if (active.current === controller) active.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    let generation = 0;
    const tick = async () => {
      const current = generation;
      if (document.visibilityState === "visible") await refresh();
      if (
        !disposed &&
        current === generation &&
        document.visibilityState === "visible"
      )
        timer = setTimeout(
          tick,
          Math.min(120000, 30000 * 2 ** Math.min(failures.current, 2)),
        );
    };
    const visibility = () => {
      generation++;
      clearTimeout(timer);
      active.current?.abort();
      active.current = null;
      if (document.visibilityState === "visible") void tick();
    };
    void tick();
    document.addEventListener("visibilitychange", visibility);
    const changed = () => {
      void refresh();
    };
    window.addEventListener("agentshield:claims-changed", changed);
    return () => {
      disposed = true;
      clearTimeout(timer);
      active.current?.abort();
      active.current = null;
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("agentshield:claims-changed", changed);
    };
  }, [refresh]);
  return { data, error, loading, updated, refresh };
}
