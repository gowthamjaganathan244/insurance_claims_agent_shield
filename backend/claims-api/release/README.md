# Release preparation: documents metadata endpoint

**Prepared only. No AWS modification, deployment, commit or push performed.** Production remains `agentshield-claims-api` unqualified/$LATEST behind API `b30dloh6e4`, integration `zkdmyz5`, JWT authorizer `ldmb26`, `$default` AutoDeploy=true (observed deployment `6ky16r`). The shared Lambda source is unchanged by this release-preparation work.

## Artifact and results

Artifacts are in `outputs/claims-api-release/` (git-ignored):

- `agentshield-claims-api-documents-candidate.zip`
- `agentshield-claims-api-original.zip` — exact original code rollback package
- `manifest.json`, `agentshield-claims-api-documents-candidate.zip.sha256`, `validation.log`

Candidate ZIP SHA-256 (hex):
`dd493279dbd03a2a52a4d9be333103d3ea3f01369243221731736fe0ef83a7d9`

Candidate Lambda CodeSha256 (base64):
`3UkyedvQOipSpNm+MzED0+o/ATaSQyIXMXNv4O+Dp9k=`

Candidate source SHA-256:
`5c129626cab948e68e511e02e81c41bf820bd733e55da6be0310b30af7bd201c`

Original package CodeSha256:
`h+RE0xG5iqu2LixLweN0Bno3KZMyehgIo/cAMRXZQvE=`

The deterministic ZIP contains only `lambda_function.py` at root, mode 0644. No tests, environment files, credentials, caches or local dependencies are included. Original ZIP has the same one-file structure. Hashes and ZIP CRC/content were checked; the exact extracted candidate was tested, not only the working source.

Executed locally:

- CPython **3.14.9**, macOS arm64, installed in an isolated temporary directory.
- **23 handler regressions passed**, covering ownership, upload/read size and ID compatibility, cursor isolation, safe diagnostics and existing claim operations.
- **4 real SDK/Stubber tests passed**, covering DynamoDB deserialization/Decimal, continuation keys, conditions/wire serialization, real ClientError handling and denial before document Query.
- The **same 27 tests passed against the extracted ZIP**.
- boto3 **1.43.117**, botocore **1.43.117**; all seven installed SDK/dependency packages passed `uv pip check`. Exact test dependency versions are recorded in `test-requirements.txt`.
- Python syntax checks and shell `bash -n` checks passed for release tools. No AWS CLI command in the prepared scripts was executed.

**Not yet validated:** actual Lambda Amazon Linux 2023/x86_64 runtime or deployed regional runtime SDK. Docker/container engine is absent here. Local CPython 3.14 success is not full AWS runtime parity. Existing deployed layers/runtime SDK details have not been supplied. Final live JWT/IAM/data validation and two-user acceptance remain outstanding. Existing mocked create/upload tests do not prove real SES/S3 flows. No frontend code changed; npm/Playwright tests were not rerun for this backend release preparation.

## Dependency decision

Preserve the original runtime-provided boto3/botocore packaging. The application imports only Python standard-library modules and AWS's included SDK; no native extension or partially vendored SDK dependency is added. The local SDK tests check a pinned compatible version, not the unknown SDK revision currently deployed in ap-southeast-2. The existing production layers, if any, must be inventoried before production rollout. AWS recommends bundling a coherent full dependency set for reproducibility; moving production to bundled SDK dependencies is a separate reviewed change, not silently mixed into this patch.

## Required AL2023/x86_64 test — local commands, NOT run here

On a machine with Docker (20.10.10+), from the repository root:

```bash
docker pull --platform linux/amd64 public.ecr.aws/lambda/python:3.14
AS_IMAGE=$(docker image inspect public.ecr.aws/lambda/python:3.14 --format '{{index .RepoDigests 0}}')
printf '%s\n' "$AS_IMAGE"
docker run --rm --platform linux/amd64 --network none \
  --entrypoint /var/lang/bin/python \
  -e PYTHONDONTWRITEBYTECODE=1 -e AWS_EC2_METADATA_DISABLED=true \
  -v "$PWD:/var/task:ro" -w /var/task "$AS_IMAGE" \
  backend/claims-api/release/validate_package.py \
  outputs/claims-api-release/agentshield-claims-api-documents-candidate.zip
```

Record the resolved image digest and test output. This runs the ZIP tests with the AWS base-image SDK and no network or AWS credentials. Managed-runtime regional rollout may still differ from the image; authenticated staging calls remain required. Do not proceed with a failing test. Docker installation/VM setup has not been performed in this task.

