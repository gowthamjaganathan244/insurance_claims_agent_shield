import { requireSession } from "@/lib/auth/session";
import { ClaimsWorkspace } from "@/components/claims-workspace";
import { PageHeading } from "@/components/ui";
export const metadata = { title: "Claims" };
export default async function ClaimsPage() {
  await requireSession();
  return (
    <main id="app" className="wide" tabIndex={-1}>
      <PageHeading title="Claims">
        Sorted by what needs attention first.
      </PageHeading>
      <ClaimsWorkspace />
    </main>
  );
}
