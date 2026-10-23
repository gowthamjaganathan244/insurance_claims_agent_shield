#!/usr/bin/env bash
# PREPARED ONLY. Creates chargeable staging resources after explicit approval.
# Never updates production Lambda, API, policies, tables, buckets or Cognito.
set -euo pipefail
set +x
: "${AGENTSHIELD_APPROVE_STAGING_CREATE:?Set to YES only after approving this exact staging plan}"
[[ "$AGENTSHIELD_APPROVE_STAGING_CREATE" == YES ]] || exit 1
PACKAGE=$(python3 -c 'import pathlib,sys; print(pathlib.Path(sys.argv[1]).resolve())' "${1:?candidate ZIP path required}")
STATE="${2:?new private staging state directory required}"
[[ ! -e "$STATE" ]] || { echo 'State directory already exists; stop.'; exit 1; }
export AWS_PAGER=""
REGION=ap-southeast-2
ACCOUNT=465078122271
[[ $(aws sts get-caller-identity --query Account --output text) == "$ACCOUNT" ]] || exit 1
python3 - "$PACKAGE" <<'PY'
import hashlib,sys
assert hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest() == 'dd493279dbd03a2a52a4d9be333103d3ea3f01369243221731736fe0ef83a7d9', 'Wrong package'
PY
# Source configuration read only; do not dump the full Lambda environment.
TABLE=$(aws lambda get-function-configuration --function-name agentshield-claims-api --region "$REGION" --query 'Environment.Variables.TABLE_NAME' --output text)
[[ "$TABLE" == agentshield-claims ]] || { echo 'Unexpected claims table; stop for review.'; exit 1; }
# Abort if production code has drifted since the source review.
LIVE_HASH=$(aws lambda get-function-configuration --function-name agentshield-claims-api --region "$REGION" --query CodeSha256 --output text)
[[ "$LIVE_HASH" == 'h+RE0xG5iqu2LixLweN0Bno3KZMyehgIo/cAMRXZQvE=' ]] || { echo 'Production code drift; stop.'; exit 1; }
umask 077
mkdir "$STATE"
SUFFIX=$(python3 -c 'import uuid; print(uuid.uuid4().hex[:10])')
FUNCTION="agentshield-documents-review-$SUFFIX"
ROLE="$FUNCTION-role"
GROUP="/aws/lambda/$FUNCTION"
printf '%s\n' "$FUNCTION" > "$STATE/function-name"
printf '%s\n' "$ROLE" > "$STATE/role-name"
printf '%s\n' "$GROUP" > "$STATE/log-group"
cat > "$STATE/trust.json" <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON
python3 - "$STATE/read-policy.json" "$GROUP" <<'PY'
import json,sys
base='arn:aws:'
policy={'Version':'2012-10-17','Statement':[
 {'Effect':'Allow','Action':'dynamodb:GetItem','Resource':'arn:aws:dynamodb:ap-southeast-2:465078122271:table/agentshield-claims'},
 {'Effect':'Allow','Action':'dynamodb:Query','Resource':'arn:aws:dynamodb:ap-southeast-2:465078122271:table/agentshield-documents/index/claimId-createdAt-index'},
 {'Effect':'Allow','Action':['logs:CreateLogStream','logs:PutLogEvents'],
  'Resource':'arn:aws:logs:ap-southeast-2:465078122271:log-group:'+sys.argv[2]+':*'}]}
