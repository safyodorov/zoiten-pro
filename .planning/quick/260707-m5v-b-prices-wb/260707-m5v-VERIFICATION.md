---
quick_id: 260707-m5v
verified: 2026-07-07T13:49:10Z
status: human_needed
score: 6/6 must-have truths verified in code+DB+prod (0 blocking gaps); 4 items need live-browser human smoke
human_verification:
  - test: "Открыть https://zoiten.pro/prices/wb под PRICES/MANAGE"
    expected: "Справа таблицы видны 3 новых столбца «Прибыль-std, руб.» / «ROI-std, %» / «Re-std, %», заполнены числами (не «0»/«—») для строк товаров с заполненными габаритами Д×Ш×В"
    why_human: "Визуальный рендер sticky-таблицы (rowSpan, ширины, indicator strips) не поддаётся grep; требует залогинённой сессии"
  - test: "Нажать кнопку «Тарифы складов» в шапке /prices/wb"
    expected: "Toast «Тарифы складов обновлены: N складов»; AppSetting.wbBoxTariffEffective заполняется реальными данными /tariffs/box (на момент верификации запись ещё отсутствует в БД — ожидаемо, кнопку ещё не нажимали после деплоя)"
    why_human: "Требует живой WB API-запрос (Tariffs API, scope «Тарифы») с реального токена; не должен вызываться build/verify-тайм (rate-limit)"
  - test: "Клик по любой ценовой строке → модалка юнит-экономики"
    expected: "Под первым блоком «Прибыль/ROI/Re» появляется второй блок «Стандартные условия» (Логистика туда / Логистика эфф. / Хранение / Прибыль-std / ROI-std / Re-std); правка Цены продавца/Скидки/Процента выкупа в форме пересчитывает ОБА блока realtime без задержки"
    why_human: "Realtime UX и layout — требует интерактивной проверки в браузере"
  - test: "В GlobalRatesBar проверить 2 новых поля «Возврат-логистика ₽» (50) и «Индекс локализации ×» (1.0)"
    expected: "Правка debounced (500ms) сохраняется через updateAppSetting, значение принимает >100 для ₽-поля (напр. 150), toast «Ставка сохранена», std-столбцы таблицы пересчитываются после router.refresh()"
    why_human: "Debounced UX + toast timing + Zod per-key bond ([0,1000] для ₽ vs [0,100] для %) — интерактивная проверка"
---

# Quick Task 260707-m5v: Фаза B v1 — второй фин-рез «на стандартных условиях» — Verification Report

**Task Goal:** Реализовать второй финансовый результат «на стандартных условиях» (прибыль/ROI/Re-продаж) в `/prices/wb` параллельно текущему расчёту по ИУ: тариф-синк складов WB (`WbBoxTariff` + `/tariffs/box`), `calculatePricingStandard` (комиссия std + логистика с амортизацией возврата при невыкупе + хранение), 3 новых столбца в таблице, второй блок в модалке, 2 новые ставки в GlobalRatesBar. Срез по стоку (спека §5) сознательно отложен.

**Verified:** 2026-07-07T13:49:10Z
**Status:** human_needed (все автоматизированные проверки прошли; 4 UI-интерактивных пункта требуют live-browser smoke — согласуется с конвенцией проекта, см. `.planning/phases/07-prices-wb/07-VERIFICATION.md`)
**Re-verification:** Нет — initial verification

---

## Goal Achievement

