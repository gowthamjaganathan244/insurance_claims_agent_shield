# Task 11: Cognito authentication

This change adds authentication to the existing demonstration UI. Claim values,
incidents, reliability metrics and communications remain fixtures. It does not
establish ownership authorization or connect the claims screens to DynamoDB.

## Local setup

Requires Node.js **22.13 or later** (tested on 22.20) and npm. Node's built-in
SQLite module is experimental in Node 22 and prints a warning; no native npm
database dependency is required.

```sh
npm ci
cp .env.example .env.local
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Put the generated value in `AUTH_SESSION_KEY` in `.env.local`. Do not run the copy
command over an existing configured environment. Keep that file private and out
of Git. The implementation session created a local random key if the file was
absent; no key is checked into the repository.

```sh
npm run lint
npm run typecheck
npm run build
npm run start
```

Open **http://localhost:3000**. For development, use `npm run dev` instead of
build/start. Use the exact `localhost` hostname for the existing Cognito logout
registration, not `127.0.0.1`.

Environment variables:

| Variable             | Purpose                                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_ORIGIN`         | Exact trusted origin for CSRF checks and the registered Cognito logout redirect. Defaults to `http://localhost:3000`. HTTPS is required except on loopback. |
| `AUTH_SESSION_KEY`   | 32 random bytes, hex encoded. Server-only encryption key. Changing it invalidates existing records.                                                         |
| `AUTH_DATABASE_PATH` | Private persistent SQLite file, defaults to `.auth/sessions.sqlite`. Never put under `public/`.                                                             |

The verified region, pool ID, public client ID, Cognito domain and API Gateway
origin are fixed in `lib/auth/config.ts`. No AWS credentials, IAM permissions,
client secret or identity database are needed for these public Cognito APIs.

## Flow selection and ZIP review

**Final decision: Option A.** Preserve the custom AgentShield login design and
authenticate its email/username and password form through the server-side AWS
SDK. Normal sign-in never redirects to Cognito's hosted login. The Cognito
domain is used only during sign-out to clear any previous managed-login session.

The earlier “Authentication is temporarily unavailable” error was caused by
omitting `PASSWORD` from `InitiateAuth` while requesting `USER_AUTH` with
`PREFERRED_CHALLENGE: PASSWORD`. This pool returned `InvalidParameterException`
with `Missing required parameter PASSWORD`; the safe error mapper displayed
the generic availability message. The corrected initial request includes the
password over TLS. This was a request-shape defect, not a need to replace the
custom form, change the user pool, or enable a different authentication flow.
The isolated test provider rejects the same missing parameter to guard against
regression, and browser tests assert that sign-in makes no external requests.

The supplied `agentshield-task11-step8-auth.zip` was read in full, including its
installer, but was not executed. Its OAuth authorization code / PKCE exchange
is useful reference material. It stores an access token in an HttpOnly cookie,
checks userInfo, and offers navigation sign-out; it does not protect the pages,
verify all JWT claims locally, refresh tokens, or implement a credential form.

This implementation uses **one authentication flow**: Cognito `USER_AUTH` with
preferred `PASSWORD`, through the maintained AWS SDK v3 on the Next.js server.
The initial request includes the submitted password over TLS, as required by this pool. This
does **not** require enabling `USER_PASSWORD_AUTH`, a client secret, or admin
credentials. `USER_SRP_AUTH` is also configured, but would require an SDK SRP
implementation; no homemade SRP or crypto is implemented. AWS documents both
flows as supported for server applications. Passwords exist only in the form
and request handling, never in session storage or logs.

Sources checked during implementation:

