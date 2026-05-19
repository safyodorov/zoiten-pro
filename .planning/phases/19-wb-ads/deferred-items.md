# Phase 19 — Deferred Items

Issues discovered during plan execution that are out-of-scope for the current plan and need separate work.

## 2026-05-19 (Plan 19-02 execution)

### Vitest 4.1.4 runner broken project-wide (pre-existing)

**Symptom:** All `tests/**/*.test.ts` files fail with:
- `TypeError: Cannot read properties of undefined (reading 'config')` (files without `vi`)
- `Error: Vitest failed to find the runner. ... "vitest" is imported directly without running "vitest" command` (files using `vi.mock` / `vi.hoisted`)

**Verified:** Failure occurs on `git stash` baseline (pre-Plan 19-02 changes) on:
- `tests/pricing-math.test.ts` (no `vi` usage) — fails with TypeError
- `tests/wb-jwt.test.ts`, `tests/wb-token-validate.test.ts`, `tests/wb-tokens-actions.test.ts` — fail with runner-not-found

**Environment:** Node 24.14.0 + Vitest 4.1.4 + Windows.

**Not caused by Plan 19-02.** Plan 19-02 only added new test cases; existing test cases also fail.

**Workaround used in Plan 19-02 verification:** `npx tsc --noEmit` (passes 0 errors) + grep content checks (all match) instead of running tests. Test code itself is correct (Vitest API usage matches existing patterns).

**Suggested follow-up:** Downgrade Vitest to 3.2.x or upgrade Node, or migrate test setup. Possible candidates:
- `vitest@^3.2.0` last known compatible with current test files
- `@vitest/runner@4.x` might need explicit install
- Investigate `vi.hoisted` change in Vitest 4 changelog

Until resolved, all vitest-based testing in this project relies on `tsc --noEmit` + manual grep checks.

**Update (2026-05-19, post Plan 19-02 attempt 2):** Workaround discovered — `npx vitest run --pool=vmThreads` works correctly with default `--pool=forks` is broken. Recommended action: add `pool: "vmThreads"` to `vitest.config.ts > test` block. Out of scope for Plan 19-02 (would touch infra config), can be quick task.

With `--pool=vmThreads`:
- Baseline (pre Plan 19-02): 2 failed | 17 passed across the 3 test files
- After Plan 19-02: 2 failed | 22 passed (5 new Phase 19 tests added — all pass)
- Same 2 pre-existing failures: `wb-token-validate Test 5 (AbortController timeout)` and `wb-tokens-actions Test 3 (auth mock)` — both unrelated to Plan 19-02 (auth() mock returns undefined under vmThreads, and DOMException's name doesn't trip `e.name === "AbortError"` branch).
