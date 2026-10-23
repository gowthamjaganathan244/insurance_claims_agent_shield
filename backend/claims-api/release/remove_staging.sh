#!/usr/bin/env bash
# PREPARED ONLY. Removes ONLY the staging resources recorded by create_staging.sh.
set -euo pipefail
set +x
: "${AGENTSHIELD_APPROVE_STAGING_REMOVE:?Set to YES only after explicit cleanup/rollback approval}"
[[ "$AGENTSHIELD_APPROVE_STAGING_REMOVE" == YES ]] || exit 1
STATE="${1:?staging state directory required}"
export AWS_PAGER=""
REGION=ap-southeast-2
[[ $(aws sts get-caller-identity --query Account --output text) == 465078122271 ]] || exit 1
FUNCTION=$(cat "$STATE/function-name")
ROLE=$(cat "$STATE/role-name")
GROUP=$(cat "$STATE/log-group")
[[ "$FUNCTION" =~ ^agentshield-documents-review-[0-9a-f]{10}$ ]] || exit 1
[[ "$ROLE" == "$FUNCTION-role" && "$GROUP" == "/aws/lambda/$FUNCTION" ]] || exit 1
if [[ -s "$STATE/api-id" ]]; then
  API=$(cat "$STATE/api-id")
  [[ "$API" != b30dloh6e4 && "$API" =~ ^[a-z0-9]+$ ]] || exit 1
  [[ $(aws apigatewayv2 get-api --api-id "$API" --region "$REGION" --query Name --output text) == "$FUNCTION" ]] || exit 1
  # Removes exposure first. This API has only the staging document route.
  aws apigatewayv2 delete-api --api-id "$API" --region "$REGION"
fi
aws lambda delete-function --function-name "$FUNCTION" --region "$REGION"
aws iam delete-role-policy --role-name "$ROLE" --policy-name DocumentReadOnly
aws iam delete-role --role-name "$ROLE"
# Retain staging log group (3-day retention) for incident review. Delete later
# only after reviewing/exporting safe evidence and obtaining cleanup approval.
echo 'Staging API/function/role removed. Production untouched. Log group retained.'
