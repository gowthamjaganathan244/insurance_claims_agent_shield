# AgentShield AU

A faithful Next.js rebuild of the supplied AgentShield AU HTML: charcoal glass surfaces, Dynamic Island navigation, claims investigations, security incidents, reliability and communications.

## Run locally

Requires Node.js 22.13 or later and npm. Sign-in uses the existing AWS Cognito
pool through a branded `/login` screen. All operational routes require a verified
server session.

```sh
npm ci
cp .env.example .env.local
# Set AUTH_SESSION_KEY to a random 32-byte hex value before starting.
npm run dev
```

Do not overwrite an existing `.env.local`. Generate a key with
`node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
Open http://localhost:3000. See [authentication setup and live testing](docs/authentication.md).
For a local production build:

```sh
npm run check
npm run start
```

## Verification

```sh
npx playwright install chromium firefox webkit
npm run test:e2e
```

Browser tests run against the production build on port 3100 with a test-only
Cognito network provider (port 3199) and signed JWTs. They cover authentication,
six viewport widths (320–1920px), all views, state changes, navigation, keyboard
interactions, reduced motion, accessibility, and console/hydration errors. CI runs
the same checks. They do not claim live AWS authentication passed.

## Stack

- Next.js 16.4.0 App Router, React 19.3.0, strict TypeScript 6.0.3.
- Native CSS/SVG animations and charts; no charting or animation runtime.
- Native system fonts; no external font or image requests.
- Exact versions and npm lockfile for reproducible installs.

TypeScript 6 is intentional: the installed Next.js lint stack does not yet support TypeScript 7. ESLint 9 is pinned to satisfy its plugin peer ranges.

## Routes and editing

| Route              | Purpose                                                    |
| ------------------ | ---------------------------------------------------------- |
| `/login`           | Cognito credential entry, challenges and password recovery |
| `/logout`          | Account information and sign-out confirmation              |
| `/`                | Command dashboard and operational storyline                |
| `/claims`          | Filterable claims, desktop investigation workspace         |
| `/claim/CLM-48213` | Claim journey, evidence, actions, payment and audit        |
| `/security`        | Expandable incident investigations                         |
| `/reliability`     | Latency chart, service health, deployment history          |
| `/communications`  | Template editing, variables, history and delivery          |

- `lib/fixtures.json`: exact reference records and message content.
- `lib/types.ts`: domain types.
- `lib/claims.ts`: shared claim rules, formatting and deterministic sample generation.
- `app/(protected)/`: server-authenticated operational pages, at their original URLs.
- `lib/auth/`: Cognito SDK, JWT verification, encrypted sessions and CSRF controls.
- `components/`: reusable React interaction and presentation components.
- `app/globals.css`: reference styles plus documented responsive/motion refinements.
- `docs/reference/agent-shield.html`: unchanged source supplied for fidelity comparisons.

## Data boundary

This is a production-buildable **demonstration frontend** with real Cognito
authentication. Claim data and operational metrics remain illustrative; no live
claims backend, telemetry, malware scanner, payment provider or message delivery
is connected. Claim actions persist across client-side navigation in the current
page session and reset on reload. Template drafts persist across tabs and template
selections while the communications view is mounted; they reset when leaving that
view or reloading. No claim action sends a message or releases money.

Verify the seven API Gateway contracts, server-side ownerSub authorization and
second-user isolation before connecting real data. The server-only API boundary
is prepared but unused. Do not expose personal claim records in public client bundles.

## Deployment

The app requires a Node.js Next.js server, server-only environment configuration,
and a private persistent session store. It is not a static export. Local SQLite
must be replaced with a shared session adapter before multi-host or ephemeral
serverless deployment. Review the [authentication deployment constraints](docs/authentication.md)
before selecting a host. The prior Sites/Cloudflare runtime is not used.

See [architecture](docs/architecture.md), [verification](docs/verification.md) and [reference mapping](docs/reference-mapping.md).
