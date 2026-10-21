import { requireSession } from "@/lib/auth/session";
import { AuthShell } from "@/components/auth-shell";
import { LogoutForm } from "@/components/logout-form";
export const dynamic = "force-dynamic";
export const metadata = { title: "Sign out" };
export default async function LogoutPage() {
  const session = await requireSession();
  return (
    <AuthShell
      title="Ready to sign out?"
      description="End your AgentShield session on this browser."
    >
      <dl className="auth-account">
        <dt>Signed in as</dt>
        <dd>{session.identity.displayName}</dd>
      </dl>
      <p className="auth-caption">
        Unsaved demonstration claim actions and message drafts will be cleared.
      </p>
      <LogoutForm />
    </AuthShell>
  );
}
