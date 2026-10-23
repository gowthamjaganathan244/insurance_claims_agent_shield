import { currentSession } from "@/lib/auth/session";
import { json } from "@/lib/auth/http";
import {
  monitoringAllowed,
  MonitoringError,
  readMonitoring,
  readRemoteMonitoring,
  remoteMonitoringConfigured,
} from "@/lib/monitoring/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const session = await currentSession();
  if (!session) return json({ error: "Sign in to access monitoring." }, 401);
  if (remoteMonitoringConfigured()) {
    try {
      return json(
        await readRemoteMonitoring(
          session.identity.sub,
          session.tokens.accessToken,
        ),
      );
    } catch (error) {
      const e = error as MonitoringError;
      return json(
        { error: e.message, code: e.code },
        e.code === "MONITORING_FORBIDDEN" ? 403 : 503,
      );
    }
  }
  if (!monitoringAllowed(session.identity.sub))
    return json(
      { error: "Monitoring access is not granted for this account." },
      403,
    );
  try {
    return json(await readMonitoring());
  } catch (error) {
    return json(
      {
        error:
          error instanceof MonitoringError
            ? error.message
            : "Monitoring unavailable.",
        code:
          error instanceof MonitoringError
            ? error.code
            : "MONITORING_UNAVAILABLE",
      },
      503,
    );
  }
}
