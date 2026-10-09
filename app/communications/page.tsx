import { PageHeading } from "@/components/ui";
import { Communications } from "@/components/communications";
export const metadata = { title: "Communications" };
export default function CommunicationsPage() {
  return (
    <main id="app" tabIndex={-1}>
      <PageHeading title="Communications">
        What customers read, and whether it arrived.
      </PageHeading>
      <Communications />
    </main>
  );
}
