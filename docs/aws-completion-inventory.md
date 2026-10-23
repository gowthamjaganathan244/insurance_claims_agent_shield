# AWS completion inventory — 22 October 2026

This inventories the current local source, including uncommitted Reliability work. It is not an AWS deployment or a fresh live AWS test. No application code, AWS resources or authentication configuration changed for this audit.

## Findings

The application is partially integrated. Current route imports do not reach `lib/fixtures.json`, `lib/data.ts`, `lib/claims.ts` or the legacy simulated components listed below. Security and Communications are unavailable placeholders, not completed AWS integrations. Command is partly live. Reliability is implemented but local credentials/authorization and live acceptance are outstanding.

Existing user verification: Cognito login/logout work; Claims IDs/fields match DynamoDB and exclude unowned records; Command Recent claims IDs match the first Claims page. This is user-reported evidence, not new verification in this audit. Two-user isolation is not verified. The preceding implementation's 164 passing browser tests use mocks and do not prove AWS access.

## Complete current-screen inventory

| Screen / element | Current source and meaning | Remaining requirement |
| --- | --- | --- |
| Login, recovery, MFA/password challenges, logout | Real server Cognito implementation; no fake credential form | Live checks for each challenge actually configured, recovery, refresh/revocation; only login/logout have explicit user confirmation here |
| Navbar account name | Verified Cognito session identity | No separate customer identity fixture |
| Navbar health text | `/api/monitoring`, or Health unavailable | Temporary server AWS credentials and explicit monitoring operator allowlist; verify real response |
| Navbar dot | Neutral fixed presentation, not a count or healthy-state measurement | Optional evidence-based colour; no fake degradation count remains |
| Command recent claims | `/api/claims`, verified owner projection | Already user-confirmed to match Claims |
| Command policy number, claim ID/type/status, creation date | Returned persisted claim fields | No invented customer name, exposure or risk |
| Command loaded-page claim/status counts | Counts of the actual returned first page | These are not account totals; account totals need a complete, bounded owner aggregation design |
| Command last successful update | Browser time of successful fetch | Retrieval timestamp, not claim modification or AWS event time |
| Command Intake, Security, Assessment, Decision, Payment, Comms values | Six dashes, all Not connected | Actual persisted stage definitions/counts and owner-scoped aggregate read API; no mapping from risk or assumed workflow |
| Command operational storyline | Activity feed not connected | Durable owner-linked activity records/read API; current claims have created/cancelled facts only |
| Claims list and details | `/api/claims`, `/api/claims/{id}` | Already integrated; cross-user live test outstanding |
| Claims count/status filter/pagination | Loaded-page count, local filter, backend cursor | Not account-wide search/count; only SUBMITTED/CANCELLED filter controls currently provided |
| Claims fields | claimId, policyNumber, claimType, description, status, createdAt, optional cancelledAt | Other fields not supplied by verified contract |
| Claims Save description / Cancel claim | Real PATCH/DELETE through authenticated, CSRF-protected BFF | Live persistence checks if not already done; cancel retains the record |
| New claim | No live UI/BFF create operation enabled | Existing POST contract can send real SES mail; controlled recipient and explicit send approval before live create test |
| Upload documents | Not implemented in live UI | Existing presigned multipart POST intent/completion contract, bucket CORS, permissions/versioning, safe completion/retry design and approved test upload |
| Claim documents/scans | Not loaded | Owner-authorized document read API described below |
| Claim risk/exposure/location/customer name | Not displayed by live components | Verified persisted fields and authorized API if required; Cognito display name is not claim customer data |
| Approval/escalation/investigation/payment | Not live, no enabled simulation in current routes | Real workflow contract, permissions, persisted states, decisions and payment evidence; cannot infer from SUBMITTED/CANCELLED |
| Security scan records and timestamps | Scan evidence unavailable | Paginated owner-authorized documents read endpoint, index projection and IAM confirmation |
| Security quarantine/source isolation | No verified results loaded | Actual persisted evidence; THREATS_FOUND is detection, QUARANTINE_COPIED is copying, neither alone proves source isolation |
| Security processing configuration text | Explicitly dated 21 October supplied snapshot: GuardDuty active, custom EventBridge rule disabled | Fresh read-only configuration to establish current state; not live telemetry |
| Security incident descriptions/severity/threat names | No fabricated incidents mounted | Actual evidence fields only; inspected processor does not persist a full findings/history feed |
| Reliability alarm names/states/state-update times | Implemented CloudWatch DescribeAlarms for three configured alarms | Local temporary AWS credentials, operator sub allowlist and IAM verification; live response not yet obtained |
| Reliability API request count, server errors, average latency | Implemented CloudWatch Count Sum, 5xx Sum, Latency Average | Same access gate; actual period points only |
| Reliability each Lambda invocation count/errors/average duration | Implemented Invocations Sum, Errors Sum, Duration Average for claims-api and malware-processor | Same access gate; idle/missing observations remain unavailable |
| Reliability API error rate | Calculated only from matching observed count/error periods with positive request count | Same access gate; no zero-filling |
| Reliability latency display | Recorded five-minute average samples, not a synthetic curve | A visual line chart can use these same samples after live validation; P50/P95/P99 are not retrieved |
| Reliability time window/last retrieved | Actual request window and successful fetch time; one complete preceding hour, 300-second periods | These constants define the query, not fabricated metrics; cards show latest period, not hour totals |
| Reliability uptime | No uptime percentage shown | Agreed availability definition, measurement source/window and sufficient history |
| Reliability deployments | Deployment history not connected | Existing deployment pipeline/release history or approved AWS audit/history source, permissions and safe projection |
| Reliability operational alert history | Alert history not connected | Current alarm states are not history; bounded DescribeAlarmHistory or existing persisted alert/event source and approval for any extra permissions |
| Communications template list/preview/variables | No content loaded; Not connected | Read actual SES template AgentShieldClaimCreated, identify SES API/version and authorize template visibility |
| Communications version history | Not connected | Existing version store/change audit; current template content alone cannot reconstruct history |
| Communications sent/delivered/failed/bounced/complaint counts | Unavailable; supplied inventory found no configuration sets | Persisted, owner-linked message records and delivery events; new tracking requires separate design/approval |
| Communications delivery tracking label | Historical inventory-based statement, explicitly says current config not refreshed | Fresh SES configuration inventory |
| Communications audit trail | Message activity not connected | Actual message/template audit records, timestamps, actors, owner binding and read API |
| Communications SMS | No live SMS support | Existing real SMS service/contract if required; otherwise omit |

