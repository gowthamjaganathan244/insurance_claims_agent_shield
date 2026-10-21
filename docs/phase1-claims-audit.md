# Phase 1 — claims integration audit and proposed plan

**Update:** The supplied Lambda ZIP has now been inspected. See
[source-backed API contract and findings](phase1-lambda-contract-review.md).
That follow-up supersedes this initial report's unknown-schema findings. Live
configuration, deployed-source equivalence and two-user isolation remain unverified.

21 October 2026, Australia/Sydney. Audit only; no application or AWS changes.
Local branch: `feature/task11-authentication`, implementation baseline `d7f97be`.

## Decision and evidence boundary

The custom Cognito login is implemented; claims are still demonstration data.
Phase 1 is **not ready to be declared live**. The frontend needs an actual API
contract, verified backend owner enforcement and a successful two-user isolation
test before live integration can be accepted.

Inspected the local file inventory, claims types/fixtures/store, all operational
page implementations, shared claim/analysis/journey/storyline components,
communications and latency generation, authentication/session/BFF implementation,
navigation, application tests, and architecture/setup/verification documentation.
This is a Phase 1 dependency audit, not a renewed exhaustive stylesheet review
or verification of later-phase cloud services.

Current page paths are under `app/(protected)/`; the user-facing URLs have not
changed. The old `app/page.tsx` paths in reference documentation are stale.
The pre-existing `next-env.d.ts` modification remains untouched by this audit.

Live read-only checks against the supplied API origin:

| Request | Observed result |
| --- | --- |
| Anonymous `GET /claims` | HTTP 401, JSON content type |
| Anonymous `GET /claims/audit-nonexistent-claim` | HTTP 401, JSON content type |

These prove rejection of these anonymous requests, not authorizer settings,
authenticated route functionality, schema correctness or claim ownership.
Response bodies were not printed. No write endpoint was invoked.

No AWS CLI was found on PATH or at the checked standard installation paths.
No default `~/.aws/config`, `~/.aws/credentials`, project `.aws` directory or
`AWS_*` environment variables were found. No AWS management connector, Lambda
implementation, IaC definition or API schema was found in the available project
and tools. A differently located profile/source export may still exist.
No user session tokens were extracted from the encrypted session database.

## Current claims architecture and defects for real data

- `lib/data.ts` exports `initialClaims` from `lib/fixtures.json`: **8 claims and
  20 document entries**, unrelated to the 4,218 dashboard figure.
- `lib/types.ts` requires `id`, `name`, `type`, `amt`, `status`, `risk`, `loc`,
  and `docs`. Documents contain only `n` and `s`. No owner, backend timestamp,
  cursor, version or durable event identifier is represented.
- `components/claim-store.tsx` initializes from fixtures; `update` changes React
  state and appends a local time/“Assessor” audit tuple. Reload discards changes.
  No create, delete or persisted editing operation exists.
- `claims-workspace.tsx` selects a fixed initial ID, filters local statuses and
  sorts by invented risk. Its empty state covers an empty filter only, with no
  loading, fetch failure, pagination, conflict or last-refreshed state.
- `app/(protected)/claim/[id]/page.tsx` validates against `initialClaims` after
  authenticating. A genuine AWS ID therefore returns 404 today.
- `claim-detail.tsx` assumes the selected claim exists in the global store via a
  non-null assertion. Real detail loading must work independently of list pages.
- `command-analysis.tsx` assumes `claims[0]` exists. A user with zero real claims
  would break this component unless its empty state is repaired during Phase 1.
- `analysis.tsx`, `journey.tsx` and `lib/claims.ts` invent confidence, risk
  recommendations, security holds, progress, scan evidence and history. Approve
  and Escalate only invoke the local store; they do not authorize a backend action.
- `claim-detail.tsx` interprets Approved as payment scheduled within two business
  days. This must not remain a live claim assertion without a payment backend.
- No claims polling, cancellation, deduplication or persisted mutation exists.
  `SessionGuard` polls authentication every 60 seconds, including hidden tabs;
  that is not claims refresh and needs visibility-aware coordination later.

## UI data-source mapping

All AWS mappings below are **candidate resources named by the user**, not verified
field mappings. No API property names beyond the supplied path parameters are
assumed. Obtain actual schemas before defining the replacement domain model.

