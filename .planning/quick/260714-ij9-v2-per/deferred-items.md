# Deferred items — quick-260714-ij9

Обнаружено при финальном прогоне `npx vitest run` (полный набор) после Task 3.
Все нижеперечисленные failures — в файлах, НЕ импортирующих ничего из
`credits`/`finance-weekly`/`Loan` (проверено grep'ом), и не были задеты диффами
этой задачи (Task 1-3 трогали только `prisma/schema.prisma`, миграцию,
`lib/finance-weekly/{credit-accrual,data}.ts`, `tests/finance-weekly-credit-accrual.test.ts`,
`components/credits/{LoanModal,CreditsTable}.tsx`, `app/actions/credits.ts`,
`lib/credits-data.ts`). Вне scope этой задачи — не исправлялись (SCOPE BOUNDARY).

## Failing test files (12 файлов, 44 теста) — pre-existing, не связаны с задачей

- `tests/appeal-actions.test.ts` (12 тестов)
- `tests/customer-actions.test.ts` (9 тестов)
- `tests/customer-sync-chat.test.ts` (4 теста)
- `tests/merge-customers.test.ts` (4 теста)
- `tests/messenger-ticket.test.ts` (3 теста)
- `tests/response-templates.test.ts` (2 теста)
- `tests/support-sync-chats.test.ts` (3 теста)
- `tests/support-sync-returns.test.ts` (1 тест)
- `tests/template-picker.test.ts` (файл целиком)
- `tests/wb-cooldown.test.ts` (2 теста — счётчик bucket-слагов)
- `tests/wb-sync-route.test.ts` (3 теста)
- `tests/wb-token-validate.test.ts` (1 тест — "probe timeout", похоже на
  сетевую зависимость: недоступность сети в sandboxed-окружении исполнителя)

Целевой гейт задачи (`tests/finance-weekly-credit-accrual.test.ts` + весь набор
`finance-weekly-*`/`pricing-math` — 141/141, и `npx tsc --noEmit` — 0 ошибок)
зелёный полностью. Полный `npx vitest run` (все файлы проекта) не входит в
verification-контракт плана 260714-ij9, поэтому эти falls вне scope выполнения,
но фиксируются здесь на будущее.
