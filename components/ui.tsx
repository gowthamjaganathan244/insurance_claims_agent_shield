import type { ReactNode } from "react";
export type Tone = "ok" | "warn" | "bad" | "acc" | "mut";
export function PageHeading({
  title,
  children,
  actions,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="sec-h page-head">
      <div>
        <h1 className="pg">{title}</h1>
        {children && <p className="lede">{children}</p>}
      </div>
      {actions && <div className="acts">{actions}</div>}
    </div>
  );
}
/** KPI cards. `value: null` renders an explicit "Unavailable", never a zero. */
export function Kpis({
  items,
}: {
  items: {
    label: string;
    value: ReactNode | null;
    hint?: ReactNode;
    tone?: Tone;
  }[];
}) {
  return (
    <dl className="kpis">
      {items.map((item) => (
        <div key={item.label} className={`kpi ${item.tone ?? ""}`}>
          <dt>{item.label}</dt>
          <dd>
            {item.value === null ? (
              <span className="dim">Unavailable</span>
            ) : (
              item.value
            )}
            {item.hint && <small>{item.hint}</small>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function Alert({
  tone = "mut",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <div className={`alert ${tone}`} role={tone === "bad" ? "alert" : "status"}>
      {children}
    </div>
  );
}
export function Pill({
  tone = "mut",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return <span className={`tag ${tone}`}>{children}</span>;
}
/** Consistent loading / error / empty handling for a live data source. */
export function DataState({
  loading,
  error,
  empty,
  emptyText,
  loadingText = "Loading…",
}: {
  loading: boolean;
  error: string;
  empty?: boolean;
  emptyText?: string;
  loadingText?: string;
}) {
  if (error) return <Alert tone="bad">{error}</Alert>;
  if (loading)
    return (
      <p className="dim skeleton-line" role="status">
        {loadingText}
      </p>
    );
  if (empty && emptyText) return <p className="dim empty">{emptyText}</p>;
  return null;
}