### Observable Truths (из must_haves плана)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Кнопка «Тарифы складов» тянет `/tariffs/box` и пишет `AppSetting.wbBoxTariffEffective` | ✓ VERIFIED (код) / ? HUMAN (live-запуск) | `app/api/wb-box-tariffs-sync/route.ts` → `syncBoxTariffs(prisma)` → `lib/wb-box-tariffs.ts` upsert `WbBoxTariff` + `AppSetting.wbBoxTariffEffective` (JSON). На проде запись `wbBoxTariffEffective` ещё отсутствует в БД — кнопку не нажимали ни разу после деплоя (ожидаемо по SUMMARY п.6, не блокирует) |
| 2 | Крон раз в сутки (через dispatcher) обновляет box-тарифы | ✓ VERIFIED | `app/api/cron/dispatch/route.ts:41,52,78-79,220-236` — ветка `box-tariffs` (05:20 МСК default), `dynamic import("../wb-box-tariffs/route").GET(req)`, `fired.push('box-tariffs:'+status)` |
| 3 | В GlobalRatesBar редактируются возврат-логистика (₽) и индекс локализации (×) | ✓ VERIFIED | `components/prices/GlobalRatesBar.tsx:55-56` — 2 новых `RateSpec` с `unit`/`max`; `lib/pricing-schemas.ts` `APP_SETTING_KEYS`/`DEFAULTS`/`MAX` расширены; `appSettingValueSchemaForKey` bond [0,1000] только для `wbReturnLogisticsRub`, проценты остаются [0,100] |
| 4 | В `/prices/wb` 3 столбца Прибыль-std/ROI-std/Re-std на каждой строке | ✓ VERIFIED (код) / ? HUMAN (визуал) | `PriceCalculatorTable.tsx` COLUMN_KEYS/DEFAULT_WIDTHS/HIDEABLE/SCROLL_COLUMNS += 3 ключа; рендер `row.computedStd?.X ?? 0` (nullable-safe, без `!`); `page.tsx` считает `computedStd` для всех 5 категорий строк (current/planned/regular/auto/calculated) |
| 5 | В модалке второй блок «стандартные условия» со строками Хранение/Логистика-эфф | ✓ VERIFIED (код) / ? HUMAN (realtime UX) | `PricingCalculatorDialog.tsx:255-261` `liveOutputsStd` useMemo от `liveInputs`+`row.stdContext`; блок рендерит Логистика туда/эфф, Хранение, Прибыль-std, Re-std, ROI-std; скрыт если `stdContext` отсутствует |
| 6 | Golden nmId 800750522 не сломан; std-golden зелёный | ✓ VERIFIED | `npx vitest run pricing-math` → все тесты зелёные; explicit `describe("calculatePricing — golden первого блока НЕ сломан std-функцией")` проходит; std-golden профиль ≈1045.24₽/47.42%/13.49% запинен и проходит |

