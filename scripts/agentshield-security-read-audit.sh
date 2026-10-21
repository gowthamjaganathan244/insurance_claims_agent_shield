#!/usr/bin/env bash
# Run in AWS CloudShell. Configuration reads only; no writes to AWS.
# Does not retrieve credentials, Lambda environment variables, code URLs,
# claim/document items, or S3 objects. Do not run with shell tracing enabled.
set -euo pipefail
command -v aws >/dev/null
command -v python3 >/dev/null
export AWS_PAGER=""
python3 - <<'PY'
import json
import os
import subprocess
import tempfile
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

REGION = "ap-southeast-2"
output = Path.cwd() / "agentshield-security-read-audit.zip"
if output.exists():
    raise SystemExit("Output already exists; rename it before running again.")

with tempfile.TemporaryDirectory(prefix="agentshield-read-audit-") as temp:
    directory = Path(temp)
    failures = []

    def read(name, *arguments):
        result = subprocess.run(
            ["aws", *arguments, "--region", REGION, "--output", "json"],
            capture_output=True, text=True,
            env={**os.environ, "AWS_PAGER": ""},
        )
        if result.returncode:
            # Record only the operation, not arbitrary diagnostic output.
            failures.append({"file": name, "operation": list(arguments[:2]),
                             "result": "Read failed or permission unavailable"})
            return None
        try:
            data = json.loads(result.stdout)
        except ValueError:
            failures.append({"file": name, "result": "Invalid JSON response"})
            return None
        (directory / name).write_text(json.dumps(data, indent=2) + "\n")
        return data

    for table in ("agentshield-claims", "agentshield-documents"):
        read(table + ".json", "dynamodb", "describe-table", "--table-name", table,
             "--query", "Table.{TableName:TableName,TableArn:TableArn,TableStatus:TableStatus,KeySchema:KeySchema,AttributeDefinitions:AttributeDefinitions,BillingModeSummary:BillingModeSummary,GlobalSecondaryIndexes:GlobalSecondaryIndexes[].{IndexName:IndexName,IndexArn:IndexArn,IndexStatus:IndexStatus,KeySchema:KeySchema,Projection:Projection}}")

    read("api-routes.json", "apigatewayv2", "get-routes", "--api-id", "b30dloh6e4")
    read("api-authorizers.json", "apigatewayv2", "get-authorizers", "--api-id", "b30dloh6e4")
    read("api-integrations.json", "apigatewayv2", "get-integrations", "--api-id", "b30dloh6e4",
         "--query", "Items[].{IntegrationId:IntegrationId,IntegrationType:IntegrationType,IntegrationUri:IntegrationUri,PayloadFormatVersion:PayloadFormatVersion}")
    read("api-stages.json", "apigatewayv2", "get-stages", "--api-id", "b30dloh6e4",
         "--query", "Items[].{StageName:StageName,AutoDeploy:AutoDeploy,DeploymentId:DeploymentId}")

    function = read("claims-lambda.json", "lambda", "get-function-configuration",
                    "--function-name", "agentshield-claims-api", "--query",
                    "{FunctionName:FunctionName,Role:Role,Runtime:Runtime,Handler:Handler,CodeSha256:CodeSha256,LastModified:LastModified,State:State}")
    read("claims-invocation-policy.json", "lambda", "get-policy", "--function-name", "agentshield-claims-api")

    if function and function.get("Role"):
        role = function["Role"].rsplit("/", 1)[-1]
        read("claims-role.json", "iam", "get-role", "--role-name", role,
             "--query", "Role.{Arn:Arn,PermissionsBoundary:PermissionsBoundary}")
        inline = read("inline-policy-names.json", "iam", "list-role-policies", "--role-name", role)
        for index, name in enumerate((inline or {}).get("PolicyNames", [])):
            read(f"inline-policy-{index}.json", "iam", "get-role-policy", "--role-name", role, "--policy-name", name)
        attached = read("attached-policies.json", "iam", "list-attached-role-policies", "--role-name", role)
        for index, policy in enumerate((attached or {}).get("AttachedPolicies", [])):
            arn = policy["PolicyArn"]
            metadata = read(f"managed-policy-{index}.json", "iam", "get-policy", "--policy-arn", arn)
            version = (metadata or {}).get("Policy", {}).get("DefaultVersionId")
            if version:
                read(f"managed-policy-version-{index}.json", "iam", "get-policy-version",
                     "--policy-arn", arn, "--version-id", version)

    (directory / "read-failures.json").write_text(json.dumps(failures, indent=2) + "\n")
    with ZipFile(output, "x", compression=ZIP_DEFLATED) as archive:
        for file in sorted(directory.iterdir()):
            archive.write(file, file.name)

print(f"Created {output.name}; {len(failures)} configuration reads unavailable.")
print("No AWS resources or records were changed. Review the ZIP before sharing.")
PY
