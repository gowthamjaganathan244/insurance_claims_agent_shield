import { requireSession } from "@/lib/auth/session";
import { PageHeading } from "@/components/ui";
import { ReliabilityMonitoring } from "@/components/reliability-monitoring";
export const metadata = { title: "Reliability" };
export default async function ReliabilityPage() {
  await requireSession();
  return (
    <main id="app" tabIndex={-1}>
      <PageHeading title="Reliability">
        CloudWatch alarms and API and Lambda measurements for the claims
        service. Missing data is never treated as healthy.
      </PageHeading>
      <ReliabilityMonitoring />
    </main>
  );
}