## Reliability gate: what is already implemented and what to provide

Provide the Cognito **sub of an explicitly approved monitoring operator** and the name/setup status of an **existing temporary AWS role/SSO profile on this Mac**. Do not provide access keys, passwords, tokens or session cookies in chat. A CloudShell session is not automatically available to the local Next.js server.

Server configuration: `MONITORING_ALLOWED_SUBS` and, for a named profile, `AWS_PROFILE`. SDK default credential chain, session-token-bearing temporary credentials only. Required actions: DescribeAlarms on the three named alarm ARNs, GetMetricData in ap-southeast-2. Proposed policy is `monitoring-read-policy.json`; it has not been applied. Any role/trust/permission change requires approval. Current alarms OK in a pasted snapshot does not establish the current application health.

## Security gate: exact evidence to provide

1. Run the existing read-only `scripts/agentshield-security-read-audit.sh` in CloudShell; review and provide its output `agentshield-security-read-audit.zip`. It collects both table/index projections, API routes/JWT authorizer/integrations/stages and claims Lambda role policies/boundary. Read failures are recorded; do not broaden permissions just to hide them.
2. Confirm whether either supplied Lambda has changed since its provided ZIP; if changed, provide the current source ZIP. Existing source ZIPs need not be resent unchanged.
3. Provide current malware processor retry/destination/DLQ configuration and S3 versioning/CORS/access-policy evidence when progressing to upload/processing verification. No object contents or signed download URLs needed.
4. Proposed missing route: GET /claims/{claimId}/documents, paginated, validates claim.ownerSub and each document owner/claim. Existing claimId-createdAt-index should be reused if projection permits; Query and possibly bounded BatchGetItem are the candidate missing permissions. No S3 download/copy/delete permission is needed for metadata reading.
5. Review exact local Lambda/API/IAM patch, then approve deployment separately. Without deploying a missing endpoint, frontend changes alone cannot expose its data.

