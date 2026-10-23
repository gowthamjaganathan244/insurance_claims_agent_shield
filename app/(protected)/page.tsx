import { requireSession } from "@/lib/auth/session";
import { CommandClaims } from "@/components/command-claims";
import {
  monitoringAllowed,
  remoteMonitoringConfigured,
} from "@/lib/monitoring/server";
export const metadata = { title: "Overview" };
export default async function OverviewPage() {
  const session = await requireSession();
  return (
    <main id="app" tabIndex={-1}>
      <CommandClaims
        backends={{
          documents: Boolean(process.env.DOCUMENTS_READ_API_ORIGIN),
          operations: Boolean(process.env.OPERATIONS_API_ORIGIN),
          monitoring:
            remoteMonitoringConfigured() ||
            monitoringAllowed(session.identity.sub),
        }}
      />
    </main>
  );
}
