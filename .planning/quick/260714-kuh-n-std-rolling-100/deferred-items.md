# Deferred Items — quick-260714-kuh

Обнаружено при исполнении Task 2 (регрессионный прогон `npm run test`).
Вне scope этого quick task (не связаны с `lib/finance-weekly/data.ts` /
`loadBuyoutPctRolling30dMap` / rolling-30d выкупом) — НЕ исправлялись.

Подтверждено: те же 44 теста в тех же 12 файлах падают идентично и на
состоянии файла ДО правки (проверено через временный `git checkout HEAD~1 --
lib/finance-weekly/data.ts` + прогон 3 файлов из списка — все 17 упавших
тестов воспроизвелись identично). Предсуществующие падения, не регрессия
этого плана.

## Список (12 файлов, 44 теста)

- `tests/appeal-actions.test.ts` (12 тестов)
- `tests/customer-actions.test.ts` (9 тестов)
- `tests/customer-sync-chat.test.ts` (4 теста)
- `tests/merge-customers.test.ts` (4 теста)
- `tests/messenger-ticket.test.ts` (3 теста)
- `tests/response-templates.test.ts` (2 теста)
- `tests/support-sync-chats.test.ts` (3 теста)
- `tests/support-sync-returns.test.ts` (1 тест)
- `tests/template-picker.test.ts` (весь файл — вероятно ошибка загрузки/env)
- `tests/wb-cooldown.test.ts` (2 теста — ожидает 11 bucket-слагов, фактически
  12: появился `finance-reports`, видимо от более раннего quick-задания)
- `tests/wb-sync-route.test.ts` (3 теста — статус 500 вместо 200/not.toBe(500))
- `tests/wb-token-validate.test.ts` (1 тест — сообщение об ошибке timeout)

## Релевантные тесты (в scope, все зелёные)

`npm run test -- finance-weekly pricing-math` → 10 test files, 141 tests passed.

## Рекомендация

Отдельная задача на разбор регрессий в support/customer/template/wb-sync-route/
wb-cooldown/wb-token-validate тестах — не блокирует этот quick task.
