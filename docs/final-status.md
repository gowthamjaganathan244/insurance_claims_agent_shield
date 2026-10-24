# Final status and evidence (2026-10-24)

Evidence comes from the read-only AWS collection run in CloudShell on 2026-10-24
(`outputs/agentshield-aws-info.zip`, describe/get/list only) and from automated
tests. Nothing below is estimated or simulated unless marked.

## Use case 1 — Malware protection (Task 8)

- GuardDuty Malware Protection plan `e2d0ac750506ec5f1534` is ACTIVE on
  `agentshield-claim-documents-gj2026`; EventBridge notifications are on for the bucket.
- The processor source is in `backend/malware-processor/`; it is byte-identical to
  the deployed package (SHA-256 `R+RkRivq…FXfvE=` matches Lambda CodeSha256).
- Recorded document states (DynamoDB, counts only): 3 × `SCAN_CLEAN`/`NO_THREATS_FOUND`,
  2 × `SOURCE_ISOLATED`/`THREATS_FOUND` (EICAR tests), 1 × `QUARANTINE_COPIED`,
  1 × `PENDING_SCAN`. This is the earlier live end-to-end run.
- Review: events are accepted only from `aws.guardduty` for this account, region and
  plan; the S3 version, ETag, owner/claim metadata and the GuardDuty tag on the exact
  version must all agree. Every state change is a DynamoDB conditional update, so
  duplicate deliveries are ignored (idempotent). A tag not yet visible raises, so
  EventBridge retries. Threats are server-side copied (pinned version + ETag) to the
  private quarantine bucket as `application/octet-stream`. Source deletion is limited
  by IAM to two named EICAR test objects; production threats keep the original and stay
  out of `SCAN_CLEAN`.
- Tests: `backend/malware-processor/tests` (moto) — clean, duplicate, threat →
  quarantine, forged/mismatched events, tag disagreement → retry, early scan, unsupported.
- The rule `AgentShieldGuardDutyScanResults` is DISABLED. `outputs/agentshield-finish.zip`
  enables it after approval. The 1 recorded processor error (2026-10-19, 18 invocations)
  matches the designed "tag not yet available" retry path.

## Use case 2 — Email templates (Task 9)

- SES template `AgentShieldClaimCreated` exists; SES is in the sandbox (200/24h,
  only verified addresses receive mail), so tests cannot reach real customers.
- Template versioning is deployed and verified live: v1 imported from SES, v2 drafted
  and approved (self-approval, labelled), with the audit history shown in the UI.
- Approval is recorded only; the live SES template is never modified by the app.
- **Out of demo scope (explicit):** sending operator emails and delivery tracking.
  Staging runs with `EnableEmail=false` and SES is in the sandbox, so the UI hides
  the send form and never shows a delivery status it cannot prove. Claim-created
  confirmation emails (production Claims API) are sent to verified addresses only.

## Use case 3 — API performance investigation (Task 10, real data)

Claims API `b30dloh6e4`, last 24 h (hourly, only hours with traffic shown by AWS):
72 requests, 0 × 5xx, 3 × 4xx (one hour), average latency 167–351 ms.
Claims Lambda, 7 days: 183 invocations, 0 errors, 0 throttles.

| Day (UTC) | Invocations | p95 duration |
| --------- | ----------- | ------------ |
| 10-17     | 3           | 302 ms       |
| 10-18     | 5           | 341 ms       |
| 10-19     | 26          | **1,517 ms** |
| 10-20     | 22          | **1,688 ms** |
| 10-21     | 58          | 332 ms       |
| 10-22     | 69          | 329 ms       |

Finding: p95 was ~5× higher on 10-19/10-20 while errors stayed at 0, then returned
to ~330 ms despite 3× more traffic. Hypothesis (not proven from metrics alone): those
days were dominated by claim creation, which synchronously calls Cognito
`AdminGetUser` and SES `SendEmail`, plus cold starts at 128 MB. Next check: Logs
Insights on `/aws/lambda/agentshield-claims-api` grouping `@duration` by route.
The latency alarm stayed OK. No incident was manufactured.

## Use case 4 — Security incident investigation

- GuardDuty: no findings in the last 30 days. The only "incidents" are the deliberate
  EICAR tests above, which ended `SOURCE_ISOLATED` with a verified quarantine copy.
- Findings from the IAM/S3/API review:

