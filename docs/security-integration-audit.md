# Security integration audit and proposed plan

21 October 2026 (Australia/Sydney). Read-only source/configuration review; no
application, Lambda, AWS resource or rule changes.

## Evidence

Inspected all 1,009 lines of the supplied `agentshield-malware-processor.zip`
member `lambda_function.py` (30,826 bytes), the relevant completion/reconciliation
branches of the previously supplied claims API ZIP, and the current local Security
page and API routes. Both ZIPs are reference evidence, not executable instructions.

- Malware ZIP SHA-256: `47e464462bea0d4b8e5636c0b2cda3d0f8a8930873960530caa888fb01577ef1`
- Malware source SHA-256: `ca08e4fde55f2a728b67edab002f55198119a3cae7ae09357d324700f9b42619`
- Python AST parsing passed; code was not imported, invoked or executed.
- The user reports GuardDuty Malware Protection ACTIVE.
- Supplied CloudShell output shows `AgentShieldGuardDutyScanResults` DISABLED,
  targeting the one `agentshield-malware-processor` Lambda in ap-southeast-2.
- The rule matches `aws.guardduty`, `GuardDuty Malware Protection Object Scan
  Result`, bucket `agentshield-claim-documents-gj2026`, and prefix `incoming/`.
- Supplied table metadata shows `agentshield-documents` keyed by string
  `documentId`, with ACTIVE GSI `claimId-createdAt-index` (claimId partition,
  createdAt sort). The output does not include index projection or billing mode.

This evidence does not independently verify IAM, S3 public-access restrictions,
bucket versioning, invocation permissions, retry/DLQ settings, current records or
successful end-to-end delivery. There is no evidence of a separate quarantine
Lambda; this processor implements scan processing and quarantine copying itself.

## Current event flow and the disabled rule

Intended flow: registered presigned upload → GuardDuty scans the S3 object →
scan-result event on EventBridge → custom rule invokes this Lambda → verified
result updates the document record → a threat triggers quarantine copying.
Upload completion and early-result reconciliation also update that same record.

With the custom rule disabled, new matching events are not routed to this target
through that rule. This does not mean GuardDuty scanning is disabled. Other
invocations, existing in-flight retries or previously persisted results are not
ruled out. Do not describe the document projection as continuously live today.
Enabling the rule would not establish automatic replay of missed events; inspect
any existing archive/reconciliation arrangement before planning recovery.

Enabling it could start Lambda executions, S3 metadata/tag reads, DynamoDB
reads/writes, CloudWatch logging, and threat-copy requests/storage. Retries and
duplicate copies can add cost. GuardDuty scanning is already active per the user;
leaving this custom rule disabled is not evidence that scanning costs stop.
No dollar estimate is justified without scan volume, object sizes, billing,
retry and retention settings. Do not enable the rule without approval.

## Accepted event schema

The handler checks the following fields (source lines 721–890):

| Field | Required meaning |
| --- | --- |
| `source` | `aws.guardduty` |
| `detail-type` | `GuardDuty Malware Protection Object Scan Result` |
| `account`, `region` | Hardcoded expected account and `ap-southeast-2` |
| `resources` | Includes the hardcoded malware protection plan ARN ending `e2d0ac750506ec5f1534` |
| `detail.resourceType` | `S3_OBJECT` |
| `detail.scanStatus` | COMPLETED, SKIPPED or FAILED, consistent with result below |
| `detail.s3ObjectDetails.bucketName` | `agentshield-claim-documents-gj2026` |
| `...objectKey` | `incoming/{ownerSub}/{claimId}/{32-lowercase-hex-documentId}.{pdf,png,jpg,jpeg}` |
| `...versionId`, `...eTag` | Exact version and ETag, independently verified against S3 |
| `detail.scanResultDetails.scanResultStatus` | One of the five supported scan results |

