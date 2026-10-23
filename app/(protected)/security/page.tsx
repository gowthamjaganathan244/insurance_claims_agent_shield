import { requireSession } from "@/lib/auth/session";
import { SecurityDocuments } from "@/components/security-documents";
import { Alert, PageHeading } from "@/components/ui";
export const metadata = { title: "Security" };
export default async function SecurityPage() {
  await requireSession();
  return (
    <main id="app" tabIndex={-1}>
      <PageHeading title="Security">
        GuardDuty malware scan results, document status and quarantine evidence
        for your claims.
      </PageHeading>
      <SecurityDocuments />
      <Alert>
        Scan and quarantine values are the recorded evidence for each document.
        A missing scan record does not mean a document is clean, and a
        quarantine copy alone does not prove the source was isolated.
      </Alert>
    </main>
  );
}
