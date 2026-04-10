# Phase 07 — Deferred Items

Items discovered during plan execution that are out-of-scope for the current plan.

## From 07-03 execution (2026-04-10)

- **Pre-existing TS error:** `tests/pricing-settings.test.ts(2,61)` — `Cannot find module '@/app/actions/pricing'`. Module `app/actions/pricing.ts` будет создан в плане 07-04 (API routes для цен/акций). Тест — RED stub от 07-00 Wave 0 Task 2, должен стать GREEN после 07-04.