| UI field/action | Current source | Proposed source / acceptance condition |
| --- | --- | --- |
| Claim identifier and detail link | Fixture `id` | Actual identifier returned by list/detail API; encode and validate paths |
| Claim name/type/location | Fixture `name/type/loc` | Map only fields actually returned by claims API; otherwise unavailable |
| Exposure/currency | Fixture `amt`, unconditional AUD formatting | Verified amount and currency contract; no assumed monetary value |
| Status/filter/allowed actions | Frontend status union and risk thresholds | Actual backend enum and transition rules; no invented approvals |
| Claim create/update times | Missing; fabricated timeline times | Persisted API timestamps, displayed in Australia/Sydney with timezone |
| Create/edit/delete | Not implemented | Existing POST/PATCH/DELETE after validation/ownership contracts verified |
| Claim count/status counts | Local subset or fixed dashboard figures | Owner-scoped paginated API/verified aggregate; never label page length a total |
| Risk, confidence, correlations | Fixture risk and formulas | No verified source; show unavailable and disable simulated decisions |
| Audit/storyline/actor | Fixture EV, generated events, React audit | Persisted authorized events if present; otherwise “History unavailable” |
| Journey stages/payment promise | Static six-stage model and status inference | Only confirmed workflow facts; settlement/payment unavailable |
| Document name/scan status | Fixture `{n,s}` | Later: owner-authorized document records from reported `agentshield-documents` |
| Malware evidence/quarantine | Static `scanEvidence`/incidents | Later: verified processing records, keeping scan and remediation separate |
| Claim incidents/investigation | Fixture incident links and narratives | Later: authorized persisted security records; no fabricated investigation |

The reported `agentshield-claims` table and `agentshield-claims-api` Lambda are
the expected claims storage/service boundary, but their live schema, indexes,
runtime code, integration mapping and status are unverified.

Cross-page demo dependencies that Phase 1 must not accidentally present as live:

| Location | Demonstration content found | Later candidate integration |
| --- | --- | --- |
| Command page | 4,218 claims; 37 attention; pipeline 388/1,204/842/1,096/512/176; 41 held; 23 retrying; fixed Healthy labels and storyline | Owner-scoped claims/doc aggregates; absent business systems stay unavailable |
| Dynamic Island | “2 services degraded” fixed status | Verified operational health with appropriate access controls |
| Security | 4 fixture incidents, evidence, AI analysis, root causes, remediation, approvals and timelines | Authorized document/security projections; not automatically GuardDuty findings |
| Reliability | 99.97% availability, 99.9% target, 0.31% errors, 82/241/1,420ms percentiles, 38% rise, 146 delayed claims, 23 retries, +11min settlement, 0 lost claims | Verified CloudWatch measurements; no assumed business causal impact |
| Reliability chart/services | Seeded 48-sample series and health strips; invented service/impact and version narratives | Actual metric timestamps/periods; no-data distinct from healthy |
| Deployments/alerts | 4 fixture deployments and 4 alerts | Verified deployment/audit/CloudWatch sources if present |
| Communications | 7 fixture templates; local draft editing; seeded sent/failed/delivery figures; fixed version/audit authors/times and retry promise | Verified SES templates/message persistence/events; sending remains disabled pending authorization |

These later modules are not implemented by this audit. During staged integration,
keep their panels explicitly marked demonstration/unavailable rather than mix
their figures into live claims. Preserve layouts and visual components.

## Endpoint and missing-contract inventory

These seven routes are supplied by the user; only the two anonymous reads above
were probed. No successful authenticated response schema is verified yet.

| Existing route | Needed contract/evidence before use |
| --- | --- |
| `GET /claims` | Response envelope, owner query, pagination cursor/limits, filtering/order, total semantics |
| `GET /claims/{claimId}` | Item envelope, fields, missing/foreign-ID behavior, document inclusion |
| `POST /claims` | Required/optional fields, validation, server-generated identifier/owner/timestamps, response, idempotency and side effects |
| `PATCH /claims/{claimId}` | Allowed fields/transitions, concurrency/version handling, forbidden owner changes, response |
| `DELETE /claims/{claimId}` | Hard/soft delete, owner condition, document/email side effects, success status and retry semantics |
| `POST /claims/{claimId}/documents/upload-url` | Phase 2: file constraints, owner check, presign method/headers/expiry/metadata |
| `POST /claims/{claimId}/documents/{documentId}/complete` | Phase 2: owner/document binding, object verification, idempotency and persisted response |

No missing AWS CRUD endpoint is established: reuse the five reported CRUD routes.
Document-list, event-history or aggregate endpoints might be needed only after
checking the current response contract. Do not create speculative routes.

## Server boundary and authorization plan

Reuse `lib/auth`: real Cognito USER_AUTH, signature/issuer/client/token-use/expiry
verification, encrypted server sessions, refresh, CSRF and HttpOnly cookies.
Keep the custom login and existing redirects. No new identity system or browser tokens.

`lib/api-gateway.ts` is currently unused. It already verifies the server session,
uses its access token, restricts origin/path, disables cache/redirect following
and sets a timeout. It does not yet provide typed operations, runtime request or
response validation, pagination, structured errors, or bounded retries.
Its path validation currently rejects query strings, so pagination needs a
separately validated query builder, not arbitrary URL forwarding.

Propose same-origin Next BFF collection/item route handlers (local paths to be
implemented after approval), not a generic URL proxy. Each handler independently
verifies the session; unauthenticated JSON calls return 401 instead of HTML
redirects. Reuse the mutation CSRF controls with claim-specific validation.
Return safe status-aware errors: 401 login; 403 denied; 404 unavailable/missing;
409 conflict plus refetch; 429 bounded Retry-After; 500/timeout service error.
Preserve safe backend field validation messages without forwarding raw internals.
Never silently fall back to fixtures.

