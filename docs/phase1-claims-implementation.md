# Phase 1 claims page implementation

21 October 2026 (Australia/Sydney). Local changes only.

## Cause and replacement

The old Claims workspace read `useClaims()`, whose provider initialized from
`initialClaims` in `lib/data.ts`, exported from `lib/fixtures.json`. Detail pages
also rejected IDs missing from that fixture. The new workspace and UUID detail
view do not import that store or fixture. The demo store remains for the untouched
Command dashboard; no other dashboard has been integrated.

Browser `/api/claims` and `/api/claims/[id]` requests now use a server-only adapter
that verifies the existing session, forwards its access token to the fixed AWS
API origin, disables caching/redirect following and applies a 10-second upstream
timeout. Tokens and refresh tokens are never returned to the client. Mutations
use existing Origin/CSRF controls and accept only description edits or empty
cancellation requests. No create/email endpoint was introduced.

## Source-backed API structure

The supplied Lambda returns:

```text
GET /claims:
{ claims: [
  { claimId, ownerSub, policyNumber, claimType, description,
    status, createdAt, cancelledAt? }
], nextToken: string | null }

GET /claims/{claimId}, PATCH, DELETE:
{ claimId, ownerSub, policyNumber, claimType, description,
  status, createdAt, cancelledAt? }
```

These are the inspected Lambda's fields, not a captured successful live response.
The list queries `ownerSub-createdAt-index`, newest first, fixed limit 25. Its
index projection must include the required UI fields; incomplete records produce
an explicit error. There is no global count or server status filter. Filters and
counts are explicitly scoped to the current page. The BFF projects only validated
fields and does not expose ownerSub; it passes the opaque pagination token through.

Backend ownership checks remain authoritative. As defense in depth, the BFF
excludes ownerless or foreign-owner list records and denies such detail records.
No historical ownership assignment or DynamoDB migration is attempted. An empty
owned list is not treated as a backend failure or filled with fixtures.

## UI behavior

Existing workspace classes, glass theme, navigation and responsive row behavior
are retained. Policy number labels replace invented customer names. Unsupported
risk, money, payment, document and investigation information is explicitly
unavailable. Detail pages support real UUIDs instead of fixture IDs.

There are loading, empty, error, manual refresh and last-successful-update states.
Each mounted view polls every 30 seconds, without overlapping requests; failures
back off to 60 then 120 seconds. Hidden tabs pause and abort reads, visibility
restoration refreshes, and unmount cancels requests. Cursor navigation does not
crawl all pages or claim to know account totals.

Description editing and confirmed soft cancellation refresh after successful
mutations. POST/create is not enabled. Mutations are not retried automatically.
The Lambda uses eventually consistent reads/index queries, so post-mutation
refetch can briefly lag the write. It has no edit version or updatedAt field;
concurrent description edits remain last-writer-wins. Cancellation retains the
record, changes status to CANCELLED and prevents further editing.

## Changed files

- `lib/live-claims.ts`: actual contract, ownership filtering and field projection.
- `lib/claims-api.ts`: verified server API boundary and safe HTTP error mapping.
- `app/api/claims/route.ts`, `app/api/claims/[id]/route.ts`: read/mutation BFF handlers.
- `components/claims-workspace.tsx`: real list, selection, filters and pagination.
- `components/use-live-claims.ts`: refresh/polling lifecycle and failure states.
- `components/live-claim-panel.tsx`: real fields, description edit, cancel confirmation.
- `components/live-claim-detail.tsx`: independent deep-link loading.
- `app/(protected)/claims/page.tsx`, `app/(protected)/claim/[id]/page.tsx`: claims entry pages.
- `tests/mock-claims.mjs`, `tests/mock-register.mjs`, `tests/live-claims.spec.ts`,
  `tests/application.spec.ts`: isolated contract tests and updated feature checks.
- `README.md`, `docs/architecture.md`, Phase 1 audit/contract/implementation reports.

Cognito code and styling were not changed. Existing `next-env.d.ts` user changes
are preserved separately from the implementation.

## Verification boundary

Final local results: `npm run lint` passed; `npm run typecheck` passed;
`npm run build` passed; `npm run test:e2e` **116 passed in 32.4 seconds** across
Chromium, Firefox, WebKit and mobile. The first run had 114 passes and two
failures; the save test now waits for the successful PATCH and new claim links
have eager prefetch disabled, consistent with the existing navigation policy.
Node reported its existing experimental SQLite warning. No dependencies changed.


The browser suite intercepts AWS calls only inside its isolated server process.
Production has no mock switch or fallback. Tests check authorization rejection,
ownerless/foreign record exclusion, pagination, bad-schema/service failure/empty
states, persisted description edit and cancellation, CSRF, hidden-tab polling,
existing authentication, accessibility and responsive layouts.

On 21 October 2026, the user confirmed live verification: **“IDs and fields match;
unowned records absent. Refresh and pagination were checked where available.”**
This establishes user-reported live Claims/DynamoDB agreement for the tested
account, separate from the automated fixture tests. The agent did not independently
observe the browser or read DynamoDB. Second-user authorization remains unverified.
No real mutation, email, cloud deployment or push was performed by the agent.

The next gate is [two-user isolation verification](phase1-isolation-verification.md).

To complete live verification, sign in normally at localhost:3000 and open
`/claims`. Inspect the same-origin `/api/claims` request status without copying
cookies or tokens. Compare each displayed UUID and owner with the authorized
records in the DynamoDB console, page through results, and verify historical
ownerless records are absent. Report only pass/fail and safe error text. Repeat
with a separate test user and confirm mutual list/detail/edit/cancel isolation
using designated test records. Do not mutate real customer records for testing.
