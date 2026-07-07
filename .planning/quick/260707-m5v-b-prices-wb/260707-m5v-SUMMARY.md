---
quick_id: 260707-m5v
title: "Фаза B v1 — второй фин-рез «на стандартных условиях» в /prices/wb (срез отложён)"
status: complete
date: 2026-07-07
commits: [fc7238a, f7e383c, b4dbacd]
spec: docs/superpowers/specs/2026-07-07-wb-planned-prices-standard-finres-design.md
---

# Итог

Реализована **Фаза B v1** дизайна «Плановые цены + второй фин-рез»: в `/prices/wb` для каждой ценовой строки теперь считается и показывается второй финансовый результат **«на стандартных условиях»** (стандартная комиссия WB + полная модель логистики к клиенту с учётом выкупа и возврата при невыкупе + хранение) — параллельно с текущим расчётом по ИУ. Задеплоено на прод (b4dbacd), миграция `WbBoxTariff` применена, `curl https://zoiten.pro` → 200.

**Срез по стоку (спека §5) сознательно НЕ реализован** — эффективные box-ставки складов хранятся флэтом (среднее по всем округам, коэффициенты сейчас 100% и идентичны) в `AppSetting.wbBoxTariffEffective`. commission.xlsx не загружался.

## Сделано (по плану)

### Task 1 — тариф-синк складов + новые ставки (fc7238a)

- **`WbBoxTariff`** — новая модель (сырые box-тарифы складов WB) + ручная миграция `20260707_wb_box_tariff` (нет локальной PG — паттерн 260706-q5a), seed `AppSetting.wbReturnLogisticsRub=50.0` / `wbLocalizationIndex=1.0`.
- **`lib/wb-api.ts:fetchBoxTariffs(date)`** — `GET /tariffs/box` через `wbFetch("Tariffs API", ...)` (bucket `tariffs`, cooldown-bus + `WbRateLimitError` на 429 — актуальная замена legacy `retryFetch`, упомянутого в CLAUDE.md, но фактически замененного 2026-05-12). Парсинг `response.data.warehouseList[]` со строками-запятыми (`"11,2"→11.2`, `"-"→null`).
- **`lib/wb-box-tariffs.ts:syncBoxTariffs(db)`** — DI на `PrismaClient` (без next-auth импортов, тестируемо), upsert каждого склада в `WbBoxTariff`, `computeEffectiveBoxTariff` (флэт-среднее по не-null значениям, экспортирован pure для будущих тестов), upsert `AppSetting.wbBoxTariffEffective` (JSON).
- **`POST /api/wb-box-tariffs-sync`** (RBAC `PRICES MANAGE`) + **`GET /api/cron/wb-box-tariffs`** (x-cron-secret) + ветка `box-tariffs` (05:20 МСК, между prices 05:10 и cards-refresh 05:30) в `app/api/cron/dispatch/route.ts`.
- **`WbBoxTariffsSyncButton`** в шапке `/prices/wb`, паттерн `WbSyncSppButton`.
- **`lib/pricing-schemas.ts`**: 2 новых ключа/дефолта в `APP_SETTING_KEYS`/`APP_SETTING_DEFAULTS`; новая `appSettingValueSchemaForKey(key)` + `APP_SETTING_MAX` per-key map — `wbReturnLogisticsRub` теперь принимает ₽ до 1000, все процентные ставки (существующие 7 ключей) остаются в `[0,100]` (bond НЕ ослаблен, старая `appSettingValueSchema` не тронута — обратная совместимость тестов `tests/pricing-settings.test.ts`). `updateAppSetting` в `app/actions/pricing.ts` переключён на key-aware схему.
- **`GlobalRatesBar`**: `RateSpec` получил опц. `unit`/`max` (дефолт `"%"`/100), 2 новых поля («Возврат-логистика», ₽, max 1000; «Индекс локализации», ×).

### Task 2 — `calculatePricingStandard` (f7e383c)

