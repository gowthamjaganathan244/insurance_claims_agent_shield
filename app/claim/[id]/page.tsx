import { notFound } from "next/navigation";
import { initialClaims } from "@/lib/data";
import { ClaimDetail } from "@/components/claim-detail";
export const dynamicParams = false;
export function generateStaticParams() {
  return initialClaims.map((claim) => ({ id: claim.id }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return { title: `${id} investigation` };
}
export default async function ClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ evidence?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!initialClaims.some((claim) => claim.id === id)) notFound();
  return (
    <main id="app" tabIndex={-1}>
      <ClaimDetail id={id} evidence={query.evidence === "1"} />
    </main>
  );
}