**Score:** 6/6 truths подтверждены в коде+БД+проде; 4 из них дополнительно требуют live-browser подтверждения визуала/UX (не блокирует, см. human_verification).

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/schema.prisma` | `model WbBoxTariff` (9 полей, все nullable кроме PK/updatedAt) | ✓ VERIFIED | Строки 368-380, поля точно соответствуют плану (deliveryBase/Liter/CoefPct, storageBase/Liter/CoefPct, dtTillMax, updatedAt) |
| `prisma/migrations/20260707_wb_box_tariff/migration.sql` | CREATE TABLE + seed 2 AppSetting | ✓ VERIFIED | Применена на проде: `\d "WbBoxTariff"` на VPS показывает ровно 9 колонок, PK на warehouseName; `AppSetting` содержит `wbReturnLogisticsRub=50.0`/`wbLocalizationIndex=1.0` |
| `lib/wb-api.ts` `fetchBoxTariffs` | Парсинг `/tariffs/box`, запятые/"-" | ✓ VERIFIED | Строки 576-612; `parseWbTariffNum` (564-568) корректно обрабатывает `"0,07"→0.07`, `"-"→null`; путь `data.response.data.warehouseList` совпадает с разведкой из плана; `wbFetch("Tariffs API", ...)` → bucket `tariffs` (строка 804) |
| `lib/wb-box-tariffs.ts` `syncBoxTariffs` | fetch→upsert→computeEffective→AppSetting, БЕЗ взвешивания | ✓ VERIFIED | DI на `PrismaClient` (без next-auth импортов); `computeEffectiveBoxTariff` — чистое среднее не-null (avgNonNull), никакого обращения к `WbCardWarehouseStock` |
| `app/api/wb-box-tariffs-sync/route.ts` | POST, RBAC PRICES MANAGE | ✓ VERIFIED | `requireSection("PRICES","MANAGE")` с 401/403 маппингом; `revalidatePath("/prices/wb")` |
| `app/api/cron/wb-box-tariffs/route.ts` | GET, x-cron-secret | ✓ VERIFIED | Gate на `CRON_SECRET`; upsert `wbBoxTariffsLastRun` |
| `lib/pricing-math.ts` `calculatePricingStandard` | Формулы §4, опц. std-outputs | ✓ VERIFIED | Строки 482-522; делегирует в `calculatePricing` без изменения тела (git diff подтверждает — только additive блоки до/после); Л_туда/Л_эфф/Хранение формулы дословно совпадают со спекой |
| `components/prices/PriceCalculatorTable.tsx` | 3 std-столбца | ✓ VERIFIED | COLUMN_KEYS/DEFAULT_WIDTHS(100/90/90)/HIDEABLE/SCROLL_COLUMNS + nullable-safe рендер строки 1387-1391 |
| `components/prices/PricingCalculatorDialog.tsx` | Второй блок фин-реза | ✓ VERIFIED | `liveOutputsStd` realtime useMemo, второй блок условно рендерится |
| `components/prices/GlobalRatesBar.tsx` | 2 новых ставки | ✓ VERIFIED | `RateSpec.unit`/`max` опциональны (дефолт "%"/100); рендер суффикса из `unit ?? "%"` |
| `components/prices/WbBoxTariffsSyncButton.tsx` | Кнопка в шапке | ✓ VERIFIED | Паттерн `WbSyncSppButton`; вставлена в `page.tsx:1073` рядом с `WbSyncSppButton` |

**Artifacts: 11/11 VERIFIED на всех трёх уровнях (exists/substantive/wired).**

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `page.tsx` | `calculatePricingStandard` | per-row вызов → `row.computedStd` | ✓ WIRED | Вызывается для всех 5 категорий строк (строки 673, 710, 755, 803, 889), с `stdParams` (commStdPct/volumeLiters/box-тарифы/ставки/daysInStock) |
| `PriceCalculatorTable.tsx` | `row.computedStd` | рендер 3 std-столбцов | ✓ WIRED | `row.computedStd?.profitStd ?? 0` и аналогично roiPctStd/returnOnSalesPctStd |
| `lib/wb-box-tariffs.ts:syncBoxTariffs` | `AppSetting.wbBoxTariffEffective` | upsert JSON | ✓ WIRED | Строки 91-95 |
| `page.tsx` | `AppSetting.wbBoxTariffEffective` | JSON.parse → входы std-расчёта | ✓ WIRED | Строки 262-277, с fallback-дефолтами при отсутствии/некорректном JSON |
| `WbBoxTariffsSyncButton.tsx` | `/api/wb-box-tariffs-sync` | fetch POST | ✓ WIRED | Строка 20 |
| `app/api/cron/dispatch/route.ts` | `/api/cron/wb-box-tariffs` | shouldFireCron + dynamic import | ✓ WIRED | Строки 220-236 |
| `PricingCalculatorDialog.tsx` | `calculatePricingStandard` | `liveOutputsStd` useMemo | ✓ WIRED | Deps: `[liveInputs, row.stdContext]`, realtime пересчёт при правке формы |

**Key links: 7/7 WIRED.**

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `page.tsx` → `PriceRow.computedStd` | `stdParams` (commStdPct/volumeLiters/boxTariff/rates/daysInStock) | `AppSetting` (rates, box-тарифы с fallback), `Product` (габариты), `WbCard` (commFbwStd, avgSalesSpeed7d, stockQty) | Да — реальные БД-поля, не статичные заглушки | ✓ FLOWING |
| `page.tsx` → `daysInStock` | `card.avgSalesSpeed7d` | `WbCard.avgSalesSpeed7d` ← `app/api/wb-sync/route.ts:252` ← `fetchOrdersPerWarehouse(nmIds,7).avg` = `totalOrders/7` (УЖЕ per-day) | Да — семантика подтверждена (см. риск-проверку ниже) | ✓ FLOWING (не HOLLOW) |
| `PricingCalculatorDialog.tsx` → `liveOutputsStd` | `liveInputs` + `row.stdContext` | `useWatch` (форма) + серверный `stdContext` (проброшен из `page.tsx`) | Да, realtime | ✓ FLOWING |
| `WbBoxTariffsSyncButton` → prod DB | `wbBoxTariffEffective` | Live `/tariffs/box` через кнопку (ещё не нажата на проде на момент верификации) | Не заполнено — используются fallback-дефолты (delivBase=46 и т.д.), это ЗАДОКУМЕНТИРОВАННОЕ ожидаемое v1-поведение, не HOLLOW-баг | ⚠ PENDING (ожидаемо, не гэп) |

**Ключевая риск-проверка (daysInStock / avgSalesSpeed7d семантика):**

Проверено сквозным трейсом по коду:
1. `lib/wb-api.ts:fetchOrdersPerWarehouse(nmIds, periodDays=7)` возвращает `avg: t / periodDays` (строка 1244) — т.е. **уже разделено на 7**, единица измерения — заказы/день.
2. `app/api/wb-sync/route.ts:252,306` пишет `updateData.avgSalesSpeed7d = ordersStats?.avg ?? null` — присваивает то самое уже-per-day значение напрямую, без дополнительного деления.
3. Внутри того же `page.tsx` (строки 930-938, независимый код `totalAvgSalesSpeed`) есть явное подтверждающее доказательство: `if (rows.length === 0) return s + (card.avgSalesSpeed7d ?? 0)` — используется как fallback НАПРЯМУЮ (без `/7`) в сумме, где остальные слагаемые — `sum7d/7` (тоже per-day). Если бы `avgSalesSpeed7d` было суммой за 7 дней (не per-day), этот fallback был бы несовместим по единицам измерения с соседними слагаемыми того же reduce.

**Вывод:** `WbCard.avgSalesSpeed7d` — это заказы/день (уже поделено на период), НЕ суммарные заказы за 7 дней. Код в `page.tsx:618` (`const salesPerDay = card.avgSalesSpeed7d ?? 0`, без доп. `/7`) — **корректен**. Отклонение исполнителя от буквального текста плана (`/7`) было оправданным багфиксом, а не новым багом. Литеральная формула плана дала бы `daysInStock` завышенным почти в 7 раз для товаров с реальными продажами → Хранение в std-блоке было бы искажено. **Гэпа нет.**

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `npx tsc --noEmit` чист | `npx tsc --noEmit` | Без ошибок (пустой вывод) | ✓ PASS |
| golden pricing-math + std-golden + sales-plan engine/plan-fact зелёные | `npx vitest run pricing-math sales-plan-engine sales-plan-plan-fact` | `Test Files 3 passed (3)`, `Tests 61 passed (61)` | ✓ PASS |
| Полный тест-сьют — 945/987, 42 пред-существующих чужих падения | `npx vitest run` | `Test Files 11 failed \| 78 passed (89)`, `Tests 42 failed \| 945 passed (987)` — все 42 падения в `appeal-actions/customer-actions/customer-sync-chat/merge-customers/messenger-ticket/response-templates/support-sync-chats/support-sync-returns/template-picker/wb-sync-route/wb-token-validate` (support/CRM/wb-sync домены, НЕ в `files_modified` этого таска) | ✓ PASS (в рамках scope задачи) |
| Прод доступен | `curl -s -o /dev/null -w "%{http_code}" https://zoiten.pro` | `200` | ✓ PASS |
| Прод на правильном коммите | `ssh ... git log --oneline -1` | `b4dbacd` (совпадает с SUMMARY) | ✓ PASS |
| Миграция применена на проде | `ssh ... psql \d "WbBoxTariff"` | 9 колонок, ровно как в schema.prisma | ✓ PASS |
| Seed AppSetting применён на проде | `ssh ... psql SELECT key,value FROM "AppSetting" WHERE key IN (...)` | `wbReturnLogisticsRub=50.0`, `wbLocalizationIndex=1.0` найдены; `wbBoxTariffEffective` отсутствует (ожидаемо — кнопка ещё не нажималась) | ✓ PASS |
| Срез §5 НЕ реализован | `grep "WbCardWarehouseStock\|weighted" lib/wb-box-tariffs.ts` | Пусто — нет взвешивания по стоку | ✓ PASS |