The disabled EventBridge rule is a separate issue from document reads. Stored records can be read without enabling it; fresh scan projection through that rule cannot be promised. Enabling it does not automatically replay missed events. Earlier source audit found early-scan reconciliation, retry and copy-idempotency gaps; resolve/test before claiming complete automatic processing. Do not delete original documents.

## Communications gate: exact evidence to provide

- Current SES template `AgentShieldClaimCreated`: subject, HTML/text content, template API/version and region. Redact real customer material if embedded.
- Current SES account sending/sandbox status, relevant verified identity status, configuration sets/event destinations. Do not send SMTP credentials or keys.
- Identify the actual sender. The supplied claims-api source already attempts SESv2 SendEmail during create, and logs acceptance message ID without persisting delivery. There is no need to invent a separate email Lambda. If another sender exists, provide its name/source ZIP and trigger.
- Schema/index/IAM information for any existing message or delivery-event store and its ownerSub/claimId linkage. If none exists, say so: it requires new tracking design, not frontend mapping. A send acceptance/message ID does not prove delivery.
- Explicit recipient-specific approval before any real email test. Existing template reads need no send permission. Any tracking configuration or resource change needs its own approval.

## Command/workflow gate: exact evidence to provide

- Claims table/index projection and supported persisted status values (the Security collector covers table metadata).
- Desired account-wide metric definitions: total claims, status totals, period and ownership scope. Current first-page counts remain accurate but limited. Do not crawl every page on every browser poll; design a server-side bounded aggregation/cache or persisted counters after measuring volume.
- Source/contracts for any existing assessment, approval, payment or activity service and relevant storage schemas. If these services do not exist, explicitly confirm that. Risk/confidence and payment scheduling cannot be completed solely by wiring the current claims CRUD Lambda.
- Two existing test accounts in separate browser profiles, each with an owned disposable claim, for real cross-owner list/detail/cursor/mutation/document tests. Never share passwords or tokens. A single account cannot establish multi-user isolation.

## Remaining dormant demonstration code — not imported by current app routes

