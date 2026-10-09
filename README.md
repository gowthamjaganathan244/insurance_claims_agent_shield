# AgentShield AU

A faithful Next.js rebuild of the supplied AgentShield AU HTML: charcoal glass surfaces, Dynamic Island navigation, claims investigations, security incidents, reliability and communications.

## Run locally

Requires Node.js 22 or later and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. For production:

```sh
npm run check
npm run start
```

## Verification

```sh
npx playwright install chromium firefox webkit
npm run test:e2e
```

Browser tests run against the production build on port 3100. They cover six viewport widths (320–1920px), all views, state changes, navigation, keyboard interactions, reduced motion, accessibility, and console/hydration errors. CI runs the same checks.

## Stack

- Next.js 16.4.0 App Router, React 19.3.0, strict TypeScript 6.0.3.
- Native CSS/SVG animations and charts; no charting or animation runtime.
- Native system fonts; no external font or image requests.
- Exact versions and npm lockfile for reproducible installs.

TypeScript 6 is intentional: the installed Next.js lint stack does not yet support TypeScript 7. ESLint 9 is pinned to satisfy its plugin peer ranges.

## Routes and editing

| Route              | Purpose                                             |
| ------------------ | --------------------------------------------------- |
| `/`                | Command dashboard and operational storyline         |
| `/claims`          | Filterable claims, desktop investigation workspace  |
| `/claim/CLM-48213` | Claim journey, evidence, actions, payment and audit |
| `/security`        | Expandable incident investigations                  |
| `/reliability`     | Latency chart, service health, deployment history   |
| `/communications`  | Template editing, variables, history and delivery   |

- `lib/fixtures.json`: exact reference records and message content.
- `lib/types.ts`: domain types.
- `lib/claims.ts`: shared claim rules, formatting and deterministic sample generation.
- `components/`: reusable React interaction and presentation components.
- `app/globals.css`: reference styles plus documented responsive/motion refinements.
- `docs/reference/agent-shield.html`: unchanged source supplied for fidelity comparisons.

## Data boundary

This is a production-buildable **demonstration frontend**, matching the supplied HTML. The source supplies no backend, authentication, live telemetry, malware scanner, payment provider or message delivery API. All data is illustrative. Claim actions persist across client-side navigation in the current page session and reset on reload. Template drafts persist across tabs and template selections while the communications view is mounted; they reset when leaving that view or reloading. No action sends a message or releases money.

Connect authenticated server-side APIs, authorization and durable audit storage before using this with real claim data. Do not expose personal claim records in public client bundles.

## Deployment

Deploy as a standard Node.js Next.js application using `npm ci`, `npm run build`, then `npm run start`. Set `PORT` to override port 3000. No environment variables are required for the demo. Dynamic investigation pages need a Next.js server; this project is not configured for a static-only host. The prior deleted project's Sites/Cloudflare runtime is not used by this rebuild.

See [architecture](docs/architecture.md), [verification](docs/verification.md) and [reference mapping](docs/reference-mapping.md).
