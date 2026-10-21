// Test-only HTTP provider. Never imported by app/, lib/, or a production entry.
// JWTs are really signed and verified; only the remote Cognito service is mocked.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
const { privateKey, publicKey } = await generateKeyPair("RS256");
const other = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(publicKey)),
  kid: "ci-only",
  use: "sig",
  alg: "RS256",
};
const issuer =
  "https://cognito-idp.ap-southeast-2.amazonaws.com/ap-southeast-2_2uQnEvufy";
const clientId = "phikh6a6u25oi8be7nefavodi";
const sessions = new Map();
const refresh = new Map();
export const TEST_PASSWORD = "CI-only-Password123!";
function challenge(username, name, parameters = {}) {
  const Session = randomUUID();
  sessions.set(Session, { username, name });
  return {
    Session,
    ChallengeName: name,
    ChallengeParameters: { USERNAME: username, ...parameters },
  };
}
async function tokens(username, refreshed = false) {
  const invalid = (prefix) => username.startsWith(prefix);
  const expiry = invalid("expired-token-")
    ? -30
    : !refreshed && (invalid("refresh-") || invalid("refresh-denied-"))
      ? 20
      : 3600;
  const sub = `subject-${username}`;
  const sign = (claims) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "ci-only" })
      .setSubject(sub)
      .setIssuer(invalid("bad-issuer-") ? "https://invalid.example" : issuer)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + expiry)
      .sign(invalid("bad-signature-") ? other.privateKey : privateKey);
  const AccessToken = await sign({
    token_use: invalid("bad-use-") ? "id" : "access",
    client_id: invalid("bad-client-") ? "incorrect-client" : clientId,
    username,
    scope: "aws.cognito.signin.user.admin",
  });
  const IdToken = await sign({
    token_use: "id",
    aud: invalid("bad-audience-") ? "incorrect-client" : clientId,
    email: username,
    "cognito:username": username,
  });
  const RefreshToken = randomUUID();
  refresh.set(RefreshToken, username);
  return {
    AuthenticationResult: {
      AccessToken,
      IdToken,
      RefreshToken,
      TokenType: "Bearer",
      ExpiresIn: expiry,
    },
  };
}
function fail(name = "NotAuthorizedException") {
  const error = new Error("Test provider rejected request");
  error.name = name;
  throw error;
}
async function afterPassword(username) {
  if (username.startsWith("new-password-"))
    return challenge(username, "NEW_PASSWORD_REQUIRED", {
      requiredAttributes: '["userAttributes.name"]',
    });
  if (username.startsWith("mfa-"))
    return challenge(username, "SOFTWARE_TOKEN_MFA");
  if (username.startsWith("sms-")) return challenge(username, "SMS_MFA");
  if (username.startsWith("email-")) return challenge(username, "EMAIL_OTP");
  if (username.startsWith("select-"))
    return challenge(username, "SELECT_MFA_TYPE", {
      MFAS_CAN_CHOOSE: '["SOFTWARE_TOKEN_MFA","SMS_MFA"]',
    });
  if (username.startsWith("setup-"))
    return challenge(username, "MFA_SETUP", {
      MFAS_CAN_SETUP: '["SOFTWARE_TOKEN_MFA"]',
    });
  return tokens(username);
}
async function operation(name, body) {
  if (body.ClientId && body.ClientId !== clientId) fail();
  if (name === "InitiateAuth") {
    if (
      body.AuthFlow !== "USER_AUTH" ||
      body.AuthParameters.PREFERRED_CHALLENGE !== "PASSWORD"
    )
      fail();
    const username = body.AuthParameters.USERNAME;
    if (!body.AuthParameters.PASSWORD) fail("InvalidParameterException");
    if (body.AuthParameters.PASSWORD !== TEST_PASSWORD) fail();
    return afterPassword(username);
  }
  if (name === "RespondToAuthChallenge") {
    const record = sessions.get(body.Session);
    if (
      !record ||
      record.username !== body.ChallengeResponses.USERNAME ||
      record.name !== body.ChallengeName
    )
      fail();
    const username = record.username;
    const answers = body.ChallengeResponses;
    if (record.name === "PASSWORD") {
      if (answers.PASSWORD !== TEST_PASSWORD) fail();
      sessions.delete(body.Session);
      return afterPassword(username);
    }
    if (record.name === "NEW_PASSWORD_REQUIRED") {
      if (!answers.NEW_PASSWORD || !answers["userAttributes.name"])
        fail("InvalidPasswordException");
      sessions.delete(body.Session);
      return challenge(username, "SOFTWARE_TOKEN_MFA");
    }
    if (record.name === "SELECT_MFA_TYPE")
      return challenge(username, answers.ANSWER);
    if (
      record.name !== "MFA_SETUP" &&
      !Object.entries(answers).some(
        ([key, value]) => key.endsWith("_CODE") && value === "123456",
      )
    )
      fail("CodeMismatchException");
    sessions.delete(body.Session);
    return tokens(username);
  }
  if (name === "AssociateSoftwareToken") {
    const record = sessions.get(body.Session);
    if (!record) fail();
    return { Session: body.Session, SecretCode: "JBSWY3DPEHPK3PXP" };
  }
  if (name === "VerifySoftwareToken") {
    if (!sessions.has(body.Session) || body.UserCode !== "123456")
      fail("CodeMismatchException");
    return { Session: body.Session, Status: "SUCCESS" };
  }
  if (name === "GetTokensFromRefreshToken") {
    const username = refresh.get(body.RefreshToken);
    if (!username || username.startsWith("refresh-denied-")) fail();
    refresh.delete(body.RefreshToken);
    return tokens(username, true);
  }
  if (name === "RevokeToken") {
    if (refresh.get(body.Token)?.startsWith("revoke-fail-"))
      fail("InternalErrorException");
    refresh.delete(body.Token);
    return {};
  }
  if (name === "ForgotPassword")
    return {
      CodeDeliveryDetails: {
        Destination: "t***@example.test",
        DeliveryMedium: "EMAIL",
      },
    };
  if (name === "ConfirmForgotPassword") {
    if (body.ConfirmationCode !== "123456") fail("CodeMismatchException");
    return {};
  }
  fail("UnsupportedOperationException");
}
export async function startMockCognito(control) {
  const server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url.endsWith("/.well-known/jwks.json")) {
      response.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    try {
      if (request.url === "/test-control" && control) {
        response.end(
          JSON.stringify(control(JSON.parse(Buffer.concat(chunks).toString()))),
        );
        return;
      }
      const name = request.headers["x-amz-target"]?.split(".").pop();
      const result = await operation(
        name,
        JSON.parse(Buffer.concat(chunks).toString() || "{}"),
      );
      response.end(JSON.stringify(result));
    } catch (error) {
      response.statusCode = 400;
      response.setHeader("x-amzn-errortype", error.name);
      response.end(
        JSON.stringify({
          __type: error.name,
          message: "Test provider rejected request",
        }),
      );
    }
  });
  await new Promise((resolve) => server.listen(3199, "127.0.0.1", resolve));
  return server;
}
