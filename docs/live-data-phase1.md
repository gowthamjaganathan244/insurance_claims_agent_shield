# Truthful live screens — first phase

21 October 2026 (Australia/Sydney). This phase removes fictional operational
information; it does not claim the remaining AWS integrations are connected.

## Audit inventory and disposition

| Location | Fictional content removed from the live rendering path |
| --- | --- |
| Command page | 4,218 claims; 37 attention; 388/1,204/842/1,096/512/176 pipeline counts; 41 held; 23 retrying; Healthy labels and activity animation; CLM-48213/Marlow narrative |
| Command analysis / shared demo provider | Fixture risk/confidence/correlated-event formulas; simulated approvals/escalations; locally generated Assessor audit timestamps; payment promises and holds |
| Operational storyline | Eight fixture timestamps/events from 09:02–09:31, fictional upload/malware/isolation/payment/correlation/notification/escalation evidence |
| Security | INC-2291, INC-2288, INC-2284, INC-2279; invented severities, relative times, threat descriptions, root causes, evidence, approvals, remediation and investigation timelines |
| Security details | Fictional financial holds; 214 uploads/four minutes; 38-minute receipt failure; 61 delivered messages; prior-claim/sibling counts; fabricated containment/resolution |
| Reliability headlines | 99.97% uptime/99.9% target; 0.31% errors; 82/241/1,420ms percentiles; 1.42s/up 38%; 146 delayed claims; 23 retries; zero lost claims; +11-minute settlement impact |
| Reliability chart | Three seeded 48-sample P50/P95/P99 time series, synthetic half-hour timestamps and interactive sample values |
| Reliability services | Seeded 48-cell health strips, invented service degradation/impact claims and unsupported investigation-agent/notification service health |
| Deployments/alerts | Four fixture versions/deployments and their relative times; four fabricated queue/latency/replication/DLQ alerts including 40-item threshold, 9 claims and 38s lag |
| Communications | Seven fixture SMS/email templates, unsaved local editing, template variables/content, fictional version authors and audit times; generated sent/failed/delivered statistics and 24-hour retry promise |
| Dynamic Island | Hardcoded “2 services degraded”, pulsing health dot implying measured state |

`lib/fixtures.json`, `lib/data.ts` and unmounted legacy components remain in the
repository as reference material, not fallback data. The protected layout no
longer mounts ClaimProvider. No current route imports the demo analysis, storyline,
old claim detail or fixture data. Communications and latency components themselves
were rewritten to remove generated data. Live claims list/detail, Cognito and
claims BFF code were not changed.

## What now appears

- Command retains the hero, pipeline shell and section layout but shows no totals.
  Aggregates and activity are not connected; users can open their live Claims.
- Security retains an expandable two-column card explaining unavailable scan and
  quarantine evidence. It does not claim zero incidents or clean documents.
- Reliability retains metric/card/chart spaces with unavailable measurements,
  alarm health and history. No chart samples or misleading percentile controls.
- Communications retains its tabbed layout, with unavailable content/versions/
  history and a delivery-tracking configuration notice based on the user inventory.
  No editor or sending action implies persistence or operational email/SMS support.
- Navbar retains layout and behavior, using a neutral, non-pulsing indicator and
  “Health unavailable”. It does not imply that missing monitoring data is healthy.

The supplied GuardDuty/EventBridge configuration is explicitly dated evidence,
not a live health check. The SES tracking notice also states that current
configuration has not been refreshed. No fake last-updated timestamp is generated.
“No recorded events” will be used only after a successful authorized empty read.
No unnecessary polling runs for an unconnected source.

## Scope and next integration gates

This completes the requested first phase only. No AWS change or approval request
was necessary for removing misleading UI data. Subsequent phases must establish
their actual sources and access policies before claiming live functionality.

| Next phase | Known source/inventory | Missing prerequisite |
| --- | --- | --- |
| Reliability/navbar | API b30dloh6e4; agentshield-claims-api and agentshield-malware-processor; named API-Errors/Lambda-Errors/Lambda-Latency alarms | Actual alarm definitions/states, metric dimensions/statistics, server credential access and least-privilege policy verification; monitoring visibility authorization |
| Security | Existing documents table/claim index and processor source; disabled custom event rule | Index projection/permissions and deployed owner-authorized document read endpoint; pipeline recovery and second-user verification |
| Communications | User-verified AgentShieldClaimCreated SES template; create handler attempts SES email; no configuration sets in supplied inventory | Read access to actual template/account configuration and any message persistence; no stored delivery feed is established |
| Command | Live, owner-scoped paginated claims API | Accurate bounded aggregate contract; no counting a single page or scanning all tenants |

Before any cloud change, prepare an exact resource/IAM diff, tests and rollback.
Reuse infrastructure; avoid new always-on systems. Scope monitored data to the
intended users rather than exposing account-wide operational information simply
because a user can sign in. Bounded server caching and active-view polling belong
in the connected phase, not a simulated health endpoint.

Current phase adds no AWS API traffic, resources or cost. Later monitoring reads,
data queries, index writes/storage and event delivery have workload-dependent
costs to quantify from verified configuration before approval. Do not enable the
EventBridge rule, send email, deploy, or change permissions during this phase.

## Verification

Lint, typecheck and production build passed. The full Playwright suite passed:
**116 tests in 37.9 seconds**, across Chromium, Firefox, WebKit and mobile. Regression tests now assert that disconnected screens
contain unavailable states instead of the former fictional evidence, and retain
keyboard tab/expand interactions, responsiveness and accessibility checks.

A generated public-JavaScript search found zero occurrences of the checked demo
markers INC-2291, INC-2288, Marlow, 4,218, 99.97%, “2 services degraded”,
“Macro executed on open” and CLAIM_RECEIVED. This is a targeted check, supported
by removal of the live fixture imports, not a claim about every historical file.

No live AWS tests were performed in this phase. Earlier user-confirmed Claims
verification remains recorded separately; two-user ownership testing remains
blocked on a second test account. No credentials, tokens or customer data were
needed. Existing user changes and audit documents are preserved.

Rollback is local: revert the specific cleanup commit if needed. That would
restore demo displays, so it should not be mistaken for restoring live integrations.
There is no AWS rollback because nothing in AWS was modified.