- `PricingInputs`/`PricingOutputs` расширены **опциональными** std-полями — существующий golden test (nmId 800750522, `profit≈567.68`/`roiPct≈25.76`/`returnOnSalesPct≈7.33`) остался зелёным без изменений тела `calculatePricing`.
- `calculatePricingStandard(inputs)` — отдельная pure-функция: `Л_туда = (delivBase + delivLiter×max(0,V−1)) × (delivCoefPct/100) × ИЛ`; `Л_эфф = ПВ>0 ? [Л_туда + (1−ПВ)×returnLogisticsRub]/ПВ : Л_туда`; `Хранение = storageBasePerLiter × V × (storageCoefPct/100) × daysInStock`; переиспользует `calculatePricing` как ядро (комиссия=std, доставка=Л_эфф) и вычитает Хранение сверху.
- **std-golden пересчитан вручную из формул §4** (НЕ иллюстративное число из плана): при `commStdPct=25, volumeLiters=5, buyoutPct=90, delivBase=46, delivLiter=14, returnLogisticsRub=50, storageBasePerLiter=0.07, daysInStock=60` → `Л_туда=102`, `Л_эфф≈118.8889₽`, `Хранение=21₽`, **`profitStd≈1045.24₽`** (план указывал иллюстративное ≈1044.74₽ — расхождение исправлено расчётом), `roiPctStd≈47.42%`, `returnOnSalesPctStd≈13.49%`. Запинено в `tests/pricing-math.test.ts` с `toBeCloseTo` tolerance.
- Zero-guards: `buyoutPct=0` (Л_эфф=Л_туда, без NaN), `costPrice=0` (`roiPctStd=0`), `priceBeforeDiscount=0` (`sellerPrice=0` → `returnOnSalesPctStd=0`), std-функция без std-входов (дефолты, `storageAmount=0`).

### Task 3 — page.tsx резолвинг + 3 столбца + модалка + деплой (b4dbacd)

