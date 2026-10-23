# Documents endpoint: deployment plan for approval

Plan only, 22 October 2026. No AWS commands executed, resource changes, deployment, commit or push. Latest local Lambda, patch, tests, README and audit collector reviewed. Only this plan document is newly written in this step.

## Reviewed candidate and known limits

Local file: `backend/claims-api/lambda_function.py`.
SHA-256: `5c129626cab948e68e511e02e81c41bf820bd733e55da6be0310b30af7bd201c`.
Baseline ZIP SHA-256: `87e444d311b98aabb62e2c4bc1e374067a372993327a1808a3f7003115d942f1`.
Baseline source SHA-256: `d80b3fe42f01cf6ad7825d54ea17c16b38f75bd8c52372dbe958ed3870f1b56d`.

Candidate adds a paginated owner-verified metadata GET, uses ALL projection on the existing index, rejects unowned records, allowlists fields and logs safe categories. Shared changes include stricter nonblank-string identity validation, exact claim-item routing and a shared unchanged upload-size bound. Thus this is not exclusively a new-route change: existing routes require regression tests. Claims creation still attempts SES email; upload/completion still write records and interact with S3. The source contains hardcoded production document-table/bucket names; changing TABLE_NAME alone does not isolate it.

Previous test result: 23 offline tests passed with mocked AWS imports/transports. Tests were not rerun for this planning-only step. No real JWT, SDK/DynamoDB, API Gateway or two-user acceptance is established. One account was previously available; a second is still a release-verification gate.

## 1. Smallest safe first action — read integration targets

Run this single configuration read in CloudShell; it does not change AWS resources or retrieve credentials, tokens, Lambda environment variables or document data:

```sh
AWS_PAGER="" aws apigatewayv2 get-integrations \
  --api-id b30dloh6e4 \
  --region ap-southeast-2 \
  --query 'Items[].{IntegrationId:IntegrationId,Type:IntegrationType,Target:IntegrationUri,PayloadFormatVersion:PayloadFormatVersion}' \
  --output json
```

Provide only this configuration output. It identifies whether the target is an unqualified function/$LATEST, numbered version, alias or stage-variable expression. Do not yet update code, publish a version, create a route, change AutoDeploy or invoke the Lambda. Alias resolution and route mapping follow as configuration reads.

## 2. Read-only deployed comparison and backup preparation

Before any AWS mutation:

1. Confirm account/region and API identity. Read routes (including `$default` and ANY/proxy routes), stages, deployments, JWT authorizers, integrations, mappings and Lambda invoke policies. Resolve route targets, any stage variables, version qualifier and alias routing weights. Record `$default` AutoDeploy=true and existing deployment ID. Inventory other integrations, direct invokers, function URLs and event sources that might invoke the shared function or $LATEST.
2. Read qualified live Lambda configuration and $LATEST metadata: RevisionId, CodeSha256, runtime/architecture, handler, layers, execution role, memory/timeout, package type, update status, aliases/versions, concurrency and logging settings. Do not print environment values. Inspect necessary environment/resource bindings privately; a restricted configuration backup must not be included in a shareable audit ZIP. Existing config is to remain unchanged.
3. Download the complete currently served Lambda package using GetFunction's temporary code location, keeping that URL private/in-memory and never logging or committing it. If live traffic uses a version different from $LATEST, save BOTH packages with qualifier labels. Store in a private local backup directory with restricted permissions; no new S3 bucket is needed.
4. Verify the package's binary SHA-256 encoded in base64 against AWS CodeSha256. The existing documentation uses hexadecimal hashes: do not compare encodings or compare a single source file to a package hash. Read metadata before/after download; abort/retry the snapshot if RevisionId/hash changes. Preserve dependencies and all package files, not merely lambda_function.py.
5. Perform a three-way source comparison: supplied baseline ZIP, freshly downloaded deployment, reviewed local candidate. If deployed source differs, stop and merge only the reviewed changes into a copy of the current deployed package. Never overwrite newer functionality with the old ZIP. Generate a new review diff and rerun tests after any merge. Include every ZIP member/dependency in the review. Reconfirm index schema/projection/IAM and the metadata size/ID/timestamp assumptions against the actual current writer.
6. Save restricted route/integration/authorizer/stage snapshots and exact rollback identifiers. Record content hashes in a release manifest, with no tokens or presigned URLs. Run baseline read-only Claims/Command checks with a designated user's existing claim; record safe pass/fail and schema/hash comparisons, not private claim contents in public logs.

