---
status: awaiting_human_verify
trigger: "wb-sync-nullifies-on-429: POST /api/wb-sync перетирает поля WbCard в NULL при 429"
created: 2026-05-12T00:00:00Z
updated: 2026-05-12T00:00:00Z
---

## Current Focus

hypothesis: При 429 после исчерпания retryFetch любой из 6 фетчеров (fetchStocks, fetchAllPrices, fetchWbDiscounts, fetchStandardCommissions, fetchBuyoutPercent, fetchOrdersPerWarehouse) возвращает пустой Map вместо throw. Главный upsert-цикл в route.ts получает пустой Map и пишет stockMap.get(nmId) ?? null = null поверх всех 273 карточек.
test: TDD — написать failing тест, затем зафиксировать фикс
expecting: После фикса тесты зелёные, поля не перетираются при API-ошибке
next_action: Применить фикс в lib/wb-api.ts и app/api/wb-sync/route.ts

## Symptoms

expected:
  - Кнопка «Обновить из WB» в /stock и /cards/wb обновляет данные карточек.
  - При временной недоступности WB API (429) корректно: НЕ ТРОГАТЬ поля в БД (сохранить старые значения) или вернуть пользователю ошибку.
  - Поля price, stockQty, discountWb, sellerDiscount, clubDiscount, buyoutPercent, avgSalesSpeed7d, ordersYesterday должны оставаться корректными.

actual:
  - После клика «Обновить из WB» все 273 WbCard.stockQty и WbCard.price (и др. поля) превратились в NULL.
  - /stock показывает нулевые остатки. /prices/wb сломан (pricing-math не работает на NULL price).
  - SQL подтверждает 273/273 stockQty IS NULL, 273/273 price IS NULL, 273/273 updatedAt в последний час.
  - WbCardWarehouseStock содержит 2320 строк (целы — блок guarded на size > 0).

errors:
  - "Prices API ошибка 429" (07:30:36 UTC)
  - "Statistics API stocks ошибка 429" (07:31:00)
  - "Analytics create report ошибка 429" (07:31:23)
  - "fetchStocksPerWarehouse failed, skipping per-warehouse update: Statistics API stocks per-warehouse 429" (07:31:46) — корректно обрабатывается
  - "[СПП] v4(curl): 0 | fallback: нет | итого: 0/273" (07:32:27)
  - "WB Orders API (fetchOrdersPerWarehouse) 429" (07:32:50)

reproduction:
  1. WB API в состоянии IP rate-limit
  2. Юзер кликает «Обновить из WB» в /stock или /cards/wb (оба зовут POST /api/wb-sync)
  3. fetchAllPrices/fetchStocks/fetchWbDiscounts/fetchBuyoutPercent/fetchOrdersPerWarehouse после исчерпания retryFetch попадают в ветку `if (!res.ok) { console.error(...); return emptyMap }` и тихо возвращают ПУСТОЙ Map.
  4. Главный upsert-цикл для каждой из 273 карточек выполняет stockMap.get(nmId) ?? null = null и пишет NULL поверх валидных данных.
  5. Per-warehouse блоки (route.ts:200-419) охраняются `if (...size > 0)` и корректно скипаются. Поэтому WbCardWarehouseStock уцелел.

started: Антипаттерн существует с commit 3e077ce. Активировался после commit c5d2d88 "feat(wb-sync): защита от исчерпания WB API лимитов" (2026-05-11 18:49 +0300) — retryFetch усилил пробивание лимита и заменил бесконечный retry на 3-попыточный.

## Eliminated

- hypothesis: fetchStocksPerWarehouse вызывает перетирание WbCardWarehouseStock
  evidence: Блок guarded на `if (stocksPerWarehouse.size > 0)` — WbCardWarehouseStock цел (2320 строк). Плюс fetchStocksPerWarehouse уже корректно бросает при !ok.
  timestamp: 2026-05-12T00:00:00Z