---

### Anti-Patterns Found

Просканированы все файлы из `files_modified` (lib/wb-box-tariffs.ts, lib/wb-api.ts, lib/pricing-math.ts, lib/pricing-schemas.ts, роуты, кнопка, GlobalRatesBar) на `TODO/FIXME/XXX/HACK/PLACEHOLDER/not implemented/coming soon`.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | Ничего не найдено | — | Чисто |

---

### Requirements Coverage

Quick-задача не заведена в `.planning/REQUIREMENTS.md` (формальный ID `PRICES-STD-B` только в frontmatter плана — это ожидаемо для quick-тасков, не для фаз с REQUIREMENTS.md реестром). Запись о задаче корректно отражена в `.planning/STATE.md:423` со всеми тремя коммитами (`fc7238a, f7e383c, b4dbacd`) и точным описанием сделанного/отложенного. Орфанных требований нет — quick-таски не подчиняются этому чек-листу.

---

### Human Verification Required

См. YAML frontmatter `human_verification`. Кратко:

1. **Визуальный рендер 3 std-столбцов** в `/prices/wb` — не поддаётся grep, требует залогинённой сессии PRICES.
2. **Живой запуск кнопки «Тарифы складов»** — требует реального WB API токена (scope «Тарифы»); на момент верификации `AppSetting.wbBoxTariffEffective` в БД ещё пусто (std-столбцы сейчас считают по fallback-дефолтам `delivBase=46/delivLiter=14/storageBasePerLiter=0.07`, что задокументировано в SUMMARY как ожидаемое поведение до первого клика).
3. **Realtime-пересчёт второго блока модалки** — UX/latency, требует интерактивного клика.
4. **Debounced-сохранение новых полей GlobalRatesBar** — toast timing + расширенный bond [0,1000] для ₽-поля.

