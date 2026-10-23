#!/usr/bin/env bash
# PREPARED ONLY. Uploads artifacts and creates an UNEXECUTED change set after approval.
set -euo pipefail
set +x
: "${AGENTSHIELD_APPROVE_STAGE_PREPARE:?Explicit approval required for S3 upload and change-set creation}"
[[ "$AGENTSHIELD_APPROVE_STAGE_PREPARE" == YES ]] || exit 1
PACKAGE_DIR="${1:?local release directory}"
ARTIFACT_BUCKET="${2:?existing private same-region artifact bucket}"
STACK="${3:-agentshield-task11-stage}"
OPERATORS="${4:-}"
[[ "$STACK" == agentshield-task11-stage* && ${#STACK} -lt 40 ]] || exit 1
export AWS_PAGER=""
REGION=ap-southeast-2
[[ $(aws sts get-caller-identity --query Account --output text) == 465078122271 ]] || exit 1
[[ $(aws s3api get-bucket-location --bucket "$ARTIFACT_BUCKET" --query LocationConstraint --output text) == "$REGION" ]] || exit 1
[[ $(aws s3api get-public-access-block --bucket "$ARTIFACT_BUCKET" --query 'PublicAccessBlockConfiguration.{a:BlockPublicAcls,b:IgnorePublicAcls,c:BlockPublicPolicy,d:RestrictPublicBuckets}' --output text) == $'True\tTrue\tTrue\tTrue' ]] || { echo 'Require a private artifact bucket with all public access blocked.'; exit 1; }
# Read-only guard against unexpected production code drift. Never uploads production code.
[[ $(aws lambda get-function-configuration --function-name agentshield-claims-api --region "$REGION" --query CodeSha256 --output text) == 'h+RE0xG5iqu2LixLweN0Bno3KZMyehgIo/cAMRXZQvE=' ]] || { echo 'Production drift: recheck compatibility first.'; exit 1; }
python3 - "$PACKAGE_DIR" <<'PY'
import hashlib,json,pathlib,sys
p=pathlib.Path(sys.argv[1]);m=json.loads((p/'manifest.json').read_text())
for package in m['packages'].values():
 assert hashlib.sha256((p/package['file']).read_bytes()).hexdigest()==package['sha256']
assert hashlib.sha256((p/'template.json').read_bytes()).hexdigest()==m['templateSha256']
PY
RELEASE=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["packages"]["operations"]["sha256"][:16])' "$PACKAGE_DIR/manifest.json")
PREFIX="$STACK/$RELEASE"
aws s3 cp "$PACKAGE_DIR/documents.zip" "s3://$ARTIFACT_BUCKET/$PREFIX/documents.zip" --sse AES256 --only-show-errors --region "$REGION"
aws s3 cp "$PACKAGE_DIR/operations.zip" "s3://$ARTIFACT_BUCKET/$PREFIX/operations.zip" --sse AES256 --only-show-errors --region "$REGION"
PARAMETERS=$(mktemp)
trap 'rm -f "$PARAMETERS"' EXIT
python3 - "$PARAMETERS" "$ARTIFACT_BUCKET" "$PREFIX" "$OPERATORS" <<'PYTHON'
import json,sys
file,bucket,prefix,operators=sys.argv[1:]
values={'ArtifactBucket':bucket,'DocumentsPackageKey':prefix+'/documents.zip','OperationsPackageKey':prefix+'/operations.zip','EnableEmail':'false','OperatorSubs':operators}
open(file,'w').write(json.dumps([{'ParameterKey':key,'ParameterValue':value} for key,value in values.items()]))
PYTHON
aws cloudformation create-change-set --stack-name "$STACK" --change-set-name "review-$RELEASE" --change-set-type CREATE \
  --template-body "file://$PACKAGE_DIR/template.json" --capabilities CAPABILITY_IAM --region "$REGION" \
  --parameters "file://$PARAMETERS"
aws cloudformation wait change-set-create-complete --stack-name "$STACK" --change-set-name "review-$RELEASE" --region "$REGION"
aws cloudformation describe-change-set --stack-name "$STACK" --change-set-name "review-$RELEASE" --region "$REGION" --query 'Changes[].ResourceChange.{Action:Action,Type:ResourceType,LogicalId:LogicalResourceId,Replacement:Replacement}' --output table
printf 'Unexecuted change set: %s / review-%s\n' "$STACK" "$RELEASE"
echo 'Stop for approval. No stack deployment or email sending has been executed.'