## Staging isolation and minimum scope

There is no verified existing isolated staging stack. Proposed temporary resources, requiring explicit approval:

- One uniquely named Lambda `agentshield-documents-review-<10hex>`, Python 3.14/x86_64, 128 MiB/15-second timeout, candidate published version.
- One separate HTTP API with only `GET /claims/{claimId}/documents`; separate JWT authorizer with the **existing** pool issuer and app-client audience. Production API/authorizer/integration untouched.
- A new minimal Lambda role because no suitable existing read-only role was verified. It has GetItem on `agentshield-claims`, Query on the ALL-projection documents GSI and logging rights on its own log group. No SES, S3, DynamoDB writes or account-wide monitoring permissions.
- One log group with three-day retention. New staging `$default` has AutoDeploy=false, one explicit deployment, throttle 1 request/second with burst 5. No provisioned concurrency, NAT, custom domain, table/index, queue or background poller.

Stage code is isolated but storage is shared **read-only**. Only explicitly approved existing test records should be queried. This is not suitable for write/SES/upload regressions: production names remain hardcoded in the source. The separate role prevents accidental writes even if a handler branch is reached. Existing Cognito accounts are reused; no Cognito resources changed. No production invoke policy statement is added.

Costs: bounded API/Lambda executions, one claim read and one document-index Query per request, logs and version storage. IAM roles have no direct usage charge. ALL-projection reads are billed on index data read, not the small response projection. No dollar estimate/free-tier claim is made. Stop testing and remove staging after review. No load tests or UI polling are included.

## Exact staging creation commands — require approval; NOT executed

Upload the candidate ZIP and the three prepared staging scripts to a private CloudShell working directory. Scripts contain no credentials. Keep the ZIP name unchanged. Do not upload `.env.local`, sessions, AWS credential files or application data.

After AL2023 tests and explicit approval of temporary resources/read-only production-data access:

```bash
bash -n create_staging.sh
AGENTSHIELD_APPROVE_STAGING_CREATE=YES bash create_staging.sh \
  "$PWD/agentshield-claims-api-documents-candidate.zip" \
  "$PWD/agentshield-staging-state"
```

`create_staging.sh` contains the exact AWS CLI commands and generated policies. It checks account 465078122271, region ap-southeast-2, candidate hash, reported production source hash and actual TABLE_NAME=agentshield-claims before creating resources. Production reads never print full environment values. New stage IDs/configuration are recorded immediately in a private state directory. No credentials or tokens are stored there. IAM/create/log/deploy permissions and iam:PassRole are prerequisites for the operator; failures must be reviewed, not worked around with broad administrator changes.

The script deliberately refuses an existing state directory and does not automatically tear down on failure. If IAM propagation or an API call fails, inspect recorded resources and resume only the failed command from the script, using the same state; do not rerun the whole script/create duplicate resources. Role waiter plus 10-second propagation pause is not a guarantee. State files are not shell-sourced. Do not edit recorded IDs to production resources.

## Exact configuration verification commands — read only

After creation, in the same CloudShell directory:

```bash
export AWS_PAGER=""
AS_STATE="$PWD/agentshield-staging-state"
AS_API=$(cat "$AS_STATE/api-id")
AS_FUNCTION=$(cat "$AS_STATE/function-name")
AS_VERSION=$(cat "$AS_STATE/version")
aws apigatewayv2 get-routes --api-id "$AS_API" --region ap-southeast-2 \
  --query 'Items[].{RouteKey:RouteKey,Target:Target,AuthorizationType:AuthorizationType,AuthorizerId:AuthorizerId}'
aws apigatewayv2 get-authorizer --api-id "$AS_API" \
  --authorizer-id "$(cat "$AS_STATE/authorizer-id")" --region ap-southeast-2 \
  --query '{Type:AuthorizerType,IdentitySource:IdentitySource,JWT:JwtConfiguration}'
aws apigatewayv2 get-integration --api-id "$AS_API" \
  --integration-id "$(cat "$AS_STATE/integration-id")" --region ap-southeast-2 \
  --query '{Type:IntegrationType,Target:IntegrationUri,Payload:PayloadFormatVersion}'
aws apigatewayv2 get-stage --api-id "$AS_API" --stage-name '$default' --region ap-southeast-2 \
  --query '{AutoDeploy:AutoDeploy,DeploymentId:DeploymentId}'
aws lambda get-function-configuration --function-name "$AS_FUNCTION" --qualifier "$AS_VERSION" \
  --region ap-southeast-2 --query '{Runtime:Runtime,Architectures:Architectures,State:State,Hash:CodeSha256}'
aws lambda get-policy --function-name "$AS_FUNCTION" --qualifier "$AS_VERSION" --region ap-southeast-2
```

