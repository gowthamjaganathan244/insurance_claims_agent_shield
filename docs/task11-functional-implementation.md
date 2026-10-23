# Task 11 local functionality — 22 October 2026

This document distinguishes implemented code from live AWS acceptance. No AWS changes, deployment, real email, commit or push were executed in this work.

| Area | Local functionality | Live dependency / limit |
|---|---|---|
| Command | Existing authenticated Claims API; up to 10 pages/30-second overall deadline; distinct claim/status counts; first-page recent claims; actual creation/cancellation timestamps; refresh/poll/error/empty states | Previously user-verified first-page ID parity. New all-page counts still require signed-in live verification. Partial results are explicitly labelled; no account-wide totals or transactional-snapshot claim. |
| Claims | Existing description editing/cancellation retained; new create form; signed upload intent → S3 POST → backend complete; pending/failed states | Creation can send the existing real SES confirmation, so form requires explicit acknowledgement. No automatic retry after uncertain writes. Real upload CORS and scan processing need live verification. |
| Security | Owner-scoped claim picker, document pagination, recorded scan/status/copy/isolation fields and timestamps; no URLs/contents; refresh and errors | Document read Lambda candidate is packaged but not deployed. New optional document API origin permits an isolated read deployment. GuardDuty event rule stays disabled; no new processing success is implied. |
| Reliability/navbar | Existing session/explicit monitoring allowlist; server SDK temporary credentials; alarm states; actual metric charts/points/periods; cache/poll | Local monitoring allowlist and temporary credentials are absent. No live CloudWatch request succeeded in this work. Charts render only returned data and break across missing periods. |
| Communications | Server-side SES template read, text-only safe preview/variables, per-claim persisted email events; explicit test-send form | Separate operations backend must be deployed/configured. Email disabled by default; verified recipient/sender and optional SES→SNS tracking need approval. Existing confirmation emails have no retroactive persisted history. |
| Assessment/risk | Owner/operator-authorised persisted human assessment with owned evidence snapshots and audit event | No approved scoring rules were supplied; riskScore remains null/Not configured. No invented automated risk result. |
| Approvals | Persisted approval/rejection after assessment; version conflicts and idempotency ledger | New operations table/API deployment and explicit operator allowlist required. Does not change original claim status or pretend an insurer policy engine approved it. |
| Payments | Approved-claim workflow record, integer AUD cents, reference, manual reconciliation outcome, audit trail | No transfer provider, bank lookup or automatic reconciliation. Manual MATCHED is a recorded human declaration, not verified bank settlement. |
| HTTPS | Existing server-side sessions/auth remain intact | A hosting target, domain and approved budget are missing. Private persistent SQLite storage is required; do not put this implementation on an ephemeral filesystem. |

## Main code changes

- `lib/command-snapshot.ts`, `components/command-claims.tsx`, protected Command page: paginated real claims and statuses.
- `components/use-live-claims.ts`: shared polling, bounded custom loader, visibility/error handling and mutation refresh.
- `app/api/claims/route.ts`, `lib/claims-api.ts`, `components/create-claim.tsx`, Claims workspace: authenticated creation with confirmation of its email side effect.
- `lib/documents-api.ts`, three claim/document BFF routes, `components/claim-documents.tsx`, `components/security-documents.tsx`, protected Security page: metadata read and upload completion. Safe server-selected origins; no browser DynamoDB access.
- `components/monitoring-chart.tsx`, `components/reliability-monitoring.tsx`: actual CloudWatch series with explicit missing periods; existing monitoring authorization/cache/navbar architecture retained.
- `backend/operations-api/lambda_function.py`: separate owner-scoped transactional workflow backend and optional SES/SNS ingestion. No production Lambda source replacement.
- `lib/operations-api.ts`, operation/template BFF routes, `components/claim-operations.tsx`, `components/communications.tsx`, protected claim/communications pages: optional connected workflow and email UI. Fail closed when unconfigured; no fixtures.
- `app/globals.css`: narrowly scoped live-form controls and responsive selectors using existing theme tokens.
- `.env.example`: optional server-only staging API origins; existing auth settings retained.
- `backend/staging/`: deterministic package builder, offline validation, linted CloudFormation template, guarded unexecuted change-set preparation and detailed rollback/approval instructions.
- Tests: pagination correctness, loading/errors, source authentication, CSRF, create/upload contracts, ownership/operator boundaries, workflow prerequisites, payment persistence without transfers, SES acceptance semantics and mobile accessibility.

## Local usage

```sh
npm ci
npm run dev
# Separate terminal, for verification:
npm run lint
npm run typecheck
npm run build
npm run test:e2e
AGENTSHIELD_TEST_OPERATIONS=true npm run test:e2e -- tests/operations.spec.ts
```

`AGENTSHIELD_TEST_OPERATIONS` exists only in the test launcher and selects isolated test transport/configuration. Production has no mock authentication or test bypass. Production provider origins are server configuration and cannot be set through a browser request.

Keep `.env.local` private. Leave both optional staging origins empty until deployment is approved. Do not change the working Cognito flow. Monitoring requires a temporary role/SSO session and explicit `MONITORING_ALLOWED_SUBS`; Cognito login does not itself grant CloudWatch IAM access.

## Live acceptance still required

Compare Command statuses/counts with all returned Claims pages for the same account, including partial/cancelled cases. Security needs the isolated document read deployment, per-document DynamoDB comparison and a second-account ownership check. Test mutations only on approved test claims; creating a real claim can email its owner. Check actual S3 CORS, persisted completion and scan events; disabled EventBridge delivery must never be reported as processed. Compare monitoring timestamps/dimensions/alarm states against CloudWatch. Enable one test SES send only after explicit sender/recipient/event-tracking approval; confirm provider delivery event separately from acceptance.

See `backend/staging/README.md` for exact proposed resources, IAM scope, cost assumptions, change-set commands, validation and rollback. All AWS acceptance and HTTPS deployment remain pending rather than asserted from mocked tests.
