"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { MonitoringData } from "@/lib/monitoring/types";
import { healthDotStatus, type HealthDotStatus } from "@/lib/monitoring/health";
interface State {
  allowed: boolean;
  status: HealthDotStatus;
  data: MonitoringData | null;
  error: string;
  loading: boolean;
  refresh: () => Promise<void>;
}
const Context = createContext<State | null>(null);
export function MonitoringProvider({
  children,
  allowed,
}: {
  children: React.ReactNode;
  allowed: boolean;
}) {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [error, setError] = useState(
    allowed ? "" : "Monitoring access is not granted for this account.",
  );
  const [loading, setLoading] = useState(allowed);
  const active = useRef<AbortController | null>(null);
  const denied = useRef(false);
  const refresh = useCallback(async () => {
    if (!allowed || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    try {
      const response = await fetch("/api/monitoring", {
        cache: "no-store",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(30000),
        ]),
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      denied.current = response.status === 401 || response.status === 403;
      if (!response.ok)
        throw new Error(result.error ?? "Monitoring unavailable.");
      setData(result);
      setError("");
    } catch (failure) {
      if (!controller.signal.aborted) {
        setData(null);
        setError(
          failure instanceof Error
            ? failure.message
            : "Monitoring unavailable.",
        );
      }
    } finally {
      if (active.current === controller) active.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [allowed]);
  useEffect(() => {
    if (!allowed) return;
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    let generation = 0;
    const tick = async () => {
      const current = generation;
      if (document.visibilityState === "visible") await refresh();
      if (
        !disposed &&
        current === generation &&
        !denied.current &&
        document.visibilityState === "visible"
      )
        timer = setTimeout(tick, 60000);
    };
    const visibility = () => {
      generation++;
      clearTimeout(timer);
      active.current?.abort();
      active.current = null;
      setData(null);
      if (document.visibilityState === "visible") void tick();
    };
    void tick();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      clearTimeout(timer);
      active.current?.abort();
      active.current = null;
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [refresh, allowed]);
  return (
    <Context.Provider
      value={{
        allowed,
        status: healthDotStatus({ allowed, loading, error, data }),
        data,
        error,
        loading,
        refresh,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useMonitoring() {
  const value = useContext(Context);
  if (!value) throw new Error("MonitoringProvider required");
  return value;
}
export function MonitoringHealth() {
  const { data } = useMonitoring();
  return <span>{data?.health ?? "Health unavailable"}</span>;
}
const dotLabels: Record<HealthDotStatus, string> = {
  ok: "Alarm status verified OK",
  loading: "Checking monitoring",
  bad: "Alarm triggered or monitoring failed",
  unknown: "Alarm status not determined",
};
/** The existing navbar dot, coloured from the shared monitoring state. */
export function HealthDot() {
  const { status } = useMonitoring();
  return (
    <i
      className="dot health-dot"
      data-status={status}
      title={dotLabels[status]}
      aria-hidden="true"
    />
  );
}
