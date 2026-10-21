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

The Claims list and UUID claim detail routes now call the existing AWS claims API
through session-verified Next.js handlers. They have no demonstration fallback.
Only owner-matching records are projected into the browser; historical unowned
records are excluded. Description editing and cancellation use the supported
PATCH/DELETE contracts. Creation is not enabled because it sends a real SES email.

Command, Security, Reliability and Communications show explicit unavailable states
until their data sources are connected. No demo provider or fictional operational
record is mounted on live routes. Historical fixture/reference files remain in the
repository but are not a runtime fallback. Navbar monitoring shows Health unavailable.
See [truthful live screens](docs/live-data-phase1.md) for the source inventory and next gates.

See [Phase 1 implementation and verification](docs/phase1-claims-implementation.md).
Live API success, DynamoDB ID comparison and second-user isolation must be
recorded separately from automated contract-fixture tests.

## Deployment

The app requires a Node.js Next.js server, server-only environment configuration,
and a private persistent session store. It is not a static export. Local SQLite
must be replaced with a shared session adapter before multi-host or ephemeral
serverless deployment. Review the [authentication deployment constraints](docs/authentication.md)
before selecting a host. The prior Sites/Cloudflare runtime is not used.

See [architecture](docs/architecture.md), [verification](docs/verification.md) and [reference mapping](docs/reference-mapping.md).