open(sys.argv[1],'w').write(json.dumps(policy,indent=2)+'\n')
PY
aws iam create-role --role-name "$ROLE" --assume-role-policy-document "file://$STATE/trust.json" --query Role.Arn --output text > "$STATE/role-arn"
aws iam put-role-policy --role-name "$ROLE" --policy-name DocumentReadOnly --policy-document "file://$STATE/read-policy.json"
aws logs create-log-group --log-group-name "$GROUP" --region "$REGION"
aws logs put-retention-policy --log-group-name "$GROUP" --retention-in-days 3 --region "$REGION"
aws iam wait role-exists --role-name "$ROLE"
# Allow normal IAM propagation; if CreateFunction still fails, stop and inspect
# state before retrying that one command. Do not rerun this entire script.
sleep 10
aws lambda create-function --function-name "$FUNCTION" --runtime python3.14 --architectures x86_64 \
  --handler lambda_function.lambda_handler --role "$(cat "$STATE/role-arn")" \
  --zip-file "fileb://$PACKAGE" --timeout 15 --memory-size 128 \
  --environment 'Variables={TABLE_NAME=agentshield-claims}' --publish --region "$REGION" \
  --query '{FunctionArn:FunctionArn,Version:Version,CodeSha256:CodeSha256}' --output json > "$STATE/function.json"
aws lambda wait function-active-v2 --function-name "$FUNCTION" --region "$REGION"
VERSION=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["Version"])' "$STATE/function.json")
[[ "$VERSION" =~ ^[0-9]+$ ]] || exit 1
printf '%s\n' "$VERSION" > "$STATE/version"
TARGET="arn:aws:lambda:$REGION:$ACCOUNT:function:$FUNCTION:$VERSION"
ACTUAL=$(aws lambda get-function-configuration --function-name "$FUNCTION" --qualifier "$VERSION" --region "$REGION" --query CodeSha256 --output text)
[[ "$ACTUAL" == '3UkyedvQOipSpNm+MzED0+o/ATaSQyIXMXNv4O+Dp9k=' ]] || exit 1
# No --target quick-create: no unauthenticated default route is generated.
aws apigatewayv2 create-api --name "$FUNCTION" --protocol-type HTTP --region "$REGION" --query ApiId --output text > "$STATE/api-id"
API=$(cat "$STATE/api-id")
[[ "$API" != b30dloh6e4 ]] || exit 1
aws apigatewayv2 create-authorizer --api-id "$API" --name AgentShieldCognitoReview \
  --authorizer-type JWT --identity-source '$request.header.Authorization' \
  --jwt-configuration 'Audience=[phikh6a6u25oi8be7nefavodi],Issuer=https://cognito-idp.ap-southeast-2.amazonaws.com/ap-southeast-2_2uQnEvufy' \
  --region "$REGION" --query AuthorizerId --output text > "$STATE/authorizer-id"
aws apigatewayv2 create-integration --api-id "$API" --integration-type AWS_PROXY --integration-method POST \
  --integration-uri "$TARGET" --payload-format-version 2.0 --timeout-in-millis 15000 \
  --region "$REGION" --query IntegrationId --output text > "$STATE/integration-id"
aws apigatewayv2 create-route --api-id "$API" --route-key 'GET /claims/{claimId}/documents' \
  --target "integrations/$(cat "$STATE/integration-id")" --authorization-type JWT \
  --authorizer-id "$(cat "$STATE/authorizer-id")" --region "$REGION" --query RouteId --output text > "$STATE/route-id"
aws lambda add-permission --function-name "$FUNCTION" --qualifier "$VERSION" \
  --statement-id StageDocumentReadInvoke --action lambda:InvokeFunction --principal apigateway.amazonaws.com \
  --source-account "$ACCOUNT" --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT:$API/\$default/GET/claims/*/documents" \
  --region "$REGION" > "$STATE/invoke-policy.json"
aws apigatewayv2 create-deployment --api-id "$API" --region "$REGION" --query DeploymentId --output text > "$STATE/deployment-id"
aws apigatewayv2 create-stage --api-id "$API" --stage-name '$default' --no-auto-deploy \
  --deployment-id "$(cat "$STATE/deployment-id")" \
  --default-route-settings 'ThrottlingBurstLimit=5,ThrottlingRateLimit=1' --region "$REGION" > "$STATE/stage.json"
printf 'https://%s.execute-api.%s.amazonaws.com\n' "$API" "$REGION" > "$STATE/endpoint"
printf 'Staging created. State directory: %s\n' "$STATE"
echo 'Production unchanged. Perform authenticated read verification; do not enable frontend polling.'
