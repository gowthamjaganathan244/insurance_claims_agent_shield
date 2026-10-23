import { requireSession } from "@/lib/auth/session";
import { PageHeading } from "@/components/ui";
import { Communications } from "@/components/communications";
export const metadata = { title: "Communications" };
export default async function CommunicationsPage() {
  await requireSession();
  return (
    <main id="app" tabIndex={-1}>
      <PageHeading title="Communications">
        What customers read, and whether it arrived.
      </PageHeading>
      <Communications connected={Boolean(process.env.OPERATIONS_API_ORIGIN)} />
    </main>
  );
}
