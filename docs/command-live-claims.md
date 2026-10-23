# Command — live paginated claims

22 October 2026. Command reuses the existing authenticated `/api/claims` BFF and Cognito session. `lib/command-snapshot.ts` reads at most 10 pages with a 30-second overall deadline, follows opaque nextToken cursors, deduplicates claim IDs and rejects repeated cursors or conflicting copies. Any failed page clears the counts; it never falls back to fixtures or labels a failed request as zero.

The hero/status cards show the number of distinct records read and exact persisted status counts. Completed pagination is labelled as all pages returned for this signed-in user; reaching the bound is labelled partial. Neither is an AWS account-wide count or a transactional snapshot. Recent claims retain first-page order and show actual IDs, policy numbers, types, statuses and creation dates. Activity uses only stored creation/cancellation timestamps. Unsupported workflow aggregate stages/risk scores remain unavailable.

Manual refresh, last-successful-read time, loading/empty/error states and visibility-aware 60-second polling reuse the shared claims hook. Polling backs off after errors. Mutations request a new read. No separate AWS client, authentication flow, account-wide scan or generated incident feed was added.

The user previously confirmed Command Recent claims IDs matched the first Claims page and that Claims IDs/fields matched DynamoDB. This is historical user-reported live evidence; expanded pagination/status counts require a new signed-in check. Automated pagination, first-page parity, deduplication, cursor bound/error, refresh and accessibility tests use isolated providers, not AWS. Two-user live isolation remains unverified until a second account is available.

See `docs/task11-functional-implementation.md` for current modules and `backend/staging/README.md` for the unexecuted staging candidate.