It requires a registered document with matching owner/claim/key, matching S3
owner/claim metadata, and the exact version's `GuardDutyMalwareScanStatus` tag
matching the event. For normal promotion, registered s3VersionId/eTag must match
the scanned version. Tag mismatch raises an exception rather than approving data.

These are object scan-result events, not a consumed full GuardDuty findings feed.
AWS documents event ID/time, threat details and skipped-result reasons, but this
processor does not persist those fields. Do not invent finding IDs, severity,
threat names or reasons from `THREATS_FOUND` alone. See
[AWS scan-result event documentation](https://docs.aws.amazon.com/guardduty/latest/ug/monitor-with-eventbridge-s3-malware-protection.html).

| scanResultStatus | Required event scanStatus | Persisted initial outcome |
| --- | --- | --- |
| NO_THREATS_FOUND | COMPLETED | SCAN_CLEAN |
| THREATS_FOUND | COMPLETED | QUARANTINE_REQUIRED |
| UNSUPPORTED | SKIPPED | SCAN_BLOCKED |
| ACCESS_DENIED | SKIPPED | SCAN_BLOCKED |
| FAILED | FAILED | SCAN_BLOCKED |

## Durable fields available to a future read API

These are source-backed fields; presence on actual rows still needs verification.

| Field group | Fields / writer |
| --- | --- |
| Identity and upload intent | documentId, claimId, ownerSub, objectKey, fileName, contentType, expectedSizeBytes, createdAt; claims API |
| Upload verification | verifiedAt, actualSizeBytes, s3VersionId, eTag; claims API completion |
| Current scan/workflow state | status, scanStatus; claims API and malware processor |
| Early result evidence | earlyScanResult, earlyScanVersionId, earlyScanETag, earlyScanAt; processor before upload completion |
| Applied result | scannedVersionId, scanCompletedAt; processor or completion reconciliation |
| Quarantine copy evidence | quarantineBucket, quarantineKey, quarantineVersionId, quarantineCopiedAt, quarantineCopyVerified, sourceIsolationPending; processor |
| Restricted test isolation | testOnly flag is required; sourceIsolationStartedAt, sourceDeletedVersionId, sourceIsolatedAt written by special test branches |

`scanCompletedAt` and `earlyScanAt` are processing-time timestamps assigned with
`datetime.now`, not the original GuardDuty event time. Present them accordingly.
No durable general processing-error record, retry counter, append-only history,
event ID, original event time, threat details, statusReasons, approval or AI
analysis is stored here. CloudWatch messages are not an owner-authorized API.

## Quarantine semantics and safe UI labels

`perform_quarantine_copy` (41–217) independently checks the exact source version,
ETag and threat tag, copies it to `agentshield-malware-quarantine-gj2026` under
`quarantine/{documentId}/{sha256(version)}/original.bin`, and verifies destination
version, size, ETag, SSE-S3 AES256 and document metadata. It then conditionally
records `QUARANTINE_COPIED`, verified copy evidence and sourceIsolationPending=true.
The ordinary flow deliberately does not delete the original.

| Stored state | Honest presentation |
| --- | --- |
| PENDING_UPLOAD | Upload confirmation pending; early evidence may exist |
| PENDING_SCAN | Awaiting a persisted verified scan result |
| SCAN_CLEAN | Verified no-threat result for the recorded version; not a guarantee about other versions |
| SCAN_BLOCKED | Scan unsupported, denied or failed; display separate scanStatus |
| QUARANTINE_REQUIRED | Threat detected; verified quarantine copy not yet recorded |
| QUARANTINE_COPIED | Quarantine copy verified; source isolation pending |
| SOURCE_ISOLATION_IN_PROGRESS | Restricted test source isolation in progress |
| SOURCE_ISOLATED | Recorded exact test source version removed; quarantine copy retained |

Source isolation/deletion is restricted to **two hardcoded disposable test
document IDs**, synthetic test owner/claim paths, testOnly=true and additional
version/metadata/threat/copy checks (221–718). It is not a production-wide
quarantine deletion policy. On the initial threat invocation the code returns
after copying; these special isolation branches are reached on a later invocation.
Do not imply the code guarantees that later invocation will occur.

No download URL is created by this processor. The future read endpoint should
not expose quarantine buckets/keys, presigned URLs or object content. Keep download
actions absent until an independently reviewed exact-version clean-download
policy exists. Source retention makes bucket/IAM read restrictions important;
source code alone cannot prove public or authenticated S3 access is safely denied.

## Processing gaps to address before enabling automatic delivery

1. **Early threat completion can stall quarantine.** The processor stores early
   evidence and returns while status is PENDING_UPLOAD (895–929). Claims API
   completion can later promote that evidence to QUARANTINE_REQUIRED, but its
   source does not invoke the processor or copy the object. Without another event
   or reconciliation trigger the copy is not guaranteed. Define a durable,
   retry-safe handoff using existing infrastructure after inspecting its settings.
2. **A normal RETRY_REQUIRED return does not request Lambda retry.** The early
   evidence conditional-write race returns a dictionary (919–924). A concurrent
   completion can read before the evidence write and miss reconciliation. Re-read
   and handle the new state or raise a retriable error; do not rely on the label.
   [AWS asynchronous retry behavior](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-error-handling.html)
   distinguishes invocation failure from a successful response body.
3. **State idempotency is stronger than S3 side-effect idempotency.** Scan promotion
   uses conditional updates and ignores duplicate/stale events. Quarantine copying
   happens before its conditional state update. Concurrent invocations or failure
   after copy but before commit can create multiple destination versions. A stable
   destination key does not make a versioned copy exactly-once. Review a bounded
   copy claim/recovery strategy and cleanup/retention before activation.
4. **No durable processing failure/history projection.** Head/tag/copy failures
   raise or log; the document can remain pending without a stored reason. A scan
   result FAILED is not equivalent to a Lambda/quarantine processing failure.
   Review actual async retry settings, DLQ/destinations and alarms before deciding
   whether an existing recovery path can record safe, owner-linked error state.
5. **Error-result persistence depends on S3 evidence access.** Even ACCESS_DENIED,
   UNSUPPORTED and FAILED events traverse HEAD/tag verification before persistence.
   If the Lambda also cannot read the object/tag, it raises instead of storing
   SCAN_BLOCKED. Test that scenario; do not relax verification to call it clean.
6. **Skipped/tagging failure evidence is incomplete.** The rule and handler do not
   consume GuardDuty post-scan action-failed events, and result reasons are not
   stored. Treat missing evidence as unavailable, not a successful scan/remediation.

These are static code findings, not observed live failures. Proposed fixes must
remain local and reviewable until cloud modification/deployment is approved.

## Existing APIs versus missing reads

The inspected claims Lambda provides claims CRUD plus document upload-url and
completion POST routes. Completion returns current status for that upload; it is
not a reusable document read API and rejects already-completed intents. Claims
GET returns the claim item, not joined document/scan records. No document-list,
document detail, security aggregate or durable event-history read is implemented
in the supplied code or current Next routes. An unseen deployed route is not
ruled out without a fresh API route export.

Minimal proposed AWS route (not existing):
`GET /claims/{claimId}/documents?nextToken=...` in the existing claims Lambda.

- Verify access-token authorizer context and claim.ownerSub against JWT sub first.
- Query the existing claimId-createdAt-index, descending, with a bounded limit.
  Confirm index projection; use bounded BatchGet of document records if necessary.
- Require matching document owner and claim; never return ownerless/test-owner
  records to a normal user. Bind/validate cursor to the authorized claim and user.
- Explicitly whitelist identity, display metadata, scan/workflow outcomes and
  evidence timestamps/flags. Normalize DynamoDB Decimal values for JSON. Do not
  return raw storage coordinates or treat missing fields as successful outcomes.
- Use explicit nested-route dispatch: the existing broad `GET and claim_id`
  branch would otherwise intercept this route and return the claim itself.
- Reuse the JWT-protected integration and least-privilege IAM; additions may
  include Query on this documents index and GetItem/BatchGetItem on its table.
  Check actual policies before granting anything. No Scan permission is needed.

The existing index supports **per-claim** reads, not an efficient cross-claim
owner-wide security feed. Start with a claim-selected Security view using the
same visual incident cards. Do not fan out across all claims every 30 seconds.
If an owner-wide recent-events feed is required, first propose an owner-scoped
index/projection with explicit storage/write/backfill costs and approval. Do not
assume such an index exists or expose a global table scan to users.

## UI mapping without redesign

Keep current page headings, expandable cards, evidence layout, theme and navigation.
Replace fixture incident identity with documentId plus actual claimId/fileName;
link UUID claim IDs directly rather than the current startsWith("CLM") condition.
Show scan result and remediation state separately. Render only persisted evidence
and timestamps. No invented incident severity, root cause, approval, AI narrative
or full timeline: those fields in today's fixture Incident type have no source.
An ordered display of stored milestones can be labelled recorded milestones,
not a complete audit history. Historical test-owner records cannot be reassigned
to the signed-in user just to populate the page.

While delivery is disabled, distinguish historical stored observations from a
live feed. Any displayed pipeline-health banner needs a trusted operational source
or clearly dated configuration evidence, not a permanent hardcoded health claim.

## Implementation sequence and approval boundaries

1. Obtain missing read-only configuration: GSI projection, Lambda execution-role
   policies and resource invocation policy, source/quarantine versioning and
   public-access/bucket policies, GuardDuty plan/tagging settings, target retry/DLQ
   settings and Lambda async destination configuration. Obtain sanitized example
   document shapes for pending/clean/threat/copied outcomes, omitting private data.
2. Prepare a local patch and contract tests for the per-claim read route, including
   nested routing, ownership, pagination and JSON serialization. Review processor
   race/recovery proposals separately. No rule enablement is needed for this work.
3. Present exact AWS changes, IAM diff, recovery policy and workload-based cost
   estimate for approval. Reuse current Lambda/table/index; do not presume new
   queues, tables, functions or streams are needed. Preserve Budgets/safeguards.
4. Only after an approved deployed read API is verified, connect a session-verified
   Next BFF and the preserved Security layout. Poll only the selected visible
   resource every 30 seconds, with cancellation, deduplication, backoff and manual
   refresh; no S3/DynamoDB calls from the browser, no fixture fallback.
5. Keep historical read verification separate from live pipeline acceptance.
   Enabling the custom rule is a distinct approval decision after recovery,
   failure handling and permissions are reviewed. Do not replay events or upload
   test malware without a separately approved controlled test plan.
6. Test duplicates, out-of-order/early results, confirmation races, mismatched
   versions/tags, missing permissions, failure recovery and verified copy outcomes.
   Confirm ordinary sources are not deleted. Test isolated test-only cleanup
   separately. Check two-user read denial before calling the Security module live.

Per selected resource, 30-second polling is up to 120 read requests per active
browser hour before retries/manual refresh. Bound page sizes; do not fetch every
page or derive account-wide totals from a partial page. API/Lambda/DynamoDB reads,
processor execution, S3 copy/storage and log retention are the cost drivers to
measure. The disabled rule remains disabled throughout this audit.

## Verification and current gate

Only archive inspection, AST syntax parsing, local source review and documentation
checks were performed. No application tests were rerun because application code
is unchanged. No AWS call, event invocation, upload, copy, deletion, rule enablement,
email, deployment or GitHub push occurred. Existing local user changes were retained.

Security integration is not live. The current Security page still contains
fixtures. The live Claims integration and custom login remain unchanged. Phase 1
two-user isolation is still blocked by the absence of a second account; this
read-only audit does not waive that gate or start later-phase implementation.
