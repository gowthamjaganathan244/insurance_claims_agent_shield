# Security read API — configuration and approval checkpoint

The current Security page still consumes fixture incidents. The supplied backend
has upload-intent and upload-completion operations, but no verified reusable
document/security GET endpoint. A frontend fetch to an invented path cannot make
this page live. This checkpoint does not claim integration is complete.

## Missing evidence

- Projection of ACTIVE `claimId-createdAt-index` on `agentshield-documents`.
- Actual claims Lambda role read permissions and permission boundary.
- Current API routes, authorizer, integration and stage/deployment configuration.
- Successful owner-authorized live read response once the new endpoint is deployed.

The read-only CloudShell collector in
`scripts/agentshield-security-read-audit.sh` retrieves configuration for these
checks. It does not retrieve environment secrets, tokens, item data or S3 objects.
Upload that script to CloudShell, run `bash agentshield-security-read-audit.sh`,
review/download `agentshield-security-read-audit.zip`, and provide the ZIP locally.
Failed reads are listed without changing permissions. Existing SCPs, resource
policies or other constraints may require additional review if access is denied.

## Proposed AWS changes — not applied or yet approved

1. Add `GET /claims/{claimId}/documents` with bounded cursor pagination to the
   existing claims Lambda and API Gateway integration, using the existing JWT
   authorizer. Handle this route before the broad claim-detail GET branch.
2. Verify claim.ownerSub against verified JWT sub; query only that claim's existing
   documents index, then verify each document owner/claim before projecting fields.
   No adoption of ownerless records, table scan or general object download.
3. If index projection is sufficient, Query can supply the fields. Otherwise use
   bounded BatchGetItem for the returned document IDs. Do not assume a new index
   or index modification is necessary.
4. Add only missing role permissions: Query on the documents index and, if needed,
   BatchGetItem/GetItem on the document table. Existing claim GetItem access remains
   needed. The metadata read API requires no S3 copy/delete/download permissions.
5. Publish the updated Lambda/API only after presenting the exact local patch,
   tests and IAM diff and obtaining explicit deployment approval. Current user
   instructions prohibit deployment; source authorization is not deploy approval.

No new Lambda/table/queue is proposed. The existing index supports a per-claim
Security view. Account-wide aggregation would require a separate bounded access
design and cost review. The plan must not query every customer's documents.

## Local implementation after verification

Prepare and test the read handler against the verified projection, then prepare
the Next BFF and Security view using existing session/CSRF conventions as applicable.
Preserve visual card structure and responsive styling, replacing fictional severity,
analysis and incidents with recorded document IDs, scan/workflow status and evidence.
Poll only the selected visible claim's page, with manual refresh, timestamp,
pagination, cancellation/backoff and explicit unavailable/empty states. Never use
fixtures if the read endpoint fails.

THREATS_FOUND, verified QUARANTINE_COPIED with source isolation pending, and the
restricted recorded SOURCE_ISOLATED outcome remain distinct. No quarantine object
URLs are returned. The EventBridge rule remains DISABLED; reads can expose stored
historical evidence, but must not imply automatic processing is active. Enabling
the rule or changing processor recovery remains a separate approval decision.

## Verification so far

Local page/routes and audit were re-inspected. Collector shell syntax was checked;
it has not been run against AWS here. No UI/application implementation, Lambda
deployment, IAM change, source deletion, event-rule change or GitHub push occurred.
Live Security data and two-user authorization are not yet verified.
