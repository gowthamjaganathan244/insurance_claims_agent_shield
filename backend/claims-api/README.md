# Claims Lambda: local document metadata read proposal

Prepared locally from the supplied `agentshield-claims-api.zip`, without executing its AWS operations. This folder is not wired into deployment or the frontend. No AWS resources, IAM policies, routes, EventBridge rules or records changed. No commit or push was made.

Source ZIP SHA-256: `87e444d311b98aabb62e2c4bc1e374067a372993327a1808a3f7003115d942f1`.
Original `lambda_function.py` SHA-256: `d80b3fe42f01cf6ad7825d54ea17c16b38f75bd8c52372dbe958ed3870f1b56d`.

The user confirms `agentshield-documents` has an ACTIVE `claimId-createdAt-index` with ALL projection and the existing Lambda role can Query it. No new index, IAM permission, table or Lambda is proposed here. Claim GetItem access is already used by the original handler.

## Files for review

- `lambda_function.py`: full existing handler with the new document read operation.
- `documents-read.patch`: exact unified diff against the supplied ZIP member.
- `tests/test_documents.py`: offline Python standard-library unittest suite with AWS imports and transports replaced before loading the handler.

## Contract

`GET /claims/{claimId}/documents?nextToken=<opaque cursor>`

Successful response: `{ "documents": [...], "nextToken": string | null }` with private/no-store caching. One descending index query evaluates at most 25 records per request. A page may contain fewer records, or no visible records, while still providing a nextToken; callers must use nextToken to determine whether another page exists. GSI reads are eventually consistent.

Authentication reuses the existing trusted API Gateway JWT authorizer context. Requires token_use=access and a nonempty string sub. A browser-supplied Authorization header is not trusted directly by this Lambda. API Gateway remains responsible for signature/issuer/audience/expiry verification; direct Lambda invocation permissions must remain restricted. Invalid signed/expired JWT rejection at API Gateway requires later live validation.

Before touching the documents index, the handler reads the claim consistently and compares claim.ownerSub to the verified subject. Missing, foreign and historical unowned claims return the same 404. Each returned document must also match both ownerSub and claimId; unowned/foreign/inconsistent entries are excluded. The response never adopts historical records.

The base64 JSON cursor binds version, requester sub, claimId and the exact three DynamoDB key fields. Length, encoding, JSON shape, version, document ID and timezone-bearing timestamp are validated. It is an unsigned position cursor, not a credential: a caller can choose a different valid position within their authorized claim, but cannot obtain another claim/user's data. Ownership is rechecked independently on every request. Do not log cursors; base64 is not encryption. Raw LastEvaluatedKey fields are not accepted from the browser.

Allowed metadata fields (only when actually present):

- documentId, claimId, fileName, contentType, status, scanStatus, createdAt
- verifiedAt, scanCompletedAt, quarantineCopiedAt, sourceIsolatedAt
- quarantineCopyVerified, sourceIsolationPending
- expectedSizeBytes, actualSizeBytes (DynamoDB Decimal integers safely serialized)

No ownerSub field is returned in document objects. No objectKey, bucket, version IDs, ETags, quarantine location, object contents, signing fields, presigned URL or download URL is exposed. Unknown fields are dropped. Invalid owned metadata fails safely with a generic service error rather than manufacturing values.

Status fields are copied from recorded evidence, not inferred: THREATS_FOUND does not imply quarantine copying; QUARANTINE_COPIED does not imply source isolation. Absent isolation/copy flags or timestamps stay absent. This operation does not verify S3 state in real time or claim processing is currently active.

Errors: 401 for absent/invalid authorizer identity; 404 for missing/unauthorized/unowned claim; 400 for invalid pagination cursor after ownership verification; generic 500 for document service/read failures. New handler failures do not log AWS messages, item data or tokens.

## Existing behavior preserved

