import { requireSession } from "@/lib/auth/session";
import { DynamicIsland } from "@/components/dynamic-island";
import { MotionPreferences } from "@/components/motion";
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
      <DynamicIsland displayName={session.identity.displayName} />
      {children}
      <MotionPreferences />
    </SessionGuard>
  );
}
