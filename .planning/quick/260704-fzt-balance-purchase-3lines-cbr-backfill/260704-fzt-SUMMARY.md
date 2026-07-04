---
phase: quick-260704-fzt
plan: "01"
subsystem: finance/balance
tags: [balance-sheet, procurement, cbr-rates, methodology, tests]
dependency_graph:
  requires: []
  provides:
    - "3-строчная классификация закупок в loadBalanceSheet (readyToShip + inTransit + advances)"
    - "fetchCbrRatesForDate(date) — архивный эндпоинт ЦБ"
    - "scripts/backfill-cbr-rates.ts — standalone бэкфилл исторических курсов"
  affects:
    - lib/balance-data.ts
    - lib/cbr-rates.ts
    - components/finance/BalanceMethodologyDialog.tsx
tech_stack:
  added: []
  patterns:
    - "upsert по @@unique([date, code]) — date_code составной ключ"
    - "standalone скрипт с parseCliArgs + process.exit — паттерн bootstrap-balance-snapshot"
key_files:
  created:
    - scripts/backfill-cbr-rates.ts
  modified:
    - lib/balance-data.ts
    - lib/cbr-rates.ts
    - components/finance/BalanceMethodologyDialog.tsx
    - docs/finance-balance-methodology.md
    - tests/balance-sheet.test.ts
decisions:
  - "SHIPMENT строго отделён от TRANSIT (баг — SHIPMENT был в inTransit)"
  - "Обе новые строки (readyToShip + inTransit) push-ятся ВСЕГДА в inventoryGroup, даже при total=0"
  - "fetchCbrRatesForDate возвращает null на !res.ok, не бросает — выходные ЦБ — нормальная ситуация"
  - "Бэкфилл загружает ВСЕ валюты из ответа ЦБ (не только CNY/USD)"
  - "key stock-in-transit-china переименован в stock-in-transit (без -china)"
metrics:
  duration: "~20 мин"
  completed: "2026-07-04"
  tasks_completed: 4
  files_changed: 5
  files_created: 1
---

# Phase quick-260704-fzt Plan 01: Баланс закупок — 3 строки + бэкфилл курсов ЦБ Summary

**One-liner:** 3-строчная классификация закупок (SHIPMENT→готов к отгрузке, TRANSIT→в пути, иначе→авансы) + standalone бэкфилл исторических курсов ЦБ за март–июнь 2026.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| A | Три строки классификации закупок | e271a9f | lib/balance-data.ts |
| B | fetchCbrRatesForDate + backfill-cbr-rates | f4ffeba | lib/cbr-rates.ts, scripts/backfill-cbr-rates.ts |
| C | Методология — 3 строки закупок | b3ee4a0 | components/finance/BalanceMethodologyDialog.tsx, docs/finance-balance-methodology.md |
| D | Тесты — stock-ready-to-ship | a06a309 | tests/balance-sheet.test.ts |

## What Was Built

### Task A: lib/balance-data.ts

Исправлен баг: `SHIPMENT` ошибочно попадал в `inTransit`. Теперь три независимых набора:

- `inTransitContribs / inTransitTotal / inTransitApproximate` — только `stage === "TRANSIT"`
- `readyToShipContribs / readyToShipTotal / readyToShipApproximate` — только `stage === "SHIPMENT"`
- `advancesContribs / advancesTotal / advancesApproximate` — `null | PRODUCTION | INSPECTION`

В `inventoryGroup` теперь две строки вместо одной:
- `stock-ready-to-ship` (label «Товар готовый к отгрузке») — всегда push-ается
- `stock-in-transit` (label «Товар в пути», переименовано с `stock-in-transit-china`) — всегда push-ается

Цикл обновления `productLabel` расширен: `[inTransitContribs, readyToShipContribs, advancesContribs]`.

### Task B: lib/cbr-rates.ts + scripts/backfill-cbr-rates.ts