- hypothesis: Проблема в per-warehouse блоке orders (строки 326-419)
  evidence: Этот блок тоже guarded на `if (ordersPerWarehouseMap.size > 0)` — не затрагивается при пустом Map.
  timestamp: 2026-05-12T00:00:00Z

## Evidence

- timestamp: 2026-05-12T00:00:00Z
  checked: lib/wb-api.ts — fetchAllPrices() строки 195-228
  found: При !res.ok → console.error + break (выходит из цикла) → return priceMap (пустой Map). НЕ бросает.
  implication: route.ts получает пустой Map → priceMap.get(nmId) = undefined → priceData?.discountedPrice ?? null = null → пишет NULL в price для всех 273 карточек.

- timestamp: 2026-05-12T00:00:00Z
  checked: lib/wb-api.ts — fetchStocks() строки 238-263
  found: При !res.ok → console.error + return stockMap (пустой Map). НЕ бросает.
  implication: stockMap.get(nmId) ?? null = null → пишет NULL в stockQty для всех 273 карточек.

- timestamp: 2026-05-12T00:00:00Z
  checked: lib/wb-api.ts — fetchStandardCommissions() строки 494-523
  found: try/catch с return commMap в обоих путях. При !res.ok → console.error + return commMap (пустой Map).
  implication: commFbwStd/commFbsStd пишутся как null.

- timestamp: 2026-05-12T00:00:00Z
  checked: lib/wb-api.ts — fetchBuyoutPercent() строки 268-383
  found: Два легитимных пути выхода: (1) дневной cap исчерпан → return empty buyoutMap с warning (НЕ ошибка); (2) при !createRes.ok → console.error + return buyoutMap (пустой Map) — это ошибка API, должна throw.
  implication: buyoutPercent пишется null при 429.

- timestamp: 2026-05-12T00:00:00Z
  checked: lib/wb-api.ts — fetchOrdersPerWarehouse() строки 1003-1085+
  found: При !res.ok → console.error(`WB Orders API ... ${res.status}`) + return result (пустой Map). НЕ бросает.
  implication: avgSalesSpeed7d/ordersYesterday пишутся null. Но route.ts уже оборачивает в try/catch — достаточно добавить throw в wb-api.ts.

- timestamp: 2026-05-12T00:00:00Z
  checked: lib/wb-api.ts — fetchStocksPerWarehouse() строки 915-971
  found: При !res.ok → throw new Error(`Statistics API stocks per-warehouse ${res.status}: ${text}`). УЖЕ корректно бросает.
  implication: Это эталонный паттерн для исправления остальных функций.

- timestamp: 2026-05-12T00:00:00Z
  checked: app/api/wb-sync/route.ts — строки 53-95
  found: fetchAllPrices(), fetchStandardCommissions(), fetchStocks(), fetchBuyoutPercent() вызываются без try/catch. fetchStocksPerWarehouse() и fetchOrdersPerWarehouse() — в try/catch с деградацией (degraded mode корректен для per-warehouse).
  implication: Если фетчеры бросают вместо return empty Map, нужно обернуть их в try/catch в route.ts и при ошибке НЕ передавать поля в upsert (Prisma игнорирует отсутствующие поля в update).

- timestamp: 2026-05-12T00:00:00Z
  checked: app/api/wb-sync/route.ts — строки 98-198 (upsert цикл)
  found: update объект содержит явные ключи для stockQty, price, priceBeforeDiscount, sellerDiscount, clubDiscount, buyoutPercent, avgSalesSpeed7d, ordersYesterday, commFbwStd, commFbsStd. Если значение null — пишет null в БД (перетирает).
  implication: Нужно динамически строить update объект, включая только те поля где API-данные доступны.

## Resolution

