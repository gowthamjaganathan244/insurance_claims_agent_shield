import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth/session";
import { SIGNED_OUT_COOKIE } from "@/lib/auth/config";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";
export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };
export default async function LoginPage() {
  if (await currentSession()) redirect("/");
  const signedOut = (await cookies()).get(SIGNED_OUT_COOKIE)?.value;
  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to your AgentShield workspace."
    >
      {signedOut && (
        <p role="status" className="auth-notice">
          {signedOut === "local"
            ? "You are signed out of AgentShield. Cognito token revocation could not be confirmed. Contact your administrator if you need all sessions revoked."
            : "You have been signed out. Your AgentShield session has ended."}
        </p>
      )}
      <LoginForm />
    </AuthShell>
  );
}
