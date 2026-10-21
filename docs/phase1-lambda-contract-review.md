# Phase 1 — supplied Lambda contract review

Reviewed 21 October 2026 (Australia/Sydney). Read-only source inspection.

## Evidence and limits

Input: `/Users/gowthamjaganathan/Downloads/agentshield-claims-api.zip`.
It contains one file, `lambda_function.py`, 708 lines / 24,421 bytes.

- ZIP SHA-256: `87e444d311b98aabb62e2c4bc1e374067a372993327a1808a3f7003115d942f1`
- Source SHA-256: `d80b3fe42f01cf6ad7825d54ea17c16b38f75bd8c52372dbe958ed3870f1b56d`
- Python AST parsing passed. The file was not imported or executed.
- Line references below refer to that exact archive member.

The user identifies this as the deployed source. The archive establishes code
behavior, but contains no API Gateway export, Lambda configuration, IAM policy,
DynamoDB table/index description, SES configuration or malware event processor.
Deployment equivalence, permissions and resource state are not independently
verified. This review does not establish successful live CRUD or isolation.

## Confirmed claims API contract

The handler uses HTTP API JWT authorizer claims and `rawPath`. Its claims table
comes from required environment variable `TABLE_NAME` (lines 12–16), not a
hardcoded table name. Confirm it resolves to `agentshield-claims` in the deployed
configuration. The code expects primary key `claimId` and index
`ownerSub-createdAt-index`; the actual index definition/projection is not included.

### Create: `POST /claims`

Request contains three nonblank strings (trimmed):

```json
{
  "policyNumber": "<actual policy number>",
  "claimType": "<actual claim type>",
  "description": "<claim description>"
}
```

No enumerated claim types, policy existence validation, field length bounds or
idempotency key are implemented. Extra request fields are ignored, including
client-supplied ownership/status. Successful conditional PutItem returns HTTP
201 with the bare claim object (lines 80–132):

| Field | Source/type |
| --- | --- |
| `claimId` | Server-generated UUID string |
| `ownerSub` | Verified authorizer `sub` |
| `policyNumber` | Trimmed request string |
| `claimType` | Trimmed request string |
| `description` | Trimmed request string |
| `status` | Literal `SUBMITTED` |
| `createdAt` | Server UTC ISO timestamp |

**Real email side effect:** after saving, the handler calls Cognito AdminGetUser
with the owner's subject and attempts SESv2 SendEmail if the returned email is
verified. It uses a hardcoded sender and template `AgentShieldClaimCreated`
(lines 99–130). Email failure is caught; the saved claim still returns 201.
Acceptance is logged with an SES message ID but not persisted in the claim or
returned to the caller. This is not delivery tracking. AdminGetUser username
resolution, sender/template readiness, sandbox status and permissions require
live verification; sending is attempted, not guaranteed.

Do not perform a live create test until the user explicitly approves that email
side effect for a specified test recipient. There is no skip-email flag in this
contract. Do not invent one or retry creates automatically after ambiguous timeouts.

### List: `GET /claims?nextToken=...`

HTTP 200 returns `{ "claims": [...], "nextToken": string | null }` (135–174).
The query uses `ownerSub = verified sub`, descending index sort order and a fixed
limit of 25. Only `nextToken` is handled; no API status filter, configurable page
size, search or total count is implemented. Returned items come directly from the
index projection; full record fields on list responses depend on that projection.

The cursor is URL-safe base64-encoded JSON LastEvaluatedKey, not a signed token.
Decoded `ownerSub` must equal the requester. Invalid decoding/type/owner returns
400 `Invalid nextToken`; remaining key-shape validation is delegated to DynamoDB
and can become the generic 500 response. Keep the cursor opaque in the UI and
encode it as a query parameter. It contains owner/key data, so avoid logging it.

No full table scan occurs in this list implementation. The index query is
eventually consistent; a newly created or cancelled item may not immediately be
reflected in list results. Do not label 25 loaded records as the total claim count.
Records missing the owner/index keys cannot appear in the expected index access
path; actual index configuration still needs confirmation.

### Detail: `GET /claims/{claimId}`

HTTP 200 returns the bare stored item after GetItem by `claimId` and an owner
comparison. Missing, foreign-owned and ownerless records return the same 404
`Claim not found` (176–189). No document enrichment occurs. GetItem does not set
ConsistentRead, so immediate read-after-write reconciliation must account for lag.

### Edit: `PATCH /claims/{claimId}`