Verify the actual API authorizer issuer/audience and route scopes against access
tokens from this existing USER_AUTH flow. Scope mismatches are a configuration
finding, not permission to switch token types or change AWS settings. API Gateway
passes verified JWT claims to Lambda; that does not by itself enforce record
ownership. See [AWS JWT authorizer documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html).

Required backend invariants to inspect and test:

- Derive owner from verified JWT `sub`, never browser JSON/query/cursor.
- Scope list queries to that owner; read/update/delete require the same owner.
- Create assigns the verified owner server-side; reject ownership reassignment.
- Historical rows without `ownerSub` remain inaccessible; no automatic adoption.
- Make write ownership checks atomic, avoiding read-then-write authorization races.
- Bind pagination to the requesting owner and prevent malformed/tampered cursor
  traversal. Do not rely on frontend filtering.
- Apply the same ownership boundary to nested document operations in Phase 2.

## Lambda, DynamoDB, IAM and cost gate

No cloud change is currently proposed as confirmed necessary. Inspect existing
Lambda code, table keys/indexes and IAM first. If owner enforcement or atomic
conditions are missing, prepare a local reviewed patch and obtain approval before
deployment. If no owner-keyed access path exists, propose a suitable owner index
only after examining the existing keys and access patterns; never scan all tenants
and filter client-side. Review index storage/write/backfill impact before approval.

Runtime Next BFF needs the Cognito access token, not broad AWS credentials.
The Lambda role should have only necessary GetItem/Query/PutItem/UpdateItem/DeleteItem
permissions on the actual claims table and required index, plus existing logging.
Do not grant new permissions based on this proposed list without inspecting code.
For read-only audit, configuration/source exports or scoped API Gateway, Lambda,
IAM and DynamoDB describe access are enough; no table scan is needed.

Use bounded page sizes and cursor pagination. A filtered DynamoDB Query still
consumes reads for evaluated items and can return an empty page with a continuation
key; do not assume it is cheaper or complete. See [AWS Query documentation](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_Query.html).

Proposed 30-second active-view polling means up to 120 reads per active browser
hour per polled resource, before manual refreshes/mutations/retries. At 20 seconds
it is 180. Use one shared query per resource, no overlapping requests, pause hidden
tabs, cancel on navigation, jitter/backoff and a manual Refresh button. Retry reads
only a bounded number of times for transient failures; do not blindly retry POST
or other mutations without a verified idempotency contract. Avoid fetching every
page on each tick. Totals require a verified total/aggregate contract, not a scan.

No dollar estimate is defensible yet: traffic, page/item sizes, table billing mode,
indexes and Lambda duration are unknown. Audit probes were two API requests;
implementation adds normal API/Lambda/DynamoDB usage, not new always-on resources.
Keep Budgets and safeguards untouched. No AWS resource will be created, modified,
enabled or deployed without approval.

## Proposed Phase 1 sequence and acceptance gate

1. Obtain Lambda source/API export and table/index metadata or scoped read-only
   access. Record actual schemas, auth requirements, status transitions and all
   write side effects (including potential email sends) before smoke mutations.
2. Review backend owner enforcement and access-token compatibility. Prepare any
   necessary cloud patch separately for approval. Do not integrate around a leak.
3. Define validated types/adapters from actual payloads; implement explicit BFF
   collection/item handlers with safe errors, CSRF, no-store and timeouts.
4. Replace the claims fixture store with paginated server-backed state. Implement
   list/detail/create/edit/confirmed-delete and refresh after success. Remove the
   fixture-only ID gate; handle deep links and empty/loading/error/conflict states.
5. Preserve the existing layout, tabs, mobile navigation and glass styling. Replace
   unsupported facts with unavailable states and simulated actions with disabled
   explanations. Repair first-claim assumptions and label later-phase demo panels.
6. Add active-view polling, cancellation/deduplication/backoff and last-updated
   state. Do not leave stale data looking current after a failed refresh.
7. Add contract-backed controlled API fixtures and run lint/typecheck/build and
   browser tests. Existing tests assert fixture names, counts and payment promises;
   revise those assertions rather than preserving fictional business behavior.
8. With two dedicated real Cognito users, verify create/read/update persistence
   across refresh, pagination and delete using designated disposable records.
   Verify user B cannot list, read, patch, delete or take ownership of user A's
   claim; repeat in reverse. Assert failed attempts do not change either record.
   Verify historical ownerless rows remain hidden using an approved existing test
   record, without modifying real legacy data. Never trigger customer email sends
   without explicit confirmation.

Phase 1 remains incomplete until that live two-user test passes. Do not proceed
to documents or later phases on the strength of mock tests alone.

## What is needed for the next checkpoint

Provide the local backend source/API export paths, an available read-only AWS
profile/session, or sanitized schemas and request/response examples. Do not paste
AWS keys, passwords or tokens. Later live tests need two securely supplied test
accounts and confirmed safe test data/workflows. The separate question in chat
asks which evidence source is available.

No builds or application tests were rerun for this audit-only report. The prior
88-test authentication pass is historical evidence, not a live claims result.
No code, cloud configuration, claim record, document or email was changed.
