import { requireSession } from "@/lib/auth/session";
import { notFound } from "next/navigation";
import { LiveClaimDetail } from "@/components/live-claim-detail";
export const dynamic = "force-dynamic";
export const metadata = { title: "Claim details" };
export default async function ClaimPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    notFound();
  return (
    <main id="app" tabIndex={-1}>
      <LiveClaimDetail
        id={id}
        operationsEnabled={Boolean(process.env.OPERATIONS_API_ORIGIN)}
      />
    </main>
  );
}