`fetchCbrRatesForDate(date: Date)` — новый экспорт, архивный URL:
```
https://www.cbr-xml-daily.ru/archive/YYYY/MM/DD/daily_json.js
```
Возвращает `null` на `!res.ok` (выходной, праздник) — не бросает.

`scripts/backfill-cbr-rates.ts` (131 строка):
- `--from=YYYY-MM-DD` (default 2026-03-01), `--to=YYYY-MM-DD` (default 2026-06-09)
- Цикл по датам, пауза 150мс между датами
- upsert по `date_code` с `nominal` + `rateToRub`
- Все валюты из ответа (не только CNY)
- Сводка `{ from, to, datesProcessed, datesSkipped, ratesUpserted }`

### Task C: Методология

`BalanceMethodologyDialog.tsx` и `docs/finance-balance-methodology.md` синхронизированы — три `<Item>` вместо одного «Товар в пути из Китая»:
1. Авансы поставщикам — PRODUCTION/INSPECTION/без этапа
2. Товар готовый к отгрузке — SHIPMENT
3. Товар в пути — TRANSIT

Оговорка про курсы обновлена: «бэкфилл с марта 2026».

### Task D: Тесты

- Заменён тест `stock-in-transit-china` на два теста:
  - `stock-ready-to-ship`: `purch-transit` SHIPMENT → `amountRub 1000`, инвариант `Σлистьев`
  - `stock-in-transit`: строка существует с `amountRub=0` (нет TRANSIT в фикстуре)
- Обновлён комментарий `inventory subtotal` (1000 WB_WAREHOUSE + 1000 готов к отгрузке + 0 в пути = 2000)
- `advances-suppliers`, `bank-rub`, `loans-balance` и golden-инварианты не тронуты

## Deviations from Plan

None — план выполнен точно как написан. Все 4 grep-gate проходят.

## Verification

### Grep gates

| Task | Status |
|------|--------|
| A — `stock-ready-to-ship` + `readyToShipContribs` + TRANSIT/SHIPMENT ветки | PASSED |
| B — `fetchCbrRatesForDate` + `/archive/` + `date_code` + `parseCliArgs` | PASSED |
| C — три пункта методологии, нет «Товар в пути из Китая» | PASSED |
| D — `stock-ready-to-ship` + `"stock-in-transit"`, нет `stock-in-transit-china` | PASSED |

### Vitest

Локально не запускается (нет `node_modules`). Настоящий прогон — на VPS/CI при деплое.
Тест полностью детерминирован: фикстура с `purch-transit SHIPMENT` → `stock-ready-to-ship amountRub=1000`, `stock-in-transit amountRub=0`.

### Инварианты

- `Σлистьев === amountRub` для `stock-ready-to-ship` (buildProductTree с parentKey=stock-ready-to-ship)
- `Σлистьев === amountRub` для `stock-in-transit` (0 = 0, без children)
- `inventory subtotal = 2000` (1000 + 1000 + 0), `advances subtotal = 2000` — без изменений
- `stock-in-transit-china` не встречается ни в одном из файлов

### Backfill скрипт

Запуск на VPS после мержа:
```bash
set -a; . /etc/zoiten.pro.env; set +a
npx tsx scripts/backfill-cbr-rates.ts --from=2026-03-01 --to=2026-06-09
```

## Known Stubs

None.

## Threat Flags

None — новых сетевых эндпоинтов/auth-путей не добавлено.

## Self-Check: PASSED

- `lib/balance-data.ts` — изменён, содержит `stock-ready-to-ship`, `stock-in-transit`, три ветки
- `lib/cbr-rates.ts` — содержит `fetchCbrRatesForDate`
- `scripts/backfill-cbr-rates.ts` — создан (131 строка)
- `components/finance/BalanceMethodologyDialog.tsx` — содержит три пункта методологии
- `docs/finance-balance-methodology.md` — содержит три строки таблицы
- `tests/balance-sheet.test.ts` — содержит `stock-ready-to-ship` и `"stock-in-transit"`, нет `-china`
- Коммиты e271a9f, f4ffeba, b3ee4a0, a06a309 — подтверждены `git log`
