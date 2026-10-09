"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { initialClaims } from "@/lib/data";
import type { Claim, ClaimEvent, ClaimStatus } from "@/lib/types";
interface Store {
  claims: Claim[];
  audit: Record<string, ClaimEvent[]>;
  update: (id: string, status: ClaimStatus) => void;
}
const ClaimContext = createContext<Store | null>(null);
export function ClaimProvider({ children }: { children: React.ReactNode }) {
  const [claims, setClaims] = useState(initialClaims);
  const [audit, setAudit] = useState<Record<string, ClaimEvent[]>>({});
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const update = useCallback((id: string, status: ClaimStatus) => {
    setClaims((current) =>
      current.map((claim) => (claim.id === id ? { ...claim, status } : claim)),
    );
    const time = new Intl.DateTimeFormat("en-AU", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Australia/Sydney",
    }).format(new Date());
    setAudit((current) => ({
      ...current,
      [id]: [
        ...(current[id] ?? []),
        [
          time,
          `Claim ${status.toLowerCase()}`,
          "Action recorded in this demo session",
          status === "Approved" ? "ok" : "warn",
          "Assessor",
        ],
      ],
    }));
    setMessage(`${id} ${status.toLowerCase()}`);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 2600);
  }, []);
  return (
    <ClaimContext.Provider value={{ claims, audit, update }}>
      {children}
      <div
        id="toast"
        className={message ? "on" : ""}
        role="status"
        aria-live="polite"
      >
        {message}
      </div>
    </ClaimContext.Provider>
  );
}
export function useClaims() {
  const store = useContext(ClaimContext);
  if (!store) throw new Error("ClaimProvider is required");
  return store;
}
