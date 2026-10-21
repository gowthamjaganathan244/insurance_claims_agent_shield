# Phase 1 — two-user isolation verification

Status on 21 October 2026: pending. Do not declare multi-user isolation passed.
The user has confirmed single-account live IDs/fields, absence of unowned records,
and refresh/pagination where available.

The user subsequently confirmed that only one account is available. Live two-user
checks are blocked on a second administrator-provided test account and an owned
test claim. No account creation or AWS configuration change is authorized by this
verification step. Do not substitute two sessions of the same account: they have
the same Cognito subject and cannot prove cross-owner isolation.

## Next check: read-only application isolation

Use two existing Cognito test accounts, A and B, in separate browser profiles
or different browsers. Two tabs in the same profile share the session and do
not test isolation. Each account needs an existing owned claim. Keep IDs locally;
do not put passwords, session cookies, tokens or private claim data in reports.

1. As A, open Claims and its owned claim. Confirm it loads. Record its URL locally.
2. As B, confirm B's owned claim loads and record its URL locally.
3. As B, check all available Claims pages: A's claim must be absent. Open A's
   saved URL directly. No A claim fields may appear. In browser Network, the
   same-origin `/api/claims/<A-id>` response should be 404.
4. Reverse the check: as A, B's claim must be absent from all list pages and its
   direct API detail read must return 404, without revealing B's fields.
5. Refresh each denied detail view and use browser Back/Forward. Foreign fields
   must stay absent. Confirm each account still opens its own claim afterwards.

The page shell itself can return 200: authoritative detail data is loaded by the
JSON endpoint. Judge the `/api/claims/<id>` response and rendered fields, not the
HTML page's status. Record account labels A/B, result and status only.

## Distinguish application isolation from backend isolation

The Next BFF defensively filters owners and rejects foreign details. Therefore
passing the browser checks alone cannot prove API Gateway/Lambda never returned
foreign records. Direct authenticated upstream tests are a separate required
gate, using a secure test runner that keeps credentials/tokens out of logs and
browser storage. No such live two-account run has occurred yet.

That run must verify both directions for paginated list, direct GET, foreign-owner
cursor rejection, PATCH and DELETE, plus attempted ownership reassignment. Verify
the real Lambda denies access before BFF filtering. A foreign cursor should return
400 and a foreign claim read/write should return 404 under the inspected source.
Check each owner's record is unchanged after denied writes.

## Mutation-test prerequisites

Do not use real customer claims. Before PATCH/DELETE isolation attempts, designate
disposable SUBMITTED test records and confirm they may be edited/cancelled if an
authorization defect allows a request through. DELETE means retained cancellation,
not physical deletion, and cancellation cannot be reversed through this API.
Do not create test claims automatically: POST can send a real SES email and needs
explicit approval of the recipient/email side effect first.

If a second account or suitable records are missing, report that prerequisite;
do not create accounts, assign owners to historical records, change permissions,
modify AWS infrastructure or substitute simulated accounts for the live result.

## Result ledger

| Check | Result |
| --- | --- |
| Single-account IDs/fields match DynamoDB | User-confirmed |
| Unowned records absent | User-confirmed for tested account |
| Refresh/pagination | User-confirmed where available |
| A cannot list/read B; B cannot list/read A | Pending |
| Direct upstream list/read/cursor isolation | Pending |
| Cross-owner writes denied; records unchanged | Pending |
| Full Phase 1 ownership acceptance | Pending |