| Severity                 | Finding                                                                                                                                          | Recommendation                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| **High (other project)** | `securevault-api` (`0oatkqbq9l`) routes `GET /files`, `GET /download-url`, `GET /audit-logs`, `POST /generate-upload-url` have **no authorizer** | Delete the SecureVault API if unused, or add a JWT authorizer. Not part of AgentShield; not changed. |
| Low                      | Claims Lambda role allows `dynamodb:Scan` it never uses; SES permission duplicated in two policies                                               | Remove on next production redeploy                                                                   |
| Low                      | Cognito MFA OFF                                                                                                                                  | Optional for a portfolio demo                                                                        |
| Low                      | Log groups for claims and malware Lambdas never expire                                                                                           | Set 30-day retention (bytes stored are tiny)                                                         |
| Info                     | Malware role keeps two test-only, object-scoped delete policies                                                                                  | Harmless; remove after demos                                                                         |
| OK                       | All 5 buckets: public access fully blocked, SSE enabled; documents and quarantine versioned                                                      | —                                                                                                    |
| OK                       | Every AgentShield route uses the Cognito JWT authorizer                                                                                          | —                                                                                                    |
| OK                       | No provisioned concurrency (no always-on cost)                                                                                                   | —                                                                                                    |

## Use case 5 — Release reliability (Tasks 11–12)

- Three staging releases deployed through reviewed change sets with prepared rollbacks;
  stack `agentshield-task11-stage` is `UPDATE_COMPLETE`. Staging throttles at 1 rps,
  burst 3.
- CI runs on every push: lint, typecheck, build, 4 browsers, workflow, remote
  monitoring and Redis-session suites, Lambda unit tests, moto integration and malware
  tests, template reproducibility and cfn-lint.
- Alarms `AgentShield-API-Errors`, `-Lambda-Errors`, `-Lambda-Latency`: all OK.

## Cost

- Existing budget `SecureVault-Monthly-Budget`: US$10/month (covers the account).
- No provisioned concurrency, on-demand DynamoDB, ~150 KB of logs. Expected
  AgentShield cost at demo traffic: ~US$0–2/month. Hosting: Vercel Hobby + Upstash
  free tier, $0 (see `docs/hosting.md`).
- The cost-by-service query in the collector failed (`--query` type error); check
  Billing → Cost Explorer for actual spend. Also check SageMaker → Notebooks: a log
  group exists, and a running notebook instance bills hourly.

## 12-task tracker

| #   | Task                     | Status                                                     |
| --- | ------------------------ | ---------------------------------------------------------- |
| 1   | DynamoDB claims          | Complete                                                   |
| 2   | Secure S3 storage        | Complete (public access blocked, SSE, versioning)          |
| 3   | Lambda backend           | Complete                                                   |
| 4   | API Gateway + JWT        | Complete (every AgentShield route uses the JWT authorizer) |
| 5   | Two-user isolation       | Tests pass; live test with a second user pending           |
| 6   | Secure uploads           | Earlier live test passed                                   |
| 7   | Claims UI integration    | Complete                                                   |
| 8   | Malware scanning         | Rule enabled; fresh live scan pending                      |
| 9   | SES communications       | Versioning live; sending/delivery out of demo scope        |
| 10  | CloudWatch monitoring    | Live; hosted-site check pending                            |
| 11  | Authentication + hosting | Local works; Vercel deployment pending                     |
| 12  | Cost and cleanup         | Budget exists; final review pending                        |

## Acceptance matrix

| Area                          | Result                      | Evidence                                             |
| ----------------------------- | --------------------------- | ---------------------------------------------------- |
| Authentication, CSRF, headers | PASS                        | Browser + API contract suites; live sign-in          |
| Claims list/edit/cancel       | PASS                        | Live (10 claims); suites                             |
| Claim create                  | PASS (tests) / live pending | SES sandbox sends only to your verified address      |
| Owner isolation               | PASS (tests) / live BLOCKED | Needs a second Cognito user                          |
| Documents + malware scan      | PASS (earlier live)         | DynamoDB states above; rule now disabled             |
| Operations workflows          | PASS (tests)                | moto + browser suites                                |
| Template versioning           | PASS (live)                 | v1 imported, v2 approved, audit history              |
| Reliability/monitoring        | PASS                        | Live alarms and metrics                              |
| UI layout/a11y                | PASS                        | 256 browser runs, axe, 320–1920 px                   |
| CI                            | PASS                        | GitHub Actions                                       |
| HTTPS hosting                 | READY                       | `docs/hosting.md` + `outputs/agentshield-finish.zip` |