Confirm one exact JWT-protected GET route, correct Cognito settings, published candidate version, 2.0 payload, no production target, expected package hash and stage-scoped invoke permission. No `$default` catch-all route or public NONE route is created. An HTTP API stage called `$default` is distinct from a catch-all route called `$default`.

## Exact read verification command — requires approved test accounts/data

```bash
python3 verify_staging.py --state "$PWD/agentshield-staging-state" --approved-live-reads
```

The script prompts privately with getpass for two existing Cognito access tokens; never paste tokens into chat, command arguments, files or shell history. Obtain them using an approved secure local authentication process. This script does not sign users in, bypass MFA or manufacture JWTs. It performs only bounded HTTPS GETs, refuses the production API ID and redirects, prints no token/response contents, and checks:

- A/B each read their known owned document records; no unsafe fields; valid ID schema/no-store.
- Reciprocal cross-owner claim/cursor denial, nonexistent claims, optional known unowned claim.
- Anonymous/invalid-JWT rejection; malformed pagination rejection; bounded continuation/no duplicates.

At least one existing document per account is required. Without a second account this gate stays blocked. More-than-25-row pagination is reported as partial unless real continuation exists. No records are created to force pagination. Compare returned IDs/fields privately with DynamoDB console using authorized access; script PASS does not establish that independent comparison. Real expired/wrong-client/wrong-pool/ID-token tests remain separate secure test inputs, and no private token should be put into a saved request collection.

Existing production regression: sign in normally; verify Claims list/detail/next-page and Command ID parity before and after the staging experiment. No existing routes are modified. Existing PATCH/cancel/upload/create behavior is covered offline; live mutation tests require isolated test storage and separate approval (especially SES sends and irreversible cancellation). Do not perform them on production as part of this staging script.

## Exact staging rollback/cleanup commands — require approval; NOT executed

For a successfully created staging stack:

```bash
AGENTSHIELD_APPROVE_STAGING_REMOVE=YES bash remove_staging.sh \
  "$PWD/agentshield-staging-state"
```

The script verifies account and generated names, rejects API b30dloh6e4, checks the staging API's name, removes its API exposure FIRST, deletes only the stage Lambda (including its published version), then its inline policy and role. It retains logs with three-day retention for review. It does not change production or remove the local original backup. Rollback for this first isolated release is removal, not a production alias/code update.

Partial creation: inspect `function-name`, `role-name`, `api-id` and corresponding read-only get operations first. If a resource was never created/already removed, do not rerun complete cleanup blindly; execute only the applicable delete command from `remove_staging.sh` for the verified generated resource. CLI errors stop the script. Never substitute a production ID. If all temporary evidence is no longer needed, this additional log-group deletion requires explicit approval:

```bash
AS_GROUP=$(cat "$PWD/agentshield-staging-state/log-group")
[[ "$AS_GROUP" =~ ^/aws/lambda/agentshield-documents-review-[0-9a-f]{10}$ ]] || exit 1
aws logs delete-log-group --log-group-name "$AS_GROUP" --region ap-southeast-2
```

No production rollback is needed because production is never modified. The exact original package is retained for a separately approved future production release. Do not run update-function-code against production using old captured RevisionIds: fresh guards, config backup, immutable baseline version and two-user release acceptance are still required. Publishing a version alone does not protect production's current unqualified/$LATEST traffic.

## Blockers / remaining approval gates

1. AL2023/x86_64 container test not run (no Docker here); regional managed-runtime SDK/layers still not independently verified.
2. Creation of temporary API/Lambda/role/log group and use of designated production test records requires approval; scripts are prepared, not executed.
3. Need two real test users with owned claims/documents; only one was previously available.
4. Reconfirm AWS hashes/revisions and storage bindings before changes; supplied snapshots are not continuous monitoring.
5. Deployer permissions and possible role-propagation constraints have not been tested. Do not broaden production IAM to satisfy staging.
6. Current Security frontend is not wired to this proposed staging API. No claim of end-to-end live Security integration.

AWS references: [Python runtime/SDK](https://docs.aws.amazon.com/lambda/latest/dg/lambda-python.html), [ZIP/dependency packaging](https://docs.aws.amazon.com/lambda/latest/dg/python-package.html), [Python 3.14 AL2023 base image](https://docs.aws.amazon.com/lambda/latest/dg/python-image.html).