Request must contain **exactly** `{ "description": "<nonblank string>" }`.
Other fields or combinations return 400 `Only description can be updated`.
UpdateItem atomically requires matching owner and status `SUBMITTED`, returning
the full updated claim (HTTP 200). A failed condition returns 404 `Claim not found
or cannot be edited` (192–230). It does not return 409 for this case.

Policy number, claim type, owner and status cannot be edited through this route.
No `updatedAt`, revision or durable audit history is written. Concurrent valid
description edits are last-writer-wins; no optimistic version check exists.

### Cancel: `DELETE /claims/{claimId}`

This is **soft cancellation**, not deletion (233–264). UpdateItem atomically
requires the owner and `SUBMITTED`; it sets `status = CANCELLED` and UTC
`cancelledAt`, then returns the full item with HTTP 200. The record remains in
list/detail results. It does not remove documents or send an email in this branch.
A foreign/missing/already-cancelled/ineligible record returns 404 `Claim not found
or cannot be cancelled`. A repeated successful cancellation is not an idempotent
200 response. The UI should say “Cancel claim” and explain retention in confirmation.

### Error semantics

Handler errors use `{ "error": string }`. It returns 401 for missing/invalid
authorizer claim shape, 400 for input validation, 404 for unknown/unauthorized/
ineligible claims, and 500 for AWS failures. The document flow also uses 409/415.
No explicit handler 403 or 429 behavior exists; Gateway/Cognito/throttling layers
can supply other errors. BFF handling must support them without claiming they
are documented claims business outcomes. Do not blindly forward exception strings.

## Ownership assessment

Source controls are materially stronger than frontend filtering:

- Lines 55–70 require authorizer JWT claims, `token_use = access` and nonempty
  `sub`. Lambda trusts API Gateway for signature, issuer, audience and expiry.
  Verify all deployed routes use the intended JWT authorizer; code alone cannot
  establish the trust boundary or restrict direct Lambda invocations.
- Create derives `ownerSub` from verified context, never request input.
- List uses an owner-partition query and rejects a cursor from another owner.
- Detail compares stored owner and returns indistinguishable 404 for nonowners.
- Patch/cancel combine owner and permitted-status checks atomically in DynamoDB.
- Ownerless historical records fail detail/write checks; no adoption logic exists.

**No obvious cross-owner CRUD access was found in these source branches. This is
not a passed isolation test.** Verify with two real users and designated records,
including list pagination, direct IDs, forged ownership fields, cursor tampering,
patch/cancel and historical ownerless records. Confirm unauthorized attempts leave
the legitimate owner's records unchanged.

One routing caveat: GET/PATCH/DELETE branches test `claim_id` without checking an
exact item path (179/196/234). Correct API Gateway route definitions matter;
adding a future nested GET could accidentally return the claim instead of its
documents. Use explicit path routing in any future backend patch, with approval.

## Actual field mapping into the existing frontend

| Existing UI | Source-backed replacement |
| --- | --- |
| Fixture `id` | `claimId`; UUID deep links, not `CLM-*` assumptions |
| Customer `name` | No customer-name field; display a claim/policy label, not an invented person |
| `type` | `claimType` |
| New policy/detail form fields | `policyNumber`, `description` |
| Frontend status union | `SUBMITTED` and `CANCELLED` are the only states written here; safely display other persisted states without inventing transitions |
| Created/cancelled times | `createdAt`, optional `cancelledAt`; no updated time exists |
| Risk/exposure/location | No corresponding fields created here; unavailable unless independently verified |
| Approve/Escalate | Unsupported; cannot PATCH status or convert this into payment processing |
| Edit | Description only while submitted |
| Delete | Cancel with explicit confirmation; retain record in the UI |
| Timeline/audit | Created/cancelled facts only, not invented investigation or edit history |
| Claim document array | Not returned/enriched by this handler; no substitute fixture documents |
| Counts/filters | Loaded-page counts/local filters must be labeled as such; no total/status aggregate endpoint |

Preserve the layout, styling, responsive workspace and navigation. Adjust wording
and supported controls to match these facts. Do not force this API into the old
required amount/risk/name/document model or derive approvals from mock scores.

## Phase 2 observations discovered during full source read

These are dependency findings, not a start of Phase 2 implementation:

- Upload intent expects `fileName`, `contentType`, integer `sizeBytes`; PDF/JPEG/PNG
  only, with a strict size bound below 10 MiB (lines 275–316).
