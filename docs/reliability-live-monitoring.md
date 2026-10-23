# Reliability monitoring integration

Implemented locally; live AWS acceptance is pending server credentials and an explicitly authorised Cognito subject. The user's CloudShell alarm output established the names and dimensions, not a live application result. Nothing was deployed and no AWS permissions or alarms were changed.

## Boundary and configuration

`GET /api/monitoring` verifies the existing server session, then requires its verified Cognito `sub` in the comma-separated server environment variable `MONITORING_ALLOWED_SUBS`. Missing allowlist denies everyone. Ordinary Cognito accounts do not automatically receive account-wide infrastructure visibility. Authorization runs before every cache read. Browser responses are private/no-store and contain no AWS credentials or raw diagnostic messages.

Set in ignored `.env.local`, using the approved operator's actual sub:

```dotenv
MONITORING_ALLOWED_SUBS=<approved-cognito-sub>
AWS_PROFILE=<existing-temporary-role-or-sso-profile>
```

Authenticate that existing temporary profile through its normal SSO/role process and restart `npm run dev`. The SDK default server credential chain is used; no keys are configured in application source or public environment variables. Long-lived IAM credentials without a session token are rejected. Renew expired temporary credentials through the same provider. Do not paste credentials into chat. Cognito credentials alone do not authorize CloudWatch SDK calls.

## IAM proposal — not applied

See `monitoring-read-policy.json`. Only `cloudwatch:DescribeAlarms` for the three specific alarm ARNs and `cloudwatch:GetMetricData` are required. Classic CloudWatch metric reads require `Resource: "*"`; the policy limits region, while application queries fix metric namespaces/dimensions. This IAM role can still read other classic metrics in that region, so grant it only to the trusted server. No browser-controlled metric queries are accepted. Any new role, trust-policy change or permission attachment requires user approval first.

No new infrastructure is needed. CloudWatch API/metric retrieval may incur charges under the account's pricing. Each cache refresh makes one DescribeAlarms call and one GetMetricData call containing nine queries, with at most two attempts per SDK call. A process shares results for 60 seconds and failures for 10 seconds; concurrent requests share one in-flight fetch. Multiple server processes have independent caches. Browser polling runs at 60-second intervals while visible, with a manual refresh sharing the server cache. Hidden tabs stop polling. No background collector runs without requests.

## Measurements and UI

Queries use the preceding complete hour, aligned to 300-second boundaries:
- AWS/ApiGateway, ApiId `b30dloh6e4`, Stage `$default`: Count Sum, 5xx Sum, Latency Average.
- AWS/Lambda, FunctionName `agentshield-claims-api` and `agentshield-malware-processor`: Invocations Sum, Errors Sum, Duration Average.

API error percentages use only matching observed request/error periods with a positive request count. Missing points never become zero. Cards show the latest observed five-minute period and its timestamp, not an hourly total. Latency samples are averages; no uptime or percentile is invented. Partial responses are marked unavailable rather than presented as complete. Nine queries over twelve periods fit within the 1000-point request bound; unexpected pagination marks metrics incomplete.

Each named alarm shows its returned OK, ALARM or INSUFFICIENT_DATA state. An omitted alarm is UNAVAILABLE. Navbar prioritizes observed triggered alarms, then insufficient-data alarms. All-OK wording additionally requires complete observed metrics; missing measurements leave health unavailable. Alarm state-update time is distinct from retrieval time. Safe errors distinguish missing/expired credentials, access denied, and other upstream failures. The shared provider supplies both Reliability and Dynamic Island.

## Validation and live acceptance

Automated tests use test-only fake temporary credentials, Cognito transport and CloudWatch transport in a separate production test process. No production authentication bypass exists. These do not prove real IAM or AWS success.

For live acceptance:
1. Configure an approved sub and existing read-only temporary AWS profile; restart the local server.
2. Sign in as that user; load Reliability. In browser Network, confirm `/api/monitoring` returns 200, three actual alarm states, current retrieval time and genuine metric samples where available.
3. Compare the named states and five-minute samples with CloudWatch using the same region, dimensions and time window. Confirm the navbar matches the response; idle functions may correctly have no measurements.
4. Refresh; cache may retain retrieval time for up to 60 seconds. Hide/show the tab and check refresh resumes.
5. An ordinary signed-in user must receive 403; anonymous requests must receive 401. Check expired AWS credentials and denied IAM permissions produce safe errors and Health unavailable, without exposing upstream details.

Live completion must be recorded separately after these checks. No live result is asserted here. To roll back local monitoring, remove its environment allowlist to deny access immediately, then revert the monitoring files/layout wiring. No AWS resource rollback is necessary because none were changed. Any later approved IAM attachment should be removed separately if rolled back.

## Changed implementation files

- `lib/monitoring/server.ts`, `lib/monitoring/types.ts`: fixed CloudWatch reads, authorization, projections and cache.
- `app/api/monitoring/route.ts`: authenticated read endpoint.
- `components/monitoring-provider.tsx`, `components/reliability-monitoring.tsx`: shared polling and evidence display.
- `app/(protected)/layout.tsx`, `app/(protected)/reliability/page.tsx`, `components/dynamic-island.tsx`: integration into the existing shell.
- `.env.example`, `README.md`, this document and `docs/monitoring-read-policy.json`: setup and proposed permissions.
- `package.json`, `package-lock.json`: AWS SDK CloudWatch dependency.
- `tests/monitoring.spec.ts`, `tests/mock-monitoring.mjs`, `tests/mock-register.mjs`, `tests/start-server.mjs`: isolated mock transport, explicit test operators, endpoint and browser checks.

The pre-existing change to `docs/command-live-claims.md` is preserved and is unrelated to this implementation.

## Local verification result — 22 October 2026

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; `/api/monitoring` is a dynamic server route.
- `npm run test:e2e`: final run **164 passed**, Chromium, Firefox, WebKit and mobile; includes 28 monitoring checks. AWS and Cognito are mocked for this suite.
- `git diff --check`: passed. Checked public build chunks for test credential markers and the server allowlist variable; none found.
- Live AWS: **not verified**. Local environment has no AWS profile, temporary credential environment or monitoring allowlist configured. A real authenticated CloudWatch response remains the acceptance gate.

Initial test runs exposed unnecessary denied requests and a test locator ambiguity; these were corrected. A subsequent test-fixture collision hit the existing per-user login limit; separate allowlisted test identities per browser resolved it without weakening authentication.