The audit collector is useful for configuration but is not a full code/config rollback backup and does not resolve aliases. User confirmation of Query permission avoids proposing new DynamoDB IAM changes unless fresh evidence conflicts.

## 3. Isolation choice — decide after target inspection

Preferred: reuse an existing genuinely separate staging API AND staging Lambda. Verify storage targets and credentials are isolated too. A stage name alone does not isolate a shared Lambda or its tables.

If no staging exists, propose a short-lived separate HTTP API and candidate Lambda only after approval. Expose only the document GET through JWT, use a narrowly authorized read-only execution role (claim GetItem; document-index Query; minimum logging) and explicitly approved designated test records. Reuse a suitable existing role if available; never silently copy the production role with SES/S3/write powers. Keep the separate API limited to GET, with no function URL, public route or unrelated triggers. Test through API Gateway, not only a fabricated authorizer event. This isolates code/routing but, if reading approved production records, is NOT storage isolation. For write regressions, use an existing fully isolated test backend or propose a separately reviewed configuration change; the current hardcoded resource names prevent pretending that TABLE_NAME alone creates isolation.

Temporary resources are an optional approved cost tradeoff, not created now. No NAT gateway, new DynamoDB table/index, custom domain, provisioned concurrency, scheduler or load test is needed for read validation. If separate staging is declined, require explicit acceptance of a shared-function maintenance window and its larger blast radius; do not label it staging.

A new stage on this same API is not the preferred solution: API route/integration changes can automatically reach the production `$default` stage. Turning off AutoDeploy is itself a production configuration change and does not isolate Lambda code; do not change it as a shortcut.

## 4. Rollback version and release mechanics — approval required

- If production invokes an alias/version: identify the exact known-good version and all weighted targets. Retain that version, preserve alias/policy configuration and verify qualified invoke permission. Update/test $LATEST only after confirming no other production consumers use it. Publish the validated candidate with expected code hash and revision; do not move the production alias until the release gate. Alias switch must use optimistic concurrency and preserve unrelated settings; avoid weighted traffic for this additive route because the old code cannot reliably implement the new contract.
- If production invokes an unqualified ARN/$LATEST: updating its code is immediately a shared production change. Publishing a baseline version alone does NOT protect that traffic. Prefer the separate staging test above; at rollout, either obtain approval to pin existing integrations to a verified known-good version/alias first (with permissions and immediate smoke checks), or accept an explicit maintenance-window code update with the full old ZIP ready for restoration. Pinning is a distinct change, not a hidden prerequisite.
- Reuse an existing matching baseline version or, after approval, publish a baseline immutable version with current CodeSha256/RevisionId guards before updating. Do not assume PublishVersion creates a new duplicate. Retain the downloaded ZIP regardless. Versions do not freeze IAM policies, external tables or all operational settings.
- Build the deployment ZIP from the freshly verified deployed package with only approved changes. Preserve handler path, layers/dependencies, runtime, architecture, environment, role, concurrency, timeout, logging and triggers. Use RevisionId on code updates; stop on drift rather than force-overwriting. Wait for LastUpdateStatus=Successful and verify candidate hash, including any published version, before proceeding.

## 5. Exact production route configuration and order

After staging acceptance and approved shared-function rollout:

