# AgentShield AU

A faithful Next.js rebuild of the supplied AgentShield AU HTML: charcoal glass surfaces, Dynamic Island navigation, claims investigations, security incidents, reliability and communications.

## Run locally

Requires Node.js 22.13 or later and npm. Sign-in uses the existing AWS Cognito
pool through a branded `/login` screen. All operational routes require a verified
server session.

```sh
npm ci
[ -f .env.local ] || cp .env.example .env.local
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

Additional suites (all synthetic data, no AWS account access):

```sh
AGENTSHIELD_TEST_OPERATIONS=true npx playwright test tests/operations.spec.ts tests/claim-workflows.spec.ts
AGENTSHIELD_TEST_REMOTE_MONITORING=true npx playwright test tests/remote-monitoring.spec.ts
AGENTSHIELD_TEST_REDIS=true npx playwright test   # same suites on the Redis session store
# Lambda tests (need boto3; malware-processor needs moto) and real handlers against simulated AWS
for d in claims-api operations-api monitoring-api malware-processor; do (cd backend/$d && python -m unittest discover -s tests); done
pip install "moto[dynamodb,s3,cloudwatch]" && (cd backend/integration-tests && python -m unittest -v test_integration)
```

## Stack

- Next.js 16.4.2 App Router, React 19.3.0, strict TypeScript 6.0.3.
- Native CSS/SVG animations and charts; no charting or animation runtime.
- Native system fonts; no external font or image requests.
- Exact versions and npm lockfile for reproducible installs.

TypeScript 6 is intentional: the installed Next.js lint stack does not yet support TypeScript 7. ESLint 9 is pinned to satisfy its plugin peer ranges.

## Routes and editing

| Route             | Purpose                                                                              |
| ----------------- | ------------------------------------------------------------------------------------ |
| `/login`          | Cognito credential entry, challenges and password recovery                           |
| `/logout`         | Account information and sign-out confirmation                                        |
| `/`               | Overview: your claim counts, recent claims, monitored alarms, workflow backends      |
| `/claims`         | Claims table with status filters, search, pagination and New claim dialog            |
| `/claim/[uuid]`   | Claim tabs: Overview, Documents, Assessment, Approvals, Payments, Activity           |
| `/security`       | Owner-scoped recorded document scan and quarantine evidence                          |
| `/reliability`    | CloudWatch alarm states and API/Lambda measurements (operator-only)                  |
| `/communications` | SES template preview, variables, content checks, versions & approval, email activity |

- `lib/live-claims.ts`, `lib/claims-api.ts`: live claim contract and authenticated server boundary.
- `lib/documents-api.ts`, `lib/operations-api.ts`, `lib/monitoring/`: server-side clients for the staging APIs, with strict response validation.
- `backend/`: Lambda sources (`claims-api`, `operations-api`, `monitoring-api`, `malware-processor`), their tests, `integration-tests/` (moto) and `staging/` (CloudFormation generator, packaging, change-set scripts). See `docs/release-rollback.md`.
- `app/(protected)/`: server-authenticated operational pages, at their original URLs.
- `lib/auth/`: Cognito SDK, JWT verification, encrypted sessions and CSRF controls.
- `components/`: reusable React interaction and presentation components.
- `app/globals.css`: reference styles plus documented responsive/motion refinements.
- `docs/reference/agent-shield.html`: unchanged source supplied for fidelity comparisons.

## Data boundary

Every page reads live AWS through session-verified Next.js route handlers; the
browser never calls AWS directly and the server needs no AWS access keys (it
forwards the signed-in user's Cognito token to API Gateway JWT authorizers).

- Claims (list, detail, create, edit, cancel, uploads): production Claims API.
- Security documents, operations workflows, template versions and monitoring:
  staging stack `agentshield-task11-stage` (`OPERATIONS_API_ORIGIN`,
  `DOCUMENTS_READ_API_ORIGIN`, `MONITORING_API_ORIGIN`).
- Uploads use signed S3 POST; GuardDuty scans each object and
  `backend/malware-processor` records the result (clean, blocked or quarantined).
- Only owner-matching records reach the browser. Nothing is fabricated: missing
  metrics are never shown as zero, email acceptance is never shown as delivery, and
  payments are recorded workflow events, not money transfers.
- Email sending/delivery tracking is out of demo scope (staging `EnableEmail=false`,
  SES sandbox). Template approval is recorded only; SES is never modified.

Live evidence, investigations, security review, costs and the 12-task tracker:
[final status](docs/final-status.md).

## Deployment

Needs a Node.js Next.js server (not a static export). Sessions are encrypted and
stored in SQLite on a private disk by default, or in Redis over HTTPS when
`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (or Vercel's `KV_REST_API_*`)
are set. Free HTTPS hosting on Vercel + Upstash: [hosting guide](docs/hosting.md).
AWS changes are reviewed CloudFormation change sets with prepared rollbacks:
[release and rollback](docs/release-rollback.md).

See [architecture](docs/architecture.md), [verification](docs/verification.md) and [reference mapping](docs/reference-mapping.md).
