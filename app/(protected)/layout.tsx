import { requireSession } from "@/lib/auth/session";
import { DynamicIsland } from "@/components/dynamic-island";
import { MotionPreferences } from "@/components/motion";
import {
  monitoringAllowed,
  remoteMonitoringConfigured,
} from "@/lib/monitoring/server";
import { MonitoringProvider } from "@/components/monitoring-provider";
import { SessionGuard } from "@/components/session-guard";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  return (
    <SessionGuard>
      <MonitoringProvider
        allowed={
          // With the AWS-hosted endpoint, the Lambda enforces operator access.
          remoteMonitoringConfigured() ||
          monitoringAllowed(session.identity.sub)
        }
      >
        <DynamicIsland displayName={session.identity.displayName} />
        {children}
      </MonitoringProvider>
      <MotionPreferences />
    </SessionGuard>
  );
}
