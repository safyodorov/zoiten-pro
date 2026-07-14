# Deferred items — quick-260714-gff

Обнаружено во время `npx vitest run` (полный прогон, вне scope плана —
не относится к finance-weekly / jem-option, не трогается):

- `tests/wb-sync-route.test.ts` — 3 упавших теста (Сц.7, Сц.9, connection reset)
  подтверждены как ПРЕДСУЩЕСТВУЮЩИЕ (воспроизводятся на `git stash` без правок
  этого плана).
- `tests/wb-token-validate.test.ts` — Test 5 (probe timeout message mismatch),
  предположительно предсуществующий (не проверялся отдельно git stash, но не
  затронут файлами этого плана).
- Ещё ~9 тест-файлов с падениями по `npx vitest run` (полный прогон) — вне
  scope (не в files_modified плана, не relate к finance-weekly).

Целевой прогон плана (`npx vitest run tests/finance-weekly-engine.test.ts
tests/finance-weekly-jem-option.test.ts tests/finance-weekly-snapshot.test.ts`)
зелёный: 43/43. `npx tsc --noEmit` чист.
