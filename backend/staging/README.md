# Task 11 isolated staging candidate — not deployed

This is executable local implementation plus a proposed, **unexecuted** AWS change set. Production `agentshield-claims-api`, API `b30dloh6e4` (`$default` AutoDeploy=true), Cognito, existing tables/buckets, alarms and the disabled malware EventBridge rule are never updated by this stack.

## Concrete resources / IAM for approval

One new HTTP API (JWT, same pool/client; no anonymous/default wildcard route), two new Python 3.14 Lambdas, two new execution roles, two three-day log groups, and one encrypted on-demand workflow DynamoDB table with `messageId-index`. Stage AutoDeploy=false, burst=3/rate=1 request/second. No VPC, NAT gateway, load balancer, provisioned concurrency or provisioned database capacity.

- Document Lambda: `dynamodb:GetItem` on `agentshield-claims`; `dynamodb:Query` on `agentshield-documents/index/claimId-createdAt-index`. No S3 access, existing-table writes, Cognito administration or SES sends.
- Operations Lambda: GetItem on existing claims/documents; GetItem/Query/PutItem/UpdateItem on only its new table/index. Transactions use the relevant item-action permissions. Owner verification precedes reads. Mutations additionally require the explicit `OperatorSubs` allowlist; empty denies mutations.
- SES template read: `ses:GetEmailTemplate` requires `Resource:*` per AWS authorization model, restricted to Sydney. Application fetches only `AgentShieldClaimCreated` and requires an allowlisted operator.
- CloudWatch access remains a separate server role/SSO requirement: see `docs/monitoring-read-policy.json`. Do not attach policies to existing roles without a separately approved principal and change.
- Email is **disabled by default**. Optional resources in the template are not created with `EnableEmail=false`. Enabling it needs separate approval for one SES configuration set, SNS topic/policy/subscription and Lambda invocation permission. Optional send permissions limit sender identity/from-address, approved recipient, template/configuration set; AdminGetUser is limited to the existing pool. No existing template/identity is edited. No email is sent during deployment.

Security boundary: staging reads current production claim/document metadata after JWT and ownerSub checks, but writes only its own workflow table. It is not a separate data sandbox. Existing claim creation/upload UI still writes the existing Claims service when a user explicitly submits; do not use those actions as a staging smoke test. Full synthetic fixture isolation requires separately approved test records/storage. Do not change the old Lambda just to expose document reads.

## Local validation and release

```sh
python3.14 backend/staging/build_template.py
python3.14 backend/staging/package.py --output outputs/NEW-UNUSED-RELEASE-DIRECTORY
python3.14 backend/staging/validate.py outputs/NEW-UNUSED-RELEASE-DIRECTORY
cfn-lint backend/staging/template.json --regions ap-southeast-2
```

The supplied release is `outputs/task11-stage-20261022`. Its manifest records exact ZIP/source/template hashes. Packages contain only `lambda_function.py`, matching the original runtime-provided boto3 packaging; compatible SDK serialization tests ran with boto3/botocore 1.43.117. Native local Python 3.14 is not proof of Lambda AL2023/x86_64 runtime acceptance. No container runtime is installed here; first isolated invoke must verify that platform.

## Approval-gated preparation and deployment

Prerequisites: approved existing private S3 artifact bucket in ap-southeast-2, temporary AWS deployment role, approved non-secret Cognito operator sub(s), and approval of this exact resource/IAM scope. The script does not create an artifact bucket. Choose a **new** stack name beginning `agentshield-task11-stage`; CREATE refuses to update existing resources. Use no passwords, tokens or access keys in commands.

After explicit approval for artifact uploads and change-set preparation:

```sh
export AGENTSHIELD_APPROVE_STAGE_PREPARE=YES
bash backend/staging/prepare-change-set.sh \
  outputs/task11-stage-20261022 \
  YOUR_APPROVED_PRIVATE_ARTIFACT_BUCKET \
  agentshield-task11-stage \
  YOUR_APPROVED_OPERATOR_SUB
```

This reads production code hash and aborts on drift, verifies artifact hashes, uploads two encrypted ZIP objects and creates an **unexecuted** change set. Review the printed resources; every resource action must be Add. Confirm no production identifiers are modification targets. This is a CREATE-only first deployment script; future API changes need a fresh deployment logical ID/change set, not silent AutoDeploy.