Эти 4 пункта дословно совпадают с «UAT-пунктами для пользователя» из `260707-m5v-SUMMARY.md` — исполнитель уже корректно выделил их как post-deploy human-задачи.

---

## Gaps Summary

**Блокирующих гэпов нет.**

Все 6 must-have truths, 11 артефактов и 7 key links подтверждены прямым чтением кода (не по заявлениям SUMMARY), совпадением с планом формула-в-формулу, зелёными тестами (61/61 релевантных + 945/987 общих с 42 доказанно пред-существующими чужими падениями), чистым `tsc`, и live-проверкой прода по SSH (правильный HEAD-коммит, применённая миграция с точной схемой из 9 колонок, применённый seed AppSetting).

Единственный пункт, требовавший углублённой самостоятельной проверки — риск-отклонение `daysInStock`/`avgSalesSpeed7d` (без `/7`) — подтверждён как ПРАВИЛЬНЫЙ трассировкой семантики поля через `lib/wb-api.ts:fetchOrdersPerWarehouse` → `app/api/wb-sync/route.ts` → независимый код `totalAvgSalesSpeed` в том же `page.tsx`. Буквальная формула плана (`/7`) была бы багом; фактическая реализация — исправление, а не отклонение с ущербом.

Срез по стоку (спека §5) корректно НЕ реализован, как и требовалось.

Статус `human_needed` (не `passed`) отражает то, что финальное визуальное/интерактивное подтверждение (рендер столбцов, живой клик по кнопке тарифов, realtime модалка) физически требует браузерной сессии — это согласуется с прецедентом `.planning/phases/07-prices-wb/07-VERIFICATION.md` в этом же проекте для аналогичного класса UI-фич.

---

*Verified: 2026-07-07T13:49:10Z*
*Verifier: Claude (gsd-verifier)*