- **page.tsx**: `stdParams` per (card, product) — `commStdPct = product.commissionOverridePct ?? card.commFbwStd ?? 0`; `volumeLiters` из габаритов `Product` (0 если нет); box-тарифы из `AppSetting.wbBoxTariffEffective` (JSON.parse, fallback `delivBase=46/delivLiter=14/delivCoefPct=100/storageBasePerLiter=0.07/storageCoefPct=100` пока кнопка «Тарифы складов» не нажата); `wbReturnLogisticsRub`/`wbLocalizationIndex` из уже расширенного `RATE_KEYS`-запроса (Task 1). Каждая из 5 категорий строк (current/planned/regular/auto/calculated) получает `computedStd: calculatePricingStandard({...xInputs, ...stdParams})` + `stdContext: stdParams` (для realtime модалки).
- **`PriceCalculatorTable`**: 3 новых столбца (`profitStd`/`roiPctStd`/`returnOnSalesPctStd`) в `COLUMN_KEYS`/`DEFAULT_WIDTHS`/`HIDEABLE_COLUMN_KEYS`/`SCROLL_COLUMNS`; рендер nullable-safe (`row.computedStd?.profitStd ?? 0`, БЕЗ `!`-assertions — фикс plan-checker #2).
- **`PricingCalculatorDialog`**: `liveInputs` вынесен в отдельный `useMemo` (переиспользуется первым и вторым блоком), `liveOutputsStd` — realtime через `calculatePricingStandard({...liveInputs, ...row.stdContext})`, второй блок «Стандартные условия» (Логистика туда/эфф, Хранение, Прибыль-std/ROI-std/Re-std) — скрыт, если `row.stdContext` отсутствует.
- Спека помечена «Фаза B v1 реализована» (шапка + §7).
- **Деплой**: `git push origin main` (78e3157..b4dbacd) → detached `nohup deploy.sh` → миграция `20260707_wb_box_tariff` применена («All migrations have been successfully applied») → build OK → `curl https://zoiten.pro` → **200**.

## Отклонения от плана

### [Rule 3 — блокирующая проблема] Расширение `RATE_KEYS`/`DEFAULT_RATES` в page.tsx уже в Task 1

`GlobalRatesBar.initialRates` типизирован `Record<RateKey, number>` с 9 ключами после добавления 2 новых полей — локальный `RATE_KEYS`/`DEFAULT_RATES` в `page.tsx` (7 ключей) перестал удовлетворять типу (`npx tsc --noEmit` падал уже в Task 1). Расширил `RATE_KEYS`/`DEFAULT_RATES` в page.tsx двумя новыми ключами в Task 1 (а не отложил до Task 3, как формально предполагал план) — иначе гейт Task 1 не прошёл бы. Task 3 просто переиспользует уже загруженные `rates.wbReturnLogisticsRub`/`rates.wbLocalizationIndex`.

### [Rule 1 — баг] `daysInStock` использует `avgSalesSpeed7d` без доп. деления на 7

План (Task 3, `<what-built>`) дословно указывал `salesPerDay = (card.avgSalesSpeed7d ?? 0) / 7`. Поле `WbCard.avgSalesSpeed7d` **уже per-day** (см. `totalAvgSalesSpeed`/«Остаток в днях» в этом же `page.tsx`/`PriceCalculatorTable.tsx` — используется напрямую как «шт./д.» без доп. `/7`). Буквальная формула плана занизила бы `salesPerDay` в 7 раз → `daysInStock` (и, соответственно, Хранение в std-блоке) была бы завышена почти в 7 раз для товаров с реальной скоростью продаж. Использовал `salesPerDay = card.avgSalesSpeed7d ?? 0` (без `/7`), consistent с существующим кодом того же файла.

### Уточнения формулировок plan-checker (учтены, не отклонения)

- Диапазон валидации `wbReturnLogisticsRub` расширен через **per-key `appSettingValueSchemaForKey`** (не ослабляя `[0,100]` для процентных ставок) + `max` в `<Input>` GlobalRatesBar — как требовал фикс #1.
- Nullable `computedStd`/`stdContext` обрабатываются через `?? 0` без `!`-assertions — фикс #2.
- std-golden запинен на пересчитанном `≈1045.24₽` (не иллюстративном `≈1044.74₽` из плана) — фикс #3.

## Проверка

- `npx tsc --noEmit` — чисто на каждом task-гейте (Task 1, 2, 3).
- `npm run test` — **945/987 зелёных**; 42 падения (`support-sync-chats`, `support-sync-returns`, `wb-sync-route`, `wb-token-validate`, `appeal-actions`, `customer-actions`, `merge-customers`, `messenger-ticket`, `response-templates`, `customer-sync-chat`, `template-picker`) — **пред-существующие**, не мои файлы, не тронуты этим тайлом (не в `files_modified`). `pricing-math` (35/35, включая новый std-golden) и `sales-plan-engine`/`sales-plan-plan-fact` (26/26) — зелёные.
- Прод: HEAD `b4dbacd`, миграция `20260707_wb_box_tariff` применена (`\d "WbBoxTariff"` подтверждает 9 колонок), `AppSetting` содержит `wbReturnLogisticsRub=50.0`/`wbLocalizationIndex=1.0` (seed сработал), `curl https://zoiten.pro` → **200**, `/prices/wb` → 302 (redirect на login под curl без сессии — ожидаемо), `journalctl -u zoiten-erp` — старт чистый (`✓ Ready in 216ms`), без ошибок деплоя.

## UAT-пункты для пользователя

1. Открыть https://zoiten.pro/prices/wb — справа должны появиться 3 столбца **Прибыль-std / ROI-std / Re-std**, заполненные (не «—») для строк товаров с указанными габаритами (Д×Ш×В).
2. Нажать кнопку **«Тарифы складов»** в шапке → toast «Тарифы складов обновлены: N складов»; после этого `AppSetting.wbBoxTariffEffective` должна заполниться реальными данными `/tariffs/box`, std-столбцы пересчитаются по факту (сейчас считают по fallback-дефолтам `delivBase=46/delivLiter=14/storageBasePerLiter=0.07`).
3. В **GlobalRatesBar** проверить новые поля «Возврат-логистика ₽» (50) и «Индекс локализации ×» (1.0) — правка должна debounced-сохраняться и пересчитывать std-столбцы после `router.refresh()`.
4. Клик по любой ценовой строке → в модалке под первым блоком «Прибыль/Re/ROI» должен появиться второй блок **«Стандартные условия»** (Логистика туда, Логистика эфф., Хранение, Прибыль-std, Re продаж-std, ROI-std); правка цены продавца в форме должна пересчитывать оба блока realtime.
5. Убедиться, что первый блок (расчёт по ИУ) и все существующие 27 столбцов не изменились визуально/численно.
6. (Опционально) настроить `wbBoxTariffsCronTime` в `AppSetting`, если нужен другой час кроме дефолтного 05:20 МСК — крон подключён через dispatcher автоматически, без доп. действий.

## Осталось / примечания

- **Срез по стоку (спека §5)** сознательно отложен — эффективные ставки флэтом на все товары (не по направлению/кластеру склада). Возврат к этому пункту — отдельный quick/фаза, когда WB реально дифференцирует округа по коэффициентам (сейчас все 100%).
- **commission.xlsx** не загружался — `WbCard.commFbwStd` из Tariffs API уже покрывает то же самое (резерв на будущее, см. спеку §2).
- Первый ручной запуск «Тарифы складов» после деплоя пользователю нужен, чтобы `wbBoxTariffEffective` заполнилась реальными данными (до этого — fallback-дефолты в std-расчёте, что не является багом, а ожидаемым v1-поведением).

## Self-Check: PASSED

Все 16 файлов из `files_modified` найдены на диске + `SUMMARY.md`. Все 3 коммита (`fc7238a`, `f7e383c`, `b4dbacd`) найдены в `git log`. Прод: HEAD `b4dbacd`, миграция применена, `curl https://zoiten.pro` → 200.