Only after approving the reviewed change set:

```sh
aws cloudformation execute-change-set --stack-name agentshield-task11-stage \
  --change-set-name review-6e2412afac07e02a --region ap-southeast-2
aws cloudformation wait stack-create-complete --stack-name agentshield-task11-stage --region ap-southeast-2
aws cloudformation describe-stacks --stack-name agentshield-task11-stage \
  --query 'Stacks[0].Outputs' --region ap-southeast-2 --output table
```

Use the returned ApiOrigin in **server-only** `DOCUMENTS_READ_API_ORIGIN` and `OPERATIONS_API_ORIGIN`; restart local Next. No Cognito callback, logout URL, production route or Lambda code update is needed. Verify new functions' CodeSha256 against the package manifest before connecting the frontend.

## Required acceptance checks

1. API without JWT and with expired/wrong-client JWT: denied by Gateway. Signed-in ordinary user can read only owned data; operator allowlist alone never grants another user's claim access.
2. Two separate Cognito accounts with owned claims/documents: own read succeeds, cross-user read/mutation returns 404; historical unowned records remain absent; each cursor is bound to owner/claim.
3. Compare document IDs/status/scan flags/timestamps with DynamoDB. No bucket/key/presigned download URL/object contents in the response. Exercise pagination including filtered empty pages. THREATS_FOUND, quarantine copy and source isolation remain distinct.
4. Existing production Claims GET/detail still match known records and original code hash/routes remain unchanged. Existing edit/cancel/create/upload regression tests are mocked locally; real mutations need specifically approved test claims and, for creation, email acknowledgement.
5. On an approved owned claim only: record evidence assessment, approve/reject, record a payment workflow (no transfer), record manual reconciliation. Reload to verify persistence; conflicting version returns 409; repeated requestId cannot repeat its side effect. These are human records, not insurer policy decisions or bank-verified settlement.
6. SES reads show exact stored template. Email-disabled actions must fail. After separately approved sender/recipient/tracking configuration: one explicit test send, verify SES acceptance separately from actual delivery event persisted by SNS. Never resend automatically after an ambiguous response. Existing claim-confirmation emails have no retroactive history in this new table.
7. CloudWatch profile + `MONITORING_ALLOWED_SUBS`: compare three alarm states and measurement timestamps/periods to CloudWatch. Do not consider missing samples healthy.
8. HTTPS frontend remains a separate hosting approval. Current sessions use private persistent SQLite; a stateless serverless filesystem is unsuitable. Domain, hosting choice and budget are still required. Do not deploy this app to ephemeral storage as-is.

Automated tests use mocked AWS transports; they do not establish live two-user isolation or AWS runtime correctness.

## Costs, risks and rollback

Planning allowance for **small manual staging** (up to 10,000 API requests, short 128 MiB invocations, under 100 MiB table/log data, email disabled): approximately **US$1–5/month incremental backend spend**, excluding tax, existing services, CloudWatch metric-read polling, S3/GuardDuty uploads and HTTPS frontend hosting. This is an allowance, not an AWS quote or spending cap. Confirm Sydney pricing and approved budget before deployment. Continuous open-tab polling increases reads; throttles limit API request rate, not total spend. Table storage is retained for audit on stack deletion and still costs money.

References: [Lambda pricing](https://aws.amazon.com/lambda/pricing/), [HTTP API pricing](https://aws.amazon.com/api-gateway/pricing/), [DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/on-demand/), [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/), [SES authorization](https://docs.aws.amazon.com/service-authorization/latest/reference/list_sesv2.html).

Rollback starts by clearing the two optional frontend origins and restarting Next. This restores unavailable states and stops staging polling without changing authentication or production Claims. Inspect failures before any destructive cleanup. After approval, delete only the new stack:

```sh
aws cloudformation delete-stack --stack-name agentshield-task11-stage --region ap-southeast-2
aws cloudformation wait stack-delete-complete --stack-name agentshield-task11-stage --region ap-southeast-2
```

The workflow table is intentionally **retained**; export/review its audit records and obtain separate approval before deleting it. Uploaded S3 artifacts are also retained; delete only the two exact release keys after review. No rollback of the shared production Lambda or auto-deploy API is necessary because neither was modified. Enabling/disabling GuardDuty event delivery is outside this plan.