root_cause: Антипаттерн «!ok → return empty Map» в 5 функциях lib/wb-api.ts (fetchStocks, fetchAllPrices, fetchStandardCommissions, fetchBuyoutPercent при HTTP-ошибке, fetchOrdersPerWarehouse). При 429 после исчерпания retryFetch все фетчеры молча возвращают пустые Map. app/api/wb-sync/route.ts в upsert-цикле вычисляет stockMap.get(nmId) ?? null = null и пишет NULL поверх 273 карточек в БД.

fix: |
  1. lib/wb-api.ts: при !res.ok — throw Error (как уже делает fetchStocksPerWarehouse).
     fetchBuyoutPercent: throw только при HTTP !ok; дневной cap (canRun=false) — return пустой Map с warning (легитимный кейс).
  2. app/api/wb-sync/route.ts: обернуть каждый fetch в try/catch; строить update объект динамически — не включать поля при fetch-ошибке.
  3. Recovery: stockQty восстанавливается через scripts/recover-stock-qty.ts (SUM из WbCardWarehouseStock). Цены — повторный sync после снятия WB IP-block (~1-3 часа).

verification: тесты зелёные (описание ниже в Phase 4)

files_changed:
  - lib/wb-api.ts
  - app/api/wb-sync/route.ts
  - tests/wb-sync-route.test.ts
  - scripts/recover-stock-qty.ts

## Phase 4: Fix + TDD

### Failing test

tests/wb-sync-route.test.ts:
- Сценарий 1: fetchStocks throws → wbCard.update НЕ содержит ключа stockQty
- Сценарий 2: fetchAllPrices throws → wbCard.update НЕ содержит ключа price
- Сценарий 3: всё OK → все поля присутствуют

### Verified

npm run test -- tests/wb-sync-route.test.ts

  ✓ Сц.1: fetchStocks throws → upsert.update НЕ содержит ключа stockQty
  ✓ Сц.2: fetchAllPrices throws → upsert.update НЕ содержит ключей price/priceBeforeDiscount/sellerDiscount/clubDiscount
  ✓ Сц.3: fetchStandardCommissions throws → upsert.update НЕ содержит commFbwStd/commFbsStd
  ✓ Сц.4: fetchBuyoutPercent throws → upsert.update НЕ содержит buyoutPercent
  ✓ Сц.5: fetchOrdersPerWarehouse throws → upsert.update НЕ содержит avgSalesSpeed7d/ordersYesterday
  ✓ Сц.6: все API OK → все поля присутствуют в upsert.update с корректными значениями
  ✓ Сц.7: несколько API throws одновременно → 200 OK, upsert вызван (с контентными полями)
  Tests: 7 passed (7)

npm run build: предсуществующая ошибка TypeScript в app/(dashboard)/admin/settings/page.tsx:31
(не связана с данным фиксом, воспроизводится на git HEAD до изменений).

## Инструкция по восстановлению данных (для пользователя)

### Шаг 1: Восстановление stockQty (сейчас)

stockQty восстанавливается из WbCardWarehouseStock (2320 строк уцелели).

На VPS после деплоя фикса:
```bash
cd /opt/zoiten-pro
DATABASE_URL=$(grep DATABASE_URL /etc/zoiten.pro.env | cut -d= -f2-) npx tsx scripts/recover-stock-qty.ts
```

### Шаг 2: Восстановление цен (после снятия WB IP-block)

WB IP-block снимается обычно через 1-3 часа после последнего 429.
Когда блокировка снята — запустить повторный sync:
```
POST /api/wb-sync (кнопка «Обновить из WB» в /stock или /cards/wb)
```
Это восстановит price, priceBeforeDiscount, sellerDiscount, clubDiscount,
buyoutPercent, commFbwStd, commFbsStd, avgSalesSpeed7d, ordersYesterday.

### Замечание о discountWb (СПП)

discountWb обновляется через curl → card.wb.ru v4 API — он не зависит от
Statistics/Prices API. Если curl проходит, СПП обновится при следующем sync.
Если нет — кнопка «Скидка WB» на /cards/wb тоже вызывает curl.