1. Verify existing Claims reads still work on the candidate before exposing the new route. If code update breaks existing routes, rollback immediately and do not add the route.
2. Reuse the verified AWS_PROXY integration with payload format 2.0 and correct candidate version/alias. The source expects rawPath and requestContext.authorizer.jwt.claims. Do not create another authentication provider or change existing route targets unnecessarily.
3. Verify existing JWT authorizer: issuer `https://cognito-idp.ap-southeast-2.amazonaws.com/ap-southeast-2_2uQnEvufy`, audience includes approved client `phikh6a6u25oi8be7nefavodi`, identity source `$request.header.Authorization`. Preserve existing verified authorization scopes if compatible with the current credential flow; do not invent a custom scope or change Cognito. If scope changes are necessary, stop for review. Backend additionally enforces token_use=access and sub; ID tokens must fail even if Gateway accepts their signature/audience.
4. Check invoke permission on the actual qualified target. If missing, propose only `lambda:InvokeFunction` for `apigateway.amazonaws.com`, with SourceAccount `465078122271` and SourceArn restricted to this API/stage/method/path, e.g. `arn:aws:execute-api:ap-southeast-2:465078122271:b30dloh6e4/$default/GET/claims/*/documents`. Do not broaden IAM or trust by default. Verify exact ARN against the chosen stage/integration before applying.
5. Create `GET /claims/{claimId}/documents` with Target, AuthorizationType=JWT, the verified AuthorizerId and applicable scopes in the SAME operation. Never create a temporary NONE/public route. `$default` AutoDeploy means this becomes reachable as configuration propagates: this is the live release action, not an inert preparatory step. Check deployment status/route config and call it before enabling frontend use.
6. Do not modify other routes, EventBridge, Cognito, SES, alarms or S3. Frontend wiring remains a separate reviewed change. Existing API access logs must not capture bearer headers, raw query cursors or bodies; retain status/route/request IDs only for acceptance evidence. New handler CloudWatch messages use fixed event/error categories.

## 6. Validation gates

### Candidate and existing-function regressions

- Rerun 23 tests against the final merged source; verify Python runtime/dependency compatibility in a matching local environment with the real boto3 SDK serialization/stubs, not just current lightweight mocks.
- Test the actual API Gateway event/response contract via staging: proper JWT context, JSON response, no-store, genuine document ID/size/boolean/timestamp fields and pagination.
- Existing claims: authenticated list and next page; detail; anonymous denial; invalid/expired token; ownerless/foreign record exclusion; same claim IDs/fields in Claims and Command; no accidental document payload on claim-detail route.
- In isolated test storage, run description PATCH, rejected extra fields, status eligibility, soft cancellation and record retention. Never cancel or modify a real user's claim for a smoke test. Reversal of a description is still a write; cancellation cannot be assumed reversible.
- Upload regression: mocked tests plus explicitly approved isolated intent/upload/completion with harmless valid files, exact 32-hex ID and size boundaries. No production upload or scan-triggering action without approval. Create-claim test sends SES mail in this source: require an approved recipient and explicit send permission, or keep that regression offline; do not pretend a skipped side effect passed live.

### New read endpoint and two users

Use two existing Cognito test accounts A/B in separate secure browser sessions, each with a known owned claim/document. Tokens stay in secure local tooling/BFF; no chat, screenshots, shell history, access logs or reports containing tokens. Do not create accounts/seed records without separate approval.

