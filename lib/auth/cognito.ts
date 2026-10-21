import "server-only";
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  GetTokensFromRefreshTokenCommand,
  RevokeTokenCommand,
  type AuthenticationResultType,
  type ChallengeNameType,
} from "@aws-sdk/client-cognito-identity-provider";
import { FetchHttpHandler } from "@smithy/fetch-http-handler";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { authConfig } from "./config";

const client = new CognitoIdentityProviderClient({
  region: authConfig().region,
  requestHandler: new FetchHttpHandler({ requestTimeout: 10000 }),
  maxAttempts: 2,
});
const jwks = createRemoteJWKSet(
  new URL(`${authConfig().issuer}/.well-known/jwks.json`),
  { timeoutDuration: 10000 },
);
export interface Tokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  deviceKey?: string;
}
export interface Identity {
  sub: string;
  displayName: string;
  username: string;
  expires: number;
}
export interface Challenge {
  name: ChallengeNameType;
  session: string;
  username: string;
  requiredAttributes: string[];
  choices: string[];
  secret?: string;
}
export class AuthError extends Error {
  constructor(
    public message: string,
    public status = 400,
  ) {
    super(message);
  }
}
function list(value?: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}
export async function verifyTokens(tokens: Tokens): Promise<Identity> {
  const { issuer, clientId } = authConfig();
  const [access, id] = await Promise.all([
    jwtVerify(tokens.accessToken, jwks, {
      issuer,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "sub", "token_use", "client_id"],
    }),
    jwtVerify(tokens.idToken, jwks, {
      issuer,
      audience: clientId,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "sub", "token_use"],
    }),
  ]);
  if (
    access.payload.token_use !== "access" ||
    access.payload.client_id !== clientId ||
    id.payload.token_use !== "id" ||
    access.payload.sub !== id.payload.sub ||
    typeof id.payload.sub !== "string"
  )
    throw new Error("Invalid token claims");
  return {
    sub: id.payload.sub,
    username: String(
      id.payload["cognito:username"] ??
        access.payload.username ??
        id.payload.sub,
    ),
    displayName: String(
      id.payload.email ?? id.payload["cognito:username"] ?? "AgentShield user",
    ),
    expires: Math.min(access.payload.exp!, id.payload.exp!),
  };
}
type AuthResult = {
  AuthenticationResult?: AuthenticationResultType;
  ChallengeName?: ChallengeNameType;
  Session?: string;
  ChallengeParameters?: Record<string, string>;
};
export async function interpret(
  result: AuthResult,
  username: string,
): Promise<{ tokens: Tokens } | { challenge: Challenge }> {
  const auth = result.AuthenticationResult;
  if (auth?.AccessToken && auth.IdToken && auth.RefreshToken) {
    const tokens = {
      accessToken: auth.AccessToken,
      idToken: auth.IdToken,
      refreshToken: auth.RefreshToken,
      deviceKey: auth.NewDeviceMetadata?.DeviceKey,
    };
    await verifyTokens(tokens);
    return { tokens };
  }
  if (!result.ChallengeName || !result.Session)
    throw new AuthError("Sign-in could not be completed. Please start again.");
  const params = result.ChallengeParameters ?? {};
  const challenge: Challenge = {
    name: result.ChallengeName,
    session: result.Session,
    username: params.USERNAME ?? params.USER_ID_FOR_SRP ?? username,
    requiredAttributes: list(params.requiredAttributes).map((x) =>
      x.replace(/^userAttributes\./, ""),
    ),
    choices: list(params.MFAS_CAN_CHOOSE),
  };
  if (challenge.name === "MFA_SETUP") {
    if (!list(params.MFAS_CAN_SETUP).includes("SOFTWARE_TOKEN_MFA")) {
      throw new AuthError(
        "Your account needs an MFA contact method configured. Ask your administrator to set up your verified email or phone number, then sign in again.",
      );
    }
    const setup = await client.send(
      new AssociateSoftwareTokenCommand({ Session: challenge.session }),
    );
    if (!setup.Session || !setup.SecretCode)
      throw new AuthError(
        "Authenticator setup is unavailable. Please try again.",
      );
    challenge.session = setup.Session;
    challenge.secret = setup.SecretCode;
  }
  if (
    ![
      "NEW_PASSWORD_REQUIRED",
      "SMS_MFA",
      "SOFTWARE_TOKEN_MFA",
      "EMAIL_OTP",
      "SMS_OTP",
      "MFA_SETUP",
      "SELECT_MFA_TYPE",
      "EMAIL_MFA",
    ].includes(challenge.name)
  ) {
    throw new AuthError(
      "This account requires an authentication method this application does not yet support. Contact your administrator. No session has been created.",
    );
  }
  return { challenge };
}
export async function signIn(username: string, password: string) {
  const first = await client.send(
    new InitiateAuthCommand({
      ClientId: authConfig().clientId,
      AuthFlow: "USER_AUTH",
      AuthParameters: {
        USERNAME: username,
        PREFERRED_CHALLENGE: "PASSWORD",
        PASSWORD: password,
      },
    }),
  );
  if (
    first.ChallengeName !== "PASSWORD" &&
    first.ChallengeName !== "SELECT_CHALLENGE"
  ) {
    return interpret(first, username);
  }
  if (
    first.ChallengeName === "SELECT_CHALLENGE" &&
    !first.AvailableChallenges?.includes("PASSWORD")
  ) {
    throw new AuthError(
      "This account does not offer password sign-in. Contact your administrator.",
    );
  }
  const canonical =
    first.ChallengeParameters?.USERNAME ??
    first.ChallengeParameters?.USER_ID_FOR_SRP ??
    username;
  const result = await client.send(
    new RespondToAuthChallengeCommand({
      ClientId: authConfig().clientId,
      ChallengeName: first.ChallengeName,
      Session: first.Session,
      ChallengeResponses: {
        USERNAME: canonical,
        PASSWORD: password,
        ...(first.ChallengeName === "SELECT_CHALLENGE"
          ? { ANSWER: "PASSWORD" }
          : {}),
      },
    }),
  );
  return interpret(result, canonical);
}
export async function answerChallenge(
  challenge: Challenge,
  input: {
    code?: string;
    password?: string;
    choice?: string;
    attributes?: Record<string, string>;
  },
) {
  const responses: Record<string, string> = { USERNAME: challenge.username };
  let session = challenge.session;
  if (challenge.name === "NEW_PASSWORD_REQUIRED") {
    if (!input.password || input.password.length > 256)
      throw new AuthError("Enter your new password.");
    responses.NEW_PASSWORD = input.password;
    for (const name of challenge.requiredAttributes) {
      const value = input.attributes?.[name];
      if (typeof value !== "string" || !value.trim() || value.length > 2048)
        throw new AuthError(`Enter the required ${name.replaceAll("_", " ")}.`);
      responses[`userAttributes.${name}`] = value;
    }
  } else if (challenge.name === "SELECT_MFA_TYPE") {
    if (!input.choice || !challenge.choices.includes(input.choice))
      throw new AuthError("Select an available verification method.");
    responses.ANSWER = input.choice;
  } else {
    if (!input.code || !/^[0-9]{6,8}$/.test(input.code))
      throw new AuthError("Enter the verification code (6–8 digits).");
    if (challenge.name === "MFA_SETUP") {
      const verified = await client.send(
        new VerifySoftwareTokenCommand({
          Session: session,
          UserCode: input.code,
          FriendlyDeviceName: "AgentShield authenticator",
        }),
      );
      if (verified.Status !== "SUCCESS" || !verified.Session)
        throw new AuthError(
          "That code could not be verified. Try the latest code.",
        );
      session = verified.Session;
    } else {
      const codeKeys: Record<string, string> = {
        SMS_MFA: "SMS_MFA_CODE",
        SOFTWARE_TOKEN_MFA: "SOFTWARE_TOKEN_MFA_CODE",
        EMAIL_OTP: "EMAIL_OTP_CODE",
        SMS_OTP: "SMS_OTP_CODE",
        EMAIL_MFA: "EMAIL_MFA_CODE",
      };
      const key = codeKeys[challenge.name];
      if (!key)
        throw new AuthError(
          "Unsupported verification method. Please start again.",
        );
      responses[key] = input.code;
    }
  }
  return interpret(
    await client.send(
      new RespondToAuthChallengeCommand({
        ClientId: authConfig().clientId,
        ChallengeName: challenge.name,
        Session: session,
        ChallengeResponses: responses,
      }),
    ),
    challenge.username,
  );
}
export async function refreshTokens(tokens: Tokens): Promise<Tokens> {
  const result = await client.send(
    new GetTokensFromRefreshTokenCommand({
      ClientId: authConfig().clientId,
      RefreshToken: tokens.refreshToken,
      DeviceKey: tokens.deviceKey,
    }),
  );
  const auth = result.AuthenticationResult;
  if (!auth?.AccessToken || !auth.IdToken)
    throw new Error("Invalid refresh response");
  const updated = {
    ...tokens,
    accessToken: auth.AccessToken,
    idToken: auth.IdToken,
    refreshToken: auth.RefreshToken ?? tokens.refreshToken,
  };
  await verifyTokens(updated);
  return updated;
}
export async function revoke(tokens: Tokens) {
  await client.send(
    new RevokeTokenCommand({
      ClientId: authConfig().clientId,
      Token: tokens.refreshToken,
    }),
  );
}
export async function forgotPassword(username: string) {
  await client.send(
    new ForgotPasswordCommand({
      ClientId: authConfig().clientId,
      Username: username,
    }),
  );
}
export async function resetPassword(
  username: string,
  code: string,
  password: string,
) {
  await client.send(
    new ConfirmForgotPasswordCommand({
      ClientId: authConfig().clientId,
      Username: username,
      ConfirmationCode: code,
      Password: password,
    }),
  );
}
export function safeError(error: unknown): AuthError {
  if (error instanceof AuthError) return error;
  const name = error instanceof Error ? error.name : "";
  const messages: Record<string, string> = {
    NotAuthorizedException:
      "Sign-in could not be verified. Check your credentials or start again.",
    UserNotFoundException:
      "Sign-in could not be verified. Check your credentials or start again.",
    UserNotConfirmedException:
      "Your account must be confirmed before signing in. Contact your administrator.",
    PasswordResetRequiredException:
      "Reset your password using Forgot password, then sign in again.",
    CodeMismatchException:
      "That verification code is incorrect. Try the latest code.",
    ExpiredCodeException:
      "That code has expired. Start again to request a new code.",
    InvalidPasswordException:
      "Your password does not meet the account's password policy. Use a longer password with uppercase, lowercase, numbers and symbols.",
    PasswordHistoryPolicyViolationException:
      "Choose a password you have not used recently.",
    TooManyRequestsException:
      "Too many attempts. Please wait before trying again.",
    LimitExceededException:
      "Too many attempts. Please wait before trying again.",
  };
  return new AuthError(
    messages[name] ??
      "Authentication is temporarily unavailable. Please try again or contact your administrator.",
    name === "TooManyRequestsException" ? 429 : 400,
  );
}
