import { type NextRequest } from "next/server";
import { AuthError, forgotPassword, resetPassword } from "@/lib/auth/cognito";
import { authFailure, json, readMutation, textField } from "@/lib/auth/http";
import { rateLimit } from "@/lib/auth/store";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const body = await readMutation(request);
    const username = textField(body, "username", 128);
    if (!rateLimit(`recovery:${username.toLowerCase()}`, 8))
      throw new AuthError("Too many recovery attempts. Please wait.", 429);
    if (body.action === "confirm") {
      const code = textField(body, "code", 8);
      if (!/^\d{6,8}$/.test(code))
        throw new AuthError("Enter the recovery code (6–8 digits).");
      await resetPassword(username, code, textField(body, "password"));
      return json({
        message:
          "Your password has been reset. Sign in with your new password.",
      });
    }
    try {
      await forgotPassword(username);
    } catch (error) {
      // Do not disclose whether the account or a recovery address exists.
      if (
        !(error instanceof Error) ||
        ![
          "UserNotFoundException",
          "InvalidParameterException",
          "NotAuthorizedException",
        ].includes(error.name)
      )
        throw error;
    }
    return json({
      message:
        "If this account supports recovery, a code has been sent to its verified email or phone. If no code arrives, contact your administrator.",
    });
  } catch (error) {
    return authFailure(error);
  }
}