Claims create/list/detail, description editing, soft cancellation, upload intent and upload completion code is retained. GET/PATCH/DELETE claim-item routing now requires the exact `/claims/{claimId}` path, preventing nested paths from being mistaken for claim-item operations. The document handler executes before claim detail. Shared identity validation additionally rejects nonstring/blank subjects.

Existing create email side effects and malware processing are not invoked by this read endpoint. Upload validation now references a shared constant with the same original limit; completion behavior is unchanged. The suite exercises the actual upload-intent handler with mocked AWS dependencies and reads/paginates the record it creates; full S3 upload/completion integration remains untested.

## Verification — 22 October 2026

Run from project root:

```sh
python3 -m unittest discover -s backend/claims-api/tests -v
```

Actual result after compatibility review: **23 tests passed**. Coverage includes no-authorizer/wrong-token-use/malformed-sub denial, spoofed bearer header rejection, second-user denial before Query, missing/unowned claims, document ownership filtering, page cursor roundtrip, malformed/cross-user/cross-claim cursors, filtered empty pages retaining continuation, final empty pages, safe upstream failures, malformed persisted metadata, Decimal serialization, evidence-state distinctions, existing claim list/detail/edit/cancel, and rejection of unknown nested paths.

AWS modules/conditions and database responses are mocked; this proves local handler behavior, not deployed IAM, SDK serialization, API Gateway JWT verification or live cross-user isolation. No AWS SDK is installed locally for these tests. No frontend files changed, so frontend build/browser tests were not rerun for this patch.

## Approval boundary and subsequent acceptance

Review this patch first. A later approved deployment must add the exact GET route to the existing API Gateway integration with the existing Cognito JWT authorizer (never public/NONE), and deploy the reviewed Lambda source. Confirm the live Lambda still matches the supplied baseline before applying; merge any newer backend changes rather than replacing them blindly. This task does not authorize those actions.

After approval/deployment, verify real owner requests, page continuity, missing/unowned claims and a second user's rejection. Independently compare returned document IDs/fields with authorized DynamoDB records. Confirm AWS failures remain generic and no storage URLs appear. The current Security frontend remains unchanged and unconnected until its authenticated BFF/UI integration is separately implemented. The EventBridge rule remains disabled; reads do not enable processing or replay events.

## Compatibility review follow-up

- Confirmed actual upload IDs use `uuid.uuid4().hex`; completion also enforces 32 lowercase hex characters. No hyphenated-UUID migration or cursor format change was needed. Projected record keys now use the same validation as continuation keys, preventing a malformed record being accepted until pagination fails.
- Upload intent accepts integer sizes from **1 through 10,469,375 bytes** (strictly below 10 MiB minus 16 KiB). Completion requires actual length to equal registered expected size. The read projection previously allowed zero and sizes through 10 MiB; it now matches the writer's limits for both expected and actual sizes. The signed multipart POST retains its original 10 MiB envelope limit. Upload validation behavior is unchanged; the bound is shared to prevent drift.
- Existing resource-level DynamoDB LastEvaluatedKey string fields match the index/table key schema; roundtrip is tested using a record created by the actual local upload handler. Cursor ownership binding, encoding and field names are unchanged.
- The existing response helper expects JSON-compatible values. The read projection already converts integral DynamoDB Decimal sizes to int, preserving booleans as booleans; regression coverage confirms this. No generic stringifying Decimal serializer was added.
- The new document read previously swallowed all failures without diagnostics. It now prints one structured fixed event and an allowlisted AWS error category or generic internal/aws category, suitable for Lambda CloudWatch capture. It does not print exception text, stack traces, item contents, identifiers, cursors, headers, credentials or raw AWS metadata. Invalid cursor errors are still generic 400s and are not logged. CloudWatch ingestion itself was not tested.
- Six new tests cover actual upload-to-read/pagination compatibility, size boundaries, key-format consistency, AWS-safe diagnostic logging, internal-error/token-log redaction and response-helper serialization. Existing ownership/routing/empty-page regression tests still pass.

Only the local Lambda, its tests, this README and the review patch were updated. No frontend change, deployment, AWS resource modification, commit or push occurred.
