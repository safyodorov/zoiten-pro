# Deferred Items — Phase 24 (finance-balance)

## 24-06: Pre-existing test failures (out of scope)

`npm run test` shows 44 failing tests across 12 files, verified via `git stash`
to be present BEFORE plan 24-06 changes (unrelated to lib/finance-snapshot.ts,
app/api/cron/finance-snapshot/route.ts, app/api/cron/dispatch/route.ts):

- `tests/template-picker.test.ts`
- `tests/appeal-actions.test.ts`
- `tests/customer-actions.test.ts`
- `tests/customer-sync-chat.test.ts`
- `tests/merge-customers.test.ts`
- `tests/messenger-ticket.test.ts`
- `tests/response-templates.test.ts`
- `tests/support-sync-chats.test.ts`
- `tests/support-sync-returns.test.ts`
- `tests/wb-cooldown.test.ts` — bucket count assertion (10 vs actual, likely
  stale after Phase 24's `finance` bucket addition in 24-03)
- `tests/wb-sync-route.test.ts` — 3 scenarios, status code mismatches
- `tests/wb-token-cache.test.ts` — `WB_TOKEN_NAMES` exact-array assertion stale
  after `WB_FINANCE_TOKEN` was added in 24-03 (test not updated in that plan)

None touch `finance-snapshot`, `wb-finance-api`, or `dispatch` — support-ticket
module failures are unrelated entirely; `wb-cooldown`/`wb-token-cache` failures
are follow-on from 24-03 (not this plan) and should be fixed when that area is
next touched, not fixed here (scope boundary — 24-06 verify only requires
`tests/finance-snapshot.test.ts` green, which it is).
