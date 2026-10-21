import { currentSession } from "@/lib/auth/session";
import { json } from "@/lib/auth/http";
export const dynamic = "force-dynamic";
export async function GET() {
  const session = await currentSession();
  return session
    ? json({
        authenticated: true,
        user: { displayName: session.identity.displayName },
        expires: session.identity.expires,
      })
    : json({ authenticated: false }, 401);
}