- [Cognito authentication methods](https://docs.aws.amazon.com/cognito/latest/developerguide/authentication-flows-selection-sdk.html)
- [Cognito authentication flows](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow-methods.html)
- [Challenge responses](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_RespondToAuthChallenge.html)
- [Refresh tokens](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-refresh-token.html)

There is no OAuth token manager running alongside this flow, and no new callback
is required. The registered `http://localhost:3000/api/auth/callback` remains
unchanged in AWS but is unused by this implementation. We did not apply AWS
configuration changes.

## Challenges and recovery

- `NEW_PASSWORD_REQUIRED`: collect a new password and Cognito's missing required attributes.
- SMS, email and authenticator verification: submit the code and Cognito session; no session is issued until Cognito returns valid tokens.
- `SELECT_MFA_TYPE`: select only among options returned by Cognito.
- `MFA_SETUP`: associate and verify a TOTP authenticator, then finish the MFA setup challenge. The secret is intentionally shown to its enrolling user and is never logged or persisted in browser storage.
- Forgotten password: call `ForgotPassword`, then `ConfirmForgotPassword`. Responses do not disclose whether a username exists. Recovery requires a verified eligible delivery channel configured in Cognito.
- Unsupported custom/device/passkey challenges fail closed with a specific instruction. SMS/email enrollment without a verified contact method requires administrator assistance; it is not bypassed.

Challenge identifiers are opaque HttpOnly cookies backed by encrypted records
with a three-minute maximum lifetime. Challenges are consumed atomically and
rotated for continued attempts; errors do not extend their lifetime.

## Sessions and route protection

The browser holds a random 256-bit `agentshield_session` identifier. It holds no
JWTs or refresh tokens. Only its SHA-256 hash is indexed in the SQLite store.
Session payloads are encrypted with JOSE `dir` / `A256GCM`, have explicit expiry,
and contain the Cognito tokens. The directory/file are created with restrictive
permissions (0700/0600). SQLite stores sessions/challenges/rate limits, not users
or passwords. Runtime data and environment files are excluded from deployment
tracing.

`jose` verifies Cognito RS256 signatures through the fixed pool JWKS endpoint,
issuer, expiry, ID-token audience, access-token client ID, token use and matching
subject. Both ID and access tokens are verified before session creation and on
protected requests. No decoded-but-unverified JWT is treated as identity.

The maximum application session is eight hours. Tokens approaching expiry are
refreshed server-side using `GetTokensFromRefreshToken` (supports Cognito refresh
rotation); newly issued tokens are verified and saved. A SQLite lease serializes
refreshes across route bundles/processes. A concurrent logout cannot resurrect
a deleted record. Failed refresh/verification fails closed. The configured
Cognito refresh lifetime can shorten the application session.

`proxy.ts` only performs early missing-cookie redirects. The `(protected)` layout,
**every protected page**, claim metadata function, and server API boundary perform
authoritative verification. Protected pages are dynamic/no-store. Static claim
parameter generation has been removed; fixture ID validation remains after auth.
Shared root markup contains no operational navigation or claim provider.

All mutating auth requests require the exact configured Origin, an HttpOnly
SameSite=Strict CSRF cookie and matching custom header, JSON content type, and a
bounded body. Login/recovery/challenge attempts are rate limited in SQLite.
Errors are mapped to safe messages and no Cognito response objects are logged.
Return URLs are not accepted; successful login always goes to `/`.

Auth/session cookies are HttpOnly, path `/`, SameSite, and Secure whenever
`APP_ORIGIN` uses HTTPS. Auth and protected responses have private/no-store
headers. Future hosting must preserve these headers and avoid CDN caching of
protected pages or React Server Component responses.

## Logout

`/logout` displays the signed-in account with Sign out and Stay signed in. It
does not display the Dynamic Island. The CSRF-protected POST deletes the server
record first, revokes the Cognito refresh token, expires all app auth cookies
(including the old ZIP's access/state/PKCE cookies), and requests browser
cache/storage clearing. Other open app tabs are notified using BroadcastChannel.

The browser then visits Cognito's logout endpoint to clear any managed-login
cookie, including one left by an earlier flow. Its `logout_uri` is the already
registered `http://localhost:3000`; the returned anonymous request redirects to
the branded login screen. A short-lived marker displays signed-out confirmation.
No additional Cognito logout URL is required for localhost.

Logout invalidates the current application session, not every device's session.
If remote token revocation fails, the application session still ends and the
confirmation explicitly says remote revocation could not be confirmed. It does
not falsely claim an AWS-wide sign-out. Previously issued JWTs can remain
cryptographically valid until expiry; this app rejects the deleted session.

Full-document authentication transitions discard Next's client router state.
The private wrapper hides content on pagehide and rechecks a BFCache restoration
before showing it; focus/visibility/periodic checks and cross-tab logout improve
expiry behavior. These are supplemental UX controls, not the security boundary.

## API Gateway boundary

`lib/api-gateway.ts` is a server-only authenticated fetch boundary using the
verified access token. It accepts developer-owned method/path contracts, not a
browser-supplied upstream URL, and disables caching/redirect following. There is
no catch-all proxy or UI caller enabled in this task.

The supplied ZIP/repository do not identify the **seven route method/path
contracts**, request schemas or JWT-authorizer audience/scope requirements. These
must be documented/verified before registering operations. In particular,
`USER_AUTH` access tokens do not acquire arbitrary OAuth resource-server scopes;
verify authorizer requirements before enabling any route. Never switch to an ID
token without validating the API contract.

Real claims integration still requires server-enforced `ownerSub = verified sub`
and the outstanding second-user isolation test. Frontend filtering is not owner
authorization. Fixtures are intentionally unchanged.

## Automated verification

```sh
npm ci
npm run lint
npm run typecheck
npm run build
npx playwright install chromium firefox webkit
npm run test:e2e
```

The Playwright launcher starts a loopback Cognito test provider and the production
Next build with a **test-process-only fetch interceptor**. The provider generates
an ephemeral RSA key and signs JWTs; the normal SDK, JWT verifier, encrypted
session store, CSRF checks and pages are exercised. There is no test-mode switch,
test identity endpoint, test key or bypass in production application code.
Tests use a temporary database/key deleted when the server exits. Real AWS is
never contacted by this suite. Port 3100 is always owned by the test runner;
it never reuses an arbitrary existing application server. Port 3199 hosts the
test provider. Traces are disabled to avoid retaining credential-bearing requests.

Existing application tests authenticate through this same flow before asserting
the original features, responsiveness and accessibility. Additional tests cover
anonymous access, login errors, CSRF, signed-token claims, refresh, MFA, password
changes/recovery, logout/replay and browser Back.

## Manual live Cognito acceptance test

Use a dedicated, administrator-provided test account. Do not paste passwords,
tokens, recovery codes or authenticator setup keys into chat or Git.

1. Start the normal app with the configured `.env.local`, not the mock test launcher.
2. In a private browser open `http://localhost:3000` and each protected deep link.
   Confirm `/login` and no private navigation/content.
3. Submit incorrect credentials; confirm a safe error and no session.
4. Sign in with the real account. Complete new-password/MFA/enrollment prompts
   as applicable. Confirm the existing Command dashboard and account label.
5. Refresh and navigate all pages. Visiting `/login` should return to `/`.
6. Inspect browser storage: only opaque HttpOnly app cookies, no auth localStorage.
   Do not copy token-bearing server/debug traffic into test reports.
7. Keep the session through an access-token expiry to verify real refresh and,
   where enabled, rotation. Cognito configuration determines this interval.
8. Test Forgot password with a dedicated account eligible for recovery, enter the
   delivered code, set a new password, and sign in. This changes that user's password.
9. Open a second tab, then Account / Sign out. Confirm no operational navigation
   on `/logout`, confirm Sign out, allow the Cognito logout redirect, and verify
   signed-out text on `/login`. Refresh, direct links and Back must stay protected.
10. Confirm a subsequent sign-in requires credentials. Do not treat this as the
    outstanding two-user API ownership test; that is a separate integration task.

On 21 October 2026, the user confirmed that login and logout both work against
the real Cognito configuration. Actual MFA/recovery delivery, long-lived refresh
rotation and independent inspection of managed-login cookie clearing remain
manual checks. Automated mock passes do not establish those live results.
See [verification and delivery](authentication-verification.md) for recorded results.

## Deployment constraints / remaining work

- No deployment, AWS resource modification or merge is part of this task.
- SQLite suits local development and a single host with a persistent private disk.
  Use a shared production session/lock/rate-limit adapter before stateless Lambda,
  ephemeral filesystems or multi-host scaling. Do not put SQLite on a shared NFS mount.
- Store the encryption key in secure runtime configuration. Back up/encrypt the
  session volume as appropriate; key rotation currently signs everyone out.
- Configure HTTPS `APP_ORIGIN` and explicitly register production Cognito logout
  URLs before production. No AWS settings were silently changed.
- Distributed perimeter throttling, operational monitoring and deployment-specific
  CSP/retention requirements remain hosting work. Account-level limits here and
  Cognito's own protections are not a distributed perimeter defense.
- Unsupported challenge enrollment/device/passkey flows are explicit failures;
  implement them only with a verified account/pool requirement and corresponding tests.
