# Deferred items — quick-260720-mj0

Обнаружены во время финального прогона `npm run test`. Все НЕ связаны с задачей
(миграция остатков WB на Analytics warehouse_remains) — pre-existing failures,
подтверждено сравнением с baseline (`git stash` до начала работ): тот же набор
из 11 файлов падал ДО задачи (плюс 3 файла, которые эта задача чинит:
wb-stocks-per-warehouse, wb-sync-route, wb-fetch-rate-limit — теперь зелёные).

Не трогались (out of scope, Rule "SCOPE BOUNDARY"):

- `tests/appeal-actions.test.ts`
- `tests/customer-actions.test.ts`
- `tests/customer-sync-chat.test.ts`
- `tests/merge-customers.test.ts`
- `tests/messenger-ticket.test.ts`
- `tests/response-templates.test.ts`
- `tests/support-sync-chats.test.ts`
- `tests/support-sync-returns.test.ts`
- `tests/template-picker.test.ts`
- `tests/wb-cooldown.test.ts` — bucket count assertion (11 vs 12) устарела: где-то
  между coding sessions добавлен `finance-reports` bucket без обновления теста.
- `tests/wb-token-validate.test.ts` — сообщение об ошибке timeout не матчит regex.

Итог: 41 тест / 11 файлов падают и до, и после этой задачи — не регрессия.