| File | Demonstration content or behaviour |
| --- | --- |
| lib/fixtures.json | Eight fictional claims with names, types, amounts, risk scores, locations, statuses and 20 document labels/statuses; eight fabricated storyline events; four fictional incidents; four deployment entries; four alerts; seven email/SMS templates. Exact IDs and source counts appended below. |
| lib/data.ts | Exports fixtures; fixed clean/suspicious/malware labels plus invented macro execution, outbound beacon, hash correlation and metadata evidence. Six stage labels are presentation; their old progress assignments are simulated. |
| lib/claims.ts | Generates fixed 09:02/09:04/09:11+/09:19/09:31 timeline events, inferred holds/severity and seeded pseudo-random helper. No AWS query. |
| components/claim-store.tsx | Initializes fixture claims; approval/escalation update React state only; creates browser-time demo audit events and toast. Not mounted. |
| components/analysis.tsx | Fictional risk/100, confidence formula min(97, round(58 + 0.4*risk)), derived evidence counts, 0/1/2 correlated events, invented explanations and recommendations; local-only actions. |
| components/command-analysis.tsx | Selects first fixture claim for Analysis. |
| components/claim-detail.tsx | Fixture exposure/location/risk, invented journey and document evidence, fake incidents/audit, inferred decisions and “Scheduled within 2 business days” payment promise. Live route uses LiveClaimDetail instead. |
| components/journey.tsx | Guesses completed/current stages from approval/risk/hold instead of persisted workflow. |
| components/storyline.tsx | Generic event renderer; old callers supply invented events. Curved SVG geometry is decoration, not quantitative data. No current route imports it. |
| components/latency-chart.tsx | Only Metrics unavailable placeholder; not imported by current Reliability. No generated series remains here. |
| docs/reference/agent-shield.html | Original standalone prototype: old dashboard totals/pipeline values, 2 services degraded, fabricated latency percentiles/chart series, deployments, incidents, templates, generated delivery counts, fake versions/audit and local simulated actions. Not a Next.js route or imported runtime source. |
| docs/screenshots/* | Historical images, not live evidence. |
| tests/mock-*.mjs and test specifications | Intentionally synthetic Cognito/claims/CloudWatch test data, test-only transport and identities. Tests do not establish real AWS success. Never enable them in the normal dev server. |

`lib/types.ts` contains legacy shape/status definitions, not live records. CSS percentages, animation timings, SVG coordinates, UI breakpoints, polling intervals and query periods are presentation/configuration values, not operational data. They do not need an AWS source.

Older security audit documents say the Security page still has fixtures: that was true at their audit time, but is stale as a description of today's route. This inventory supersedes those UI-status statements, not their backend findings.

## Completion sequence and acceptance

1. Supply monitoring operator/profile; verify authenticated real CloudWatch 200 response against AWS and navbar.
2. Supply configuration audit ZIP; prepare and test owner-authorized Security read patch; obtain approval for necessary deployment/permissions, then verify real document evidence and isolation.
3. Supply SES/sender/message-store evidence; connect templates and existing genuine activity first. Present delivery tracking changes for approval if absent.
4. Agree supported dashboard totals/workflows; implement only persisted, authorized sources. Unsupported product capabilities require backend work, not fake numbers.
5. Verify two-user authorization, refresh/error handling, uploads and explicitly approved communications side effects, then rerun full regression checks. Removal of unused prototype code can be a separate local cleanup.

No new live AWS calls or browser tests were run for this source-only audit. The review traced page/layout/component/API imports, source fields, fixture data, calculations and documentation. No feature completion percentage is claimed.

## Exact fixture inventory

These are dormant fictional values, not AWS records. All other record text remains inspectable in `lib/fixtures.json`.

| Claim | Name | Amount | Risk | Status | Documents |
| --- | --- | --- | --- | --- | --- |
| CLM-48213 | Marlow & Co. Fabrication | 184200 | 92 | In review | invoice_final.pdf (mal), site_photo_01.jpg (ok), quote_rev3.xlsx (sus) |
| CLM-48207 | Hannah Whitcombe | 12850 | 34 | Processing | police_report.pdf (ok), dashcam.mp4 (ok), repair_quote.pdf (ok) |
| CLM-48199 | Tidewater Marine Pty Ltd | 96400 | 78 | In review | survey.pdf (sus), photos.zip (sus), invoice.pdf (ok) |
| CLM-48188 | Oliver & Priya Nandakumar | 41300 | 18 | Processing | water_damage_1.jpg (ok), plumber_invoice.pdf (ok) |
| CLM-48176 | Redgum Logistics | 228900 | 86 | Escalated | bill_of_lading.pdf (mal), manifest.csv (sus), photos.zip (ok) |
| CLM-48170 | Sienna Faulkner | 6720 | 22 | Processing | hospital_summary.pdf (ok), receipts.pdf (pend) |
| CLM-48162 | Kestrel Dental Group | 73100 | 51 | Processing | accounts_fy26.xlsx (sus), lease.pdf (ok) |
| CLM-48155 | Jamal Ortega | 31200 | 12 | Approved | report.pdf (ok), keys_receipt.jpg (ok) |

Incidents: INC-2291 — Macro-enabled invoice with polymorphic loader, INC-2288 — Repeated bill of lading tampering, INC-2284 — Upload burst from a single network, INC-2279 — Expired signing certificate on partner webhook.

Templates: CLAIM_RECEIVED (SMS), DOCUMENT_HELD (SMS), MORE_INFORMATION_REQUIRED (Email), CLAIM_APPROVED (Email), CLAIM_DELAYED (SMS), MALWARE_DETECTED (Email), INCIDENT_RESOLVED (Email).

Deployments: v2.41.0 claims-api, v1.18.3 scan-worker, v2.40.2 claims-api, v0.9.7 notify-svc.

Alerts: Quarantine queue above 40 items — scan-worker, 4 min, 9 claims waiting; P99 drifting up on /claims/submit — claims-api, 17 min, 146 claims delayed; S3 replication lag 38s — ap-southeast-2 to ap-southeast-4, no claims affected; Dead-letter queue drained — notify-svc, 1 h.