- A reads A, B reads B: 200, only matching owner/claim records, fields agree with authorized DynamoDB evidence.
- A reads B and B reads A, including a genuine cursor from the other account: indistinguishable 404; query must not occur after failed claim check (offline instrumentation plus code review; live response alone cannot prove absence of an internal query).
- Each user: missing claim and historical ownerless claim -> same 404. Unowned/foreign document rows excluded under otherwise owned claims. Do not insert corrupt production records merely to test this; use isolated fixtures for inconsistent-row cases.
- A's cursor on a different A-owned claim -> 400. Malformed, oversized, bad-version/key/date tokens -> 400. All valid pages preserve ownership; empty filtered page with continuation is not end-of-list; last page nextToken=null. More-than-25 records/filtered-page conditions require approved existing data or isolated fixtures, otherwise record the live coverage gap.
- Unsigned/tampered/expired/wrong-pool/wrong-client JWTs and anonymous requests rejected; ID token rejected. Test real token validation through API Gateway, not just direct Lambda invocation with invented identity.
- No ownerSub in document objects, buckets, S3 keys/version IDs, presigned/download URLs or object bodies. Cursor remains base64 position metadata, not encryption; never log it.
- THREATS_FOUND, QUARANTINE_COPIED and SOURCE_ISOLATED evidence remain distinct; no inferred isolation/time/threat details.
- Safe missing-index/permission/malformed-row failure tests in isolated mocks/staging only: do not remove production permissions to provoke a failure. HTTP errors must not leak provider messages. Observe safe CloudWatch categories and existing error alarms without changing them.

No second user means multi-user live acceptance is blocked, even if all offline tests pass. Keep endpoint rollout/production-readiness approval explicit about this gap.

## 7. Rollback procedure and triggers

Triggers: any ownership exposure, existing Claims regression, incompatible response/schema, new auth failure, elevated errors or unexpected side effect. Stop testing and frontend rollout immediately; capture sanitized evidence only.

- If only the new route is faulty and old routes pass: remove only the new exact route (AutoDeploy applies), BUT first confirm no `$default`/ANY/proxy fallback can route that path to the old broad claim handler. If a fallback exists, design/test an explicit JWT-protected safe-denial route/integration before release; route deletion alone is not a safe rollback. Preflight must settle this, not improvise during an incident.
- Disable exposure of the new route before switching code back, because the supplied old GET branch can return a claim object for nested paths containing claimId.
- Alias release: restore exact old alias/version/weights using current revision guard; verify existing target permissions and Claims reads. Do not delete either version during the rollback window.
- $LATEST release: restore the verified full backup ZIP with the current RevisionId guard, wait for successful update, confirm hash and recheck existing routes. This is a code restoration, not automatic snapshot rollback. Never revert unrelated config changed by another operator; coordinate rather than overwrite drift.
- Restore only specifically changed integration/permission entries from the manifest if required, preserving existing settings. Deleting a route does not revert Lambda code; restoring an API deployment snapshot does not revert Lambda code either. Do not rely on a manual deployment pointer rollback while AutoDeploy is active.
- No document rollback should be needed: the endpoint only reads. Production mutation tests must not be part of this rollout. Temporary staging cleanup needs approval and should retain private rollback packages, manifest and essential diagnostic evidence through the agreed observation period.

## Costs and approval package

Reuse existing table/index/authorizer/role permissions where verified. Read requests perform one claim GetItem and one bounded GSI Query, with no object reads or writes. ALL projection can consume read capacity based on stored index item sizes even though the response is allowlisted. Limit acceptance calls and do not enable polling/load testing yet. Temporary staging incurs API/Lambda/DynamoDB reads and logging/storage charges; no monetary estimate is asserted without account pricing and usage. No provisioned capacity, scheduled invocations or new data stores proposed.

Before approval provide: fresh source/config diff, package hash/revision manifest, staging choice/resource and permission diff, exact JWT route/invoke configuration, test results and coverage gaps, baseline and rollback package/version IDs, and rollback rehearsal results. No write commands are included for execution in this planning task.

## AWS reference semantics checked

- HTTP API AutoDeploy: https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-stages.html
- JWT verification and audience/client_id/scope rules: https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html
- HTTP API Lambda payload format: https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html
- Immutable published versions: https://docs.aws.amazon.com/en_gb/lambda/latest/dg/configuration-versions.html
- RevisionId-guarded updates: https://docs.aws.amazon.com/lambda/latest/api/API_UpdateFunctionCode.html
