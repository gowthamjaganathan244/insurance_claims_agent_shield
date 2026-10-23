# Release and rollback — Task 12

Run AWS commands in CloudShell (`ap-southeast-2`, account `465078122271`).

## What is deployed

| Component | Where | Rollback |
|---|---|---|
| Next.js app | Local only (`npm run dev`) | `git checkout <previous commit>`; restart |
| Staging stack `agentshield-task11-stage` (documents + operations API `gmibi61uz7`) | CloudFormation | `aws cloudformation delete-stack --stack-name agentshield-task11-stage` (operations table is `Retain`, so records survive) |
| Monitoring endpoint (pending approval) | Update to the same stack | `aws cloudformation cancel-update-stack` during update; afterwards re-run an UPDATE change set with `outputs/task11-stage-20261022/template.json` (Stage points back to `DeploymentInitial`) |
| Production claims API, Cognito, tables, buckets, GuardDuty | Unchanged by this release | n/a |

## App configuration rollback

Remove or blank in `.env.local`, then restart:

- `MONITORING_API_ORIGIN` → Reliability falls back to local-credential mode (shows "Health unavailable" without credentials).
- `OPERATIONS_API_ORIGIN` / `DOCUMENTS_READ_API_ORIGIN` → those screens show "not configured".

## Verification after any change

1. `npm run lint && npm run typecheck && npm run build`
2. `npx playwright test` (default), then with `AGENTSHIELD_TEST_OPERATIONS=true` and `AGENTSHIELD_TEST_REMOTE_MONITORING=true` (run each mode separately).
3. Backend: `python -m unittest discover -s tests` in each `backend/*-api` directory (needs boto3).
4. Signed in as the operator: Overview, Security, Communications, Reliability and one claim's six tabs load without errors.

## Not yet tested live

A rollback has not been exercised against AWS. Test it on the staging stack (delete and recreate) before relying on it for a production release.
