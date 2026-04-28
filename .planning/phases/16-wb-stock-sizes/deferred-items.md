# Phase 16 Deferred Items

Out-of-scope discoveries during plan execution. Pre-existing issues, not caused by Phase 16 changes.

## Pre-existing test failures (not caused by Phase 16-02)

Discovered during Plan 16-02 broader regression test run.

**Verified:** all 41 failures present BEFORE my Phase 16 changes (via `git stash` test).

### Failing test files

- `tests/template-picker.test.ts` (1 file failure)
- `tests/appeal-actions.test.ts` (12 tests)
- `tests/customer-actions.test.ts` (9 tests)
- Other support/customer/appeal-related tests

### Scope boundary rationale

Per execution rules: «Only auto-fix issues DIRECTLY caused by the current task's
changes. Pre-existing warnings, linting errors, or failures in unrelated files
are out of scope.»

These failures are in Phase 11-13 (templates/appeals/customers) — unrelated to
Phase 16 (WB stock sizes).

### Recommendation

Investigate and fix in a separate quick task, NOT in Phase 16.
