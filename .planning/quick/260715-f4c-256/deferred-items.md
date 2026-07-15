# Deferred items — quick 260715-f4c

Обнаружено при финальном гейте (`npm run test`) — 44 упавших теста в 12 файлах,
НЕ связанных с текущей задачей (общие расходы одежды `/finance/weekly`).
Ни один из затронутых задачей файлов (`lib/finance-weekly/*`, `app/actions/finance-weekly.ts`,
`components/finance/WeeklyFinReportControls.tsx`, `app/(dashboard)/finance/weekly/page.tsx`,
`CLAUDE.md`) не упоминается в этих тестах и не был изменён ради них. Согласно
SCOPE BOUNDARY — НЕ исправлялись, только логируются.

Скоуп-гейт задачи (CLAUDE.md «Фин. отчёт за неделю»: `tsc` + `vitest` finance-weekly-* +
pricing-math) — **зелёный** (см. SUMMARY.md). Полный `npm run test` — 1145/1189 passed,
44 failed (все вне скоупа, см. ниже).

## 1. `tests/appeal-actions.test.ts` (12 тестов) + аналогичные customer-actions.test.ts,
customer-sync-chat.test.ts, merge-customers.test.ts, messenger-ticket.test.ts,
response-templates.test.ts, support-sync-chats.test.ts, support-sync-returns.test.ts,
template-picker.test.ts (≈30 тестов)

**Причина:** `Error: Cannot find module '@/lib/auth'` — `require("@/lib/auth")` (CommonJS,
для переустановки mock после `resetAllMocks`) не резолвится текущей связкой
vitest/esbuild в этом окружении (path-alias `@/` работает для ESM `import`, но не для
`require()` внутри теста). Похоже на дрейф версии vitest/зависимостей, не относится к
finance-weekly.

## 2. `tests/wb-sync-route.test.ts` (3 теста), `tests/wb-token-validate.test.ts` (1 тест)

**Причина:** несовпадение ожидаемых HTTP-статусов (200 vs 500) и текста ошибки timeout —
поведение `/api/wb-sync` route и `validateWbToken`, не относящееся к текущей задаче.

## 3. `tests/wb-cooldown.test.ts` (2 теста)

**Причина:** тест ожидает ровно 11 bucket-слагов, но `WB_COOLDOWN_BUCKETS` уже содержит 12-й
(`finance-reports`, добавлен в более раннем изменении — cooldown для WB Finance API отчётов
реализации, см. CLAUDE.md «Отчёт реализации WB»). Тест не обновлён вместе с реализацией —
существовавший до этой задачи дрейф.

Рекомендация: отдельный quick-таск на актуализацию упомянутых тестов (не блокирует текущую задачу).
