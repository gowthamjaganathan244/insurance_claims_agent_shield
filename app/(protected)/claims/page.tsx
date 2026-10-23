import { requireSession } from "@/lib/auth/session";
import { ClaimsWorkspace } from "@/components/claims-workspace";
export const metadata = { title: "Claims" };
export default async function ClaimsPage() {
  await requireSession();
  return (
    <main id="app" tabIndex={-1}>
      <ClaimsWorkspace />
    </main>
  );
}
