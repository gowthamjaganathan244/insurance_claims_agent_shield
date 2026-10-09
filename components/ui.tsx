import type { ClaimStatus } from "@/lib/types";
export function StatusTag({ status }: { status: ClaimStatus }) {
  const tone = {
    Approved: "ok",
    Escalated: "bad",
    Quarantined: "bad",
    "In review": "warn",
    Processing: "acc",
  }[status];
  return <span className={`tag ${tone}`}>{status}</span>;
}
export function PageHeading({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="sec-h">
      <h1 className="pg">{title}</h1>
      <p className="lede">{children}</p>
    </div>
  );
}
export function Numbers({ items }: { items: [string | number, string][] }) {
  return (
    <div className="nums">
      {items.map(([value, label]) => (
        <div key={label}>
          <b>{value}</b>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