- The returned `uploadUrl` is a **presigned multipart POST**, not a presigned PUT.
  Response includes `documentId`, `fields`, `objectKey`, `maxBytes`, `expiresIn`
  (300 seconds) and `scanStatus: PENDING` (333–407). Use the signed form fields
  exactly; never infer the HTTP method from the endpoint name.
- Intent writes `agentshield-documents` with owner/claim binding, expected size,
  content type, file name, status `PENDING_UPLOAD`, scanStatus `PENDING`, timestamp
  and object key. Claim must belong to the owner and be `SUBMITTED`.
- Completion checks owner/claim/intent, S3 size/type/metadata and a file signature,
  then conditionally writes `PENDING_SCAN`, verified time, actual size, version and
  ETag. File-signature checking is expressly not malware scanning.
- An early scan-result reconciliation compares persisted version/ETag/owner/key
  and the version's GuardDuty status tag before conditional state advancement.
  Results include SCAN_CLEAN, QUARANTINE_REQUIRED and SCAN_BLOCKED. This is not
  proof that a quarantine copy/delete succeeded or an event rule is enabled.
- Completion returns persisted `documentId`, `claimId`, `status`, `scanStatus`.
  A retry after success is rejected by its PENDING_UPLOAD eligibility check;
  retry-safe completion/recovery requires a design review, not blind POST retries.
- No document-list/download endpoint or GuardDuty/EventBridge processor is present.
  The named documents table may have a suitable index, but the ZIP cannot prove it.
- Claim eligibility reads and document writes are separate operations. Review
  cancellation/upload races and version consistency before Phase 2 acceptance.

## Updated implementation and cloud-change plan

1. Confirm `TABLE_NAME`, deployed GSI keys/projection/status, API route/authorizer
   configuration and relevant Lambda permissions from read-only exports. No
   additional endpoint is required for basic claims list/detail/create/edit/cancel.
2. Build local runtime-validated DTOs from this contract and explicit server-only
   BFF collection/item handlers using existing Cognito access-token sessions and
   CSRF checks. Validate IDs/query parameters; do not expose ownerSub for editing.
3. Connect the existing workspace to list/detail, load-more cursor navigation,
   real empty/error states and description editing/cancellation. Use separate
   detail loading so deep links work for claims outside the loaded list page.
4. Create can be implemented/tested against controlled fixtures locally, but live
   create is gated by explicit approval of the SES side effect. Do not call a
   fake no-email parameter. Preserve a successful POST response as confirmed
   data during bounded eventual-consistency reconciliation; avoid duplicate creates.
5. Implement 30-second active-view refresh with cancellation/deduplication and
   bounded read retries; pause hidden tabs. Surface last-refresh failures. Do not
   repeatedly crawl all pages for counts or make unsourced summary totals.
6. Update regression tests to this real schema, including 404 for edit/cancel
   ineligibility and no payment promises. Run lint/typecheck/build/browser tests
   after implementation, then real two-user persistence/isolation testing.

No required claims Lambda change is established for this limited supported scope.
Broader status editing, updated timestamps, edit history, idempotent creates,
accurate total aggregations and document reads are missing capabilities that
need separate requirements and review. Any Lambda/index/IAM/resource changes
remain local proposals until approved; no deployment or GitHub push is authorized.

The observed claims operations require DynamoDB Query on the actual GSI and
GetItem/PutItem/UpdateItem on the configured table; cancellation does not require
DeleteItem. Existing create also requires the Cognito lookup and SES send permissions
to work. Inspect existing policies before proposing least-privilege changes.
Reuse current infrastructure. At 30-second polling, one active resource generates
up to 120 requests per browser hour plus actions/retries; costs depend on actual
traffic, item sizes, index projection and billing configuration. No unverified
dollar estimate or new infrastructure is proposed.

## Verification performed and next gate

Performed: archive inventory, full source read, hash capture, Python syntax parse,
static route/schema/ownership/side-effect analysis. No boto3 code was executed.
No Lambda edits, real CRUD, S3 upload, SES send, deployment or push occurred.
Application code is unchanged; lint/build/Playwright were not rerun for this
documentation-only audit. Prior authentication tests do not prove live claims.

Review this contract and plan before significant frontend changes. Live Phase 1
acceptance additionally requires two secure test accounts, approved disposable
records, verified AWS configuration and explicit approval before a create test
can send its confirmation email. No phase is declared live by this source review.
