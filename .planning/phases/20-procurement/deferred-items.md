# Deferred Items — Phase 20 Procurement

Out-of-scope discoveries during execution. Logged, NOT fixed (per executor SCOPE BOUNDARY).

## Pre-existing failing test suites (discovered during 20-00 full-suite run, 2026-06-09)

The Wave 0 full-suite run (`npx vitest run`) showed 14 failed suites. Exactly 3 of these are the
intentional RED stubs created by plan 20-00 (procurement-math, cbr-rates, supplier-actions).

The remaining **11 suites were already failing before Phase 20** and are unrelated to procurement
(support / customer / stock / wb-sync modules). They are NOT caused by 20-00's changes (which only
added 3 new test files — verified via `git show --stat`). Deferred for a separate maintenance task.

Pre-existing failing suites:
- tests/appeal-actions.test.ts
- tests/customer-actions.test.ts
- tests/customer-sync-chat.test.ts
- tests/merge-customers.test.ts
- tests/messenger-ticket.test.ts
- tests/response-templates.test.ts
- tests/stock-actions.test.ts
- tests/support-sync-chats.test.ts
- tests/support-sync-returns.test.ts
- tests/template-picker.test.ts
- tests/wb-sync-route.test.ts

These likely share a common root cause (e.g. a prisma-mock or vi.mock hoisting drift introduced by
an earlier change). Investigate separately — out of scope for Phase 20 procurement.
