# Task 11 delivery and verification

Date: 21 October 2026 (Australia/Sydney).
Branch: `feature/task11-authentication`.

The existing frontend now has branded credential login, challenge and recovery
forms, account/sign-out confirmation, authoritative server session protection,
and refresh/revocation. Dashboard content, claim fixtures and operational
interactions remain in place. No AWS resources were changed or deployed.

## Actual verification results

| Command | Result |
| --- | --- |
| `npm ci` | Passed |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; protected pages are dynamic |
| `npm run test:e2e` | 88 passed in 36.8 seconds (Option A recheck) |

## Option A follow-up

The final decision is the existing branded form with server-side AWS SDK
`USER_AUTH`, using the specified pool and client in `ap-southeast-2`. No login
layout, stylesheet or dashboard source was changed in this follow-up. Added a
regression assertion that the browser makes no external requests throughout
sign-in, dashboard refresh and authenticated `/login` redirection. The Cognito
domain remains only a sign-out cleanup destination, never a normal login page.

Reproduced the original root cause against real Cognito with synthetic invalid
credentials: omitting `PASSWORD` returned HTTP 400 `InvalidParameterException`
with `Missing required parameter PASSWORD`; including it returned HTTP 400
`NotAuthorizedException`. The corrected request was already present in commit
`18d589f`. The generic UI availability error was the safe mapping of the former
SDK exception, not evidence that a hosted login was needed.

The existing localhost form was also tested against real Cognito with a synthetic
invalid account. It stayed on `/login`, displayed the safe “Reset your password
using Forgot password, then sign in again” response, and the session endpoint
returned 401. This does not establish account existence or a successful login.
No real account password was available to the agent for a new successful-login
test; the user's prior successful login/logout report remains the live evidence.

Lint, typecheck, production build and all 88 tests passed again. `npm ci` passed
in the preceding implementation run; dependencies were unchanged and it was
not rerun for this documentation/test-only follow-up. All work remains local.

The final tests exercised Chromium, Firefox, WebKit and mobile against a
production Next build with an isolated Cognito protocol mock. They cover the
existing application, accessible/mobile login, server redirects, signed JWT
validation, cookie and encrypted-record tampering, actual session expiry,
refresh, CSRF, password changes, MFA selection/enrollment, recovery, logout,
replay and browser Back. These are deterministic tests, not real AWS tests.

A direct real Cognito request with intentionally invalid credentials returned
`NotAuthorizedException` after correcting the initial `USER_AUTH` request to
include `PASSWORD`. The user then reported: **“Login and logout both work”**
using the real browser and account. This is user-verified live success, not an
independently observed full live acceptance run. Live recovery delivery, MFA
configuration variants, refresh rotation over time and managed-login cookie
inspection remain the manual checks listed in the authentication guide.

A public JavaScript check scanned 20 generated chunks without finding the local
session key, test password or private-key markers. Seventeen server tracing
manifests contained no private runtime database, environment or mock-test files.
Node's experimental SQLite warning and existing dependency deprecation warnings
do not fail the checks. No tokens or passwords were added to logs or reports.

## Changed and new files

- `app/(protected)/`: existing six page implementations moved under a protected
  layout without changing their URLs; claim metadata is authenticated and static
  claim parameter generation is removed.
- `app/login/page.tsx`, `app/logout/page.tsx`: branded authentication entry pages.
- `app/api/auth/{csrf,login,logout,recovery,session}/route.ts`: server auth endpoints.
- `components/{auth-shell,auth-request,login-form,logout-form,session-guard}`:
  shared auth presentation, forms and browser session lifecycle handling.
- `components/dynamic-island.tsx`: authenticated account/sign-out navigation.
- `app/layout.tsx`, `app/globals.css`: separate public/protected shells and scoped
  authentication styling preserving the existing operational design.
- `lib/auth/{config,cognito,http,session,store}.ts`: AWS SDK flow, verified JWTs,
  request protections, encrypted server sessions and refresh coordination.
- `lib/api-gateway.ts`: server-only authenticated API boundary, not connected to fixtures.
- `proxy.ts`, `next.config.ts`: lightweight redirects, cache protection and private
  runtime exclusions from deployment tracing.
- `.env.example`, `.gitignore`: server configuration template and ignored private state.
- `package.json`, `package-lock.json`: maintained authentication dependencies and type generation.
- `playwright.config.ts`, `tests/application.spec.ts`,
  `tests/{auth-fixture,authentication.spec}.ts`,
  `tests/{mock-cognito,mock-register,start-server}.mjs`: isolated auth fixtures and tests.
- `README.md`, `docs/architecture.md`, `docs/authentication.md`, this report, and
  `docs/screenshots/login-{desktop,mobile}.png`: setup, architecture and visual evidence.

The pre-existing local `next-env.d.ts` change is preserved outside the implementation commit.

## Setup and remaining boundaries

Use Node 22.13 or later, run `npm ci`, copy `.env.example` to `.env.local` if no
local environment file exists, generate `AUTH_SESSION_KEY` using the template's
command, then run `npm run dev`. The local environment is already configured;
its key must not be committed. See [the full guide](authentication.md) for security
architecture and live test instructions.

Sessions use an opaque HttpOnly cookie and encrypted SQLite server records.
This supports a persistent single host; use a shared session/lock/rate-limit
adapter before deploying across ephemeral or multiple AWS instances.

The seven API Gateway route contracts were not present in the repository or ZIP.
The authenticated boundary is prepared, but method/path/scope mappings must be
verified before connecting it. Demo claims remain fixtures. Real `ownerSub`
authorization and the second-user isolation test remain separate integration work.
Unsupported custom/device/passkey enrollment fails closed. No deploy, push to
main or merge has been performed.
