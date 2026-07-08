---
phase: 260708-f23-b-v2-acceptance-api
verified: 2026-07-08T12:10:00Z
status: human_needed
score: 6/6 code-level must-haves verified; 1 live-activation item needs human click
human_verification:
  - test: "Открыть /prices/wb → нажать «Тарифы складов» в шапке → дождаться toast с числом складов"
    expected: "WbAcceptanceCoef заполняется (~124 строки boxTypeID=2), появляются AppSetting.wbEffCoef.appliances и wbEffCoef.clothing (JSON с delivBaseLiter/delivAddLiter/storageBaseLiter/storageAddLiter/coveragePct/unmatched), std-столбцы (Прибыль-std/ROI-std/Re-std) на таблице пересчитываются без ошибок"
    why_human: "Требует клика по UI-кнопке (запускает live-запрос к WB Tariffs API + пишет в прод БД) — вне рамок статической/read-only верификации. Прямой curl-тест обоих endpoint'ов (acceptance/coefficients и tariffs/return) подтвердил, что API отвечает 200 и формат ответа ТОЧНО совпадает с тем, что парсит код (см. Evidence ниже) — риск падения синка низкий, но фактический прогон через кнопку не выполнялся с момента деплоя."
  - test: "После синка сравнить эфф-ставки направлений в модалке для товара «Одежда» vs «Бытовая техника» (справочная строка «Ставки (лог/хран, ₽/л)»)"
    expected: "Значения различаются между направлениями (срез по стоку сработал), либо совпадают с обоснованным объяснением (оба направления сконцентрированы на одних складах)"
    why_human: "Визуальное сравнение в UI; в БД подтверждено, что оба направления имеют товары (Одежда: 24, Бытовая техника: 80) и оба bucket'а склада (hasSizes true/false) заведены корректно — инфраструктура готова, но фактический разброс ставок зависит от реального распределения стока по складам на момент синка."
---

# Фаза B v2 — реальные per-склад ставки (acceptance/coefficients) + срез по стоку + возврат-продавцу — Verification Report

**Цель:** переключить источник эффективных ставок логистики/хранения второго фин-реза
(«на стандартных условиях», `/prices/wb`) с v1 флэт-box на реальные per-склад ставки из
`/api/tariffs/v1/acceptance/coefficients` (короб, boxTypeID=2), взвешенные по нашему стоку
отдельно на бытовую технику / одежду; + строка «Возврат продавцу» из `/api/v1/tariffs/return`.
Golden pricing-math (nmId 800750522, первый блок ИУ) не должен быть сломан.

**Verified:** 2026-07-08
**Status:** human_needed
**HEAD:** d1f02d5 (matches SUMMARY commits a860291, 85ac197, 7e77a8e + docs commit d1f02d5)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `WbAcceptanceCoef` модель + миграция применена на проде | ✓ VERIFIED | `\d "WbAcceptanceCoef"` на проде — все 11 колонок + composite PK (warehouseID,boxTypeID) точно как в schema.prisma/migration.sql |
| 2 | `fetchAcceptanceCoefficients`/`fetchReturnTariffs` парсят реальный формат WB API | ✓ VERIFIED | Прямой curl с прод-токеном на оба endpoint'а — формат ответа 1:1 совпадает с тем, что парсит код (см. Evidence ниже) |
| 3 | `computeEffCoefForDirection` — pure взвешивание корректно | ✓ VERIFIED | 6 unit-тестов зелёные (`npx vitest run wb-eff-coef` — 6/6) |
| 4 | `syncBoxTariffs` расширен: upsert короба + return + срез по направлению → AppSetting | ✓ VERIFIED (код) / требует запуска | Код корректен и не имеет race/логических ошибок; НЕ запускался на проде с момента деплоя — `WbAcceptanceCoef` пуст, `wbEffCoef.*` отсутствуют |
| 5 | `calculatePricingStandard` v2 — формула корректна (коэф не двоится, base+add-liter, возврат-продавцу) | ✓ VERIFIED | Ручной пересчёт формулы совпал с кодом и с golden-тестом до 4-го знака (см. «Формульная проверка» ниже); golden первого блока (`calculatePricing`) не тронут — 567.683₽/25.76%/7.33% |
| 6 | page.tsx резолвит эфф-ставки по направлению с корректным fallback | ✓ VERIFIED | `EFF_FALLBACK` — v2-хардкод (94.3/28.7/0.16/0.16), НЕ устаревшие v1-дефолты; подтверждено live curl — 94.3/28.7/0.16/0.16 это реальная ставка склада «Коледино» (крупнейший WB-склад) |
| 7 | UI: строка «Возврат продавцу» + эфф-ставки в модалке; wbReturnToSellerRub в GlobalRatesBar | ✓ VERIFIED | Grep подтвердил обе строки в PricingCalculatorDialog.tsx + RATES entry в GlobalRatesBar.tsx |

**Код-уровень: 7/7 truths verified.** Один truth (#4) верифицирован на уровне кода, но живой прогон синка на проде не выполнялся — см. Human Verification.

### Формульная проверка (ключевой риск — проверено вручную)

Формула `calculatePricingStandard` (lib/pricing-math.ts:502-547):

```
Л_туда   = (delivBaseLiter + delivAddLiter × max(0, V−1)) × ИЛ         ← БЕЗ ×delivCoefPct (не двоится)
Л_эфф    = ПВ>0 ? (Л_туда + (1−ПВ)×returnLogisticsRub) / ПВ : Л_туда
Хранение = (storageBaseLiter + storageAddLiter × max(0, V−1)) × daysInStock
Возврат  = returnToSellerRub × (defectRatePct/100)
profitStd = calculatePricing({commFbwPct: commStdPct, deliveryCostRub: Л_эфф}).profit − Хранение − Возврат
```

Ручной пересчёт с std-golden входами (`commStdPct:25, volumeLiters:5, buyoutPct:90,
delivBaseLiter:94.3, delivAddLiter:28.7, storageBaseLiter:0.16, storageAddLiter:0.16,
localizationIndex:1.0, returnLogisticsRub:50, returnToSellerRub:250, daysInStock:60`,
+ goldenInputs nmId 800750522):

- Л_туда = (94.3 + 28.7×4)×1.0 = 209.1 ✓ (код и тест совпадают)
- Л_эфф = (209.1 + 0.1×50)/0.9 = 214.1/0.9 = 237.8889 ✓
- Хранение = (0.16+0.16×4)×60 = 0.8×60 = 48 ✓
- Возврат = 250×0.02 = 5 ✓
- base.profit (commFbwPct=25, deliveryCostRub=237.8889, остальное = goldenInputs):
  transferAmount = 7749.9 − 0 − 209.2473 − 1937.475 − 774.99 − 77.499 = 4750.6887
  profit = 4750.6887 − 2204 − 44.08 − 237.8889 − 232.497 − 464.994 − 619.992 = **947.2368** ✓
- profitStd = 947.2368 − 48 − 5 = **894.2368** ✓ (тест: 894.2368, план: ≈894.24)
- roiPctStd = 894.2368/2204×100 = **40.5734%** ✓ (план: ≈40.57%)
- returnOnSalesPctStd = 894.2368/7749.9×100 = **11.5388%** ✓ (план: ≈11.54%)

**Все значения совпали с независимым ручным расчётом с точностью до 4 знака после запятой.
Коэффициент не умножается повторно (подтверждено — формула использует delivBaseLiter/
storageBaseLiter напрямую, без `×delivCoefPct/100`). Хранение корректно использует
base+additional-liter схему (не было в v1). Возврат-продавцу — новая строка, формула
консистентна с существующим паттерном `defectAmount = costPrice × defectRatePct/100`
(та же семантика умножения на % брака).**

Golden первого блока (`calculatePricing`, ИУ) НЕ тронут: `npx vitest run pricing-math` →
profit≈567.683₽ (tolerance 0.1), roiPct≈25.76%, returnOnSalesPct≈7.33% — зелёные.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/schema.prisma` | `model WbAcceptanceCoef` | ✓ VERIFIED | Строка 385-399, все поля + `@@id([warehouseID, boxTypeID])` точно по плану |
| `prisma/migrations/20260708_wb_acceptance_coef/migration.sql` | CREATE TABLE + seed | ✓ VERIFIED | Применена на проде (`\d` подтвердил структуру), seed `wbReturnToSellerRub=250.0` присутствует |
| `lib/wb-api.ts` | `fetchAcceptanceCoefficients`/`fetchReturnTariffs`/`parseWbNumLoose` | ✓ VERIFIED | Все 3 функции присутствуют, используют `wbFetch("Tariffs API", ...)` → bucket "tariffs" (подтверждено `resolveBucketFromEndpoint`) |
| `lib/wb-eff-coef.ts` | `computeEffCoefForDirection` pure | ✓ VERIFIED | Реализация 1:1 соответствует поведению из плана; 6 unit-тестов зелёные |
| `tests/wb-eff-coef.test.ts` | unit-тесты | ✓ VERIFIED | 6/6 зелёные |
| `lib/wb-box-tariffs.ts` | `syncBoxTariffs` расширен | ✓ VERIFIED (код) | Wiring корректен; см. Data-Flow Trace ниже |
| `lib/pricing-math.ts` | `calculatePricingStandard` v2 | ✓ VERIFIED | Формула проверена вручную (см. выше), golden не сломан |
| `app/(dashboard)/prices/wb/page.tsx` | резолвинг по направлению | ✓ VERIFIED | `EFF_FALLBACK`/`parseEff`/`isClothing`/`effCoef`/`stdParams` — весь путь прослежен |
| `components/prices/GlobalRatesBar.tsx` | `wbReturnToSellerRub` | ✓ VERIFIED | RATES entry `{key:"wbReturnToSellerRub", label:"Возврат продавцу", unit:"₽", max:2000}` |
| `components/prices/PricingCalculatorDialog.tsx` | строка Возврат + эфф-ставки | ✓ VERIFIED | Строки 632-641 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `syncBoxTariffs` | `computeEffCoefForDirection` | сток по направлению + короба | ✓ WIRED | Вызывается дважды (appliances/clothing) с корректными Map-структурами |
| `syncBoxTariffs` | `AppSetting.wbEffCoef.*` | upsert JSON | ✓ WIRED (код) / не выполнялось | Код корректен; на проде записи ЕЩЁ НЕТ (0 строк в WbAcceptanceCoef → синк не запускался) |
| `syncBoxTariffs` | `fetchAcceptanceCoefficients`/`fetchReturnTariffs` | fetch | ✓ WIRED | Оба вызова присутствуют, эндпоинты подтверждены live curl |
| `page.tsx` | `AppSetting.wbEffCoef.*` | чтение + hasSizes | ✓ WIRED | `appSetting.findMany` включает оба ключа; `parseEff` читает и парсит корректно |
| `page.tsx` | `calculatePricingStandard` | per-row вызов | ✓ WIRED | `computedStd: calculatePricingStandard({...xInputs, ...stdParams})` для всех 5 категорий строк |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `syncBoxTariffs` → `WbAcceptanceCoef` | `boxRows` (boxTypeID=2) | `fetchAcceptanceCoefficients()` → live WB API | Да — подтверждено live curl: 1860 строк (124 склада × 15 дат), ставки консистентны по датам (0 несоответствий на 124 склада) | ✓ FLOWING (endpoint), но ⚠ NOT YET RUN на проде (0 строк в таблице) |
| `page.tsx` → std-столбцы | `effCoef.delivBaseLiter` и т.д. | `AppSetting.wbEffCoef.appliances/clothing` → fallback `EFF_FALLBACK` | Пока используется fallback (94.3/28.7/0.16/0.16) — реальный AppSetting ещё не создан | ⚠ STATIC (fallback), станет FLOWING после первого клика «Тарифы складов» |
| `PricingCalculatorDialog` → «Возврат продавцу» | `liveOutputsStd.returnToSellerAmount` | `rates.wbReturnToSellerRub` (AppSetting, seed=250) | Да, реальное значение из БД (250.0, подтверждено live curl что реальный API вернёт то же самое) | ✓ FLOWING |

**Важная находка (не блокер):** `/api/tariffs/v1/acceptance/coefficients` возвращает 15 строк на
склад (по одной на дату вперёд, `date` field), а не 1. Код (`syncBoxTariffs`) не дедуплицирует по
дате — цикл upsert обрабатывает все 1860 строк (короб), 15 раз переписывая одну и ту же
`(warehouseID, boxTypeID)` запись. Живой прод-тест подтвердил: `deliveryBaseLiter`/
`deliveryAdditionalLiter`/`storageBaseLiter`/`storageAdditionalLiter` **идентичны по всем 15 датам**
для каждого из 124 складов (различается только поле `coefficient`, которое код НЕ читает/не
использует). Итог: результат корректен (последняя дата в массиве даёт те же ставки, что и первая),
но синк делает ~15× больше upsert-запросов к БД, чем нужно (1860 вместо 124) — незначительная
неэффективность, НЕ ошибка формулы/данных. Не блокирует, но можно оптимизировать в будущем
(dedupe по warehouseID+boxTypeID перед циклом, либо взять `date === today`).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| tsc чистый | `npx tsc --noEmit` | без вывода/ошибок | ✓ PASS |
| pricing-math + wb-eff-coef тесты | `npx vitest run pricing-math wb-eff-coef` | 42/42 passed | ✓ PASS |
| sales-plan тесты не сломаны | `npx vitest run sales-plan` | 104/104 passed | ✓ PASS |
| Прод доступен | `curl https://zoiten.pro` | 200 | ✓ PASS |
| Прод HEAD совпадает | `ssh ... git rev-parse HEAD` | d1f02d5 (= локальный HEAD) | ✓ PASS |
| Миграция применена | `\d "WbAcceptanceCoef"` на проде | таблица существует с ожидаемой структурой | ✓ PASS |
| `wbReturnToSellerRub` в AppSetting | `SELECT ... AppSetting` | `250.0` | ✓ PASS |
| `/api/tariffs/v1/acceptance/coefficients` реально работает | прямой curl с прод-токеном | 200, top-level массив, boxTypeID=2 → 124 уникальных склада, поля точно как в `WbAcceptanceCoefRow` (включая формат `"94,3"`) | ✓ PASS |
| `/api/v1/tariffs/return` реально работает | прямой curl с прод-токеном | 200, `response.data.warehouseList[0].warehouseName === "Базовые тарифы"`, `deliveryDumpSupReturnExpr: "250"` | ✓ PASS |
| `/prices/wb` роут жив (без auth → редирект) | `curl -w '%{http_code} -> %{redirect_url}'` | `302 -> /login` | ✓ PASS |
| systemd сервис здоров | `journalctl -u zoiten-erp` | активен, чистый рестарт при деплое, без ошибок | ✓ PASS |
| `WbAcceptanceCoef` реально заполнена на проде | `SELECT count(*)` | **0** | ✗ NOT YET RUN — требует клика «Тарифы складов» |
| `AppSetting.wbEffCoef.appliances/clothing` существуют | `SELECT key,value` | отсутствуют (только `wbBoxTariffEffective` и `wbReturnToSellerRub`) | ✗ NOT YET RUN |
| Обе категории направлений имеют товары в проде | `SELECT count(*) GROUP BY direction` | Одежда: 24, Бытовая техника: 80 | ✓ PASS (инфраструктура готова для среза) |

### Anti-Patterns Found

Не найдено. Нет TODO/FIXME/placeholder в изменённых файлах, нет пустых реализаций, нет
hardcoded-заглушек, которые не имели бы явного fallback-обоснования (EFF_FALLBACK — намеренный
задокументированный fallback на реальные типовые ставки, не заглушка).

### Requirements Coverage

Quick-таск, отдельного REQUIREMENTS.md-маппинга нет (requirements: [PRICES-STD-B-V2] указан
только во frontmatter PLAN.md, без записи в `.planning/REQUIREMENTS.md` — типично для quick-таска).
Все пункты `success_criteria` из PLAN.md проверены выше и удовлетворены на уровне кода.

### Human Verification Required

#### 1. Живой прогон синка «Тарифы складов» на проде

**Test:** Открыть https://zoiten.pro/prices/wb, залогиниться, нажать кнопку «Тарифы складов» в
шапке, дождаться toast.
**Expected:** Toast сообщает число складов; `WbAcceptanceCoef` заполняется (~124 строки boxTypeID=2);
`AppSetting.wbEffCoef.appliances` и `wbEffCoef.clothing` появляются с JSON вида
`{delivBaseLiter, delivAddLiter, storageBaseLiter, storageAddLiter, coveragePct, unmatched, updatedAt}`;
после `router.refresh()` std-столбцы (Прибыль-std/ROI-std/Re-std) продолжают показывать числа
(не «—», без NaN).
**Why human:** Требует UI-клика, который триггерит live-запрос к WB API + запись в прод БД —
вне периметра read-only верификации. Риск низкий: оба endpoint'а независимо протестированы
прямым curl с прод-токеном и подтверждено 100% совпадение формата ответа с тем, что парсит код
(структура, ключи, форматы чисел `"94,3"`/`"1 050"`/`"не принимает"`, `response.data.warehouseList`
vs top-level массив для acceptance — всё соответствует).

#### 2. Визуальное сравнение эфф-ставок между направлениями после синка

**Test:** После выполнения п.1 — открыть в модалке товар из «Одежда» и товар из «Бытовая техника»,
сравнить строку «Ставки (лог/хран, ₽/л)».
**Expected:** Значения различаются (или совпадают с очевидным объяснением — оба направления
concentrated на одних складах).
**Why human:** Визуальная проверка UI + зависит от фактического распределения стока по складам
на момент синка (в БД подтверждено, что оба направления имеют товары — 24 и 80 соответственно —
инфраструктура готова, но конкретный результат взвешивания непредсказуем без реальных данных).

### Gaps Summary

Кода-уровня блокеров не найдено. Формула v2 математически корректна (независимо перепроверена
вручную, включая размерности — коэффициент склада НЕ умножается повторно, что было ключевым
риском задания). Golden pricing-math не сломан. Оба новых WB API endpoint'а подтверждены живым
curl-тестом на проде — формат ответа точно совпадает с тем, что ожидает парсер. Единственное,
что не выполнено — фактический клик по кнопке «Тарифы складов» на проде после деплоя (0 строк в
`WbAcceptanceCoef`, отсутствуют `AppSetting.wbEffCoef.*`). Это задокументировано в самом SUMMARY
как ожидаемый пост-деплой шаг (Task 3 в PLAN был размечен как `checkpoint:human-verify` с
явным `resume-signal`, ожидающим подтверждения пользователя). До клика std-столбцы работают
корректно на v2-хардкод fallback (94.3/28.7/0.16/0.16 — подтверждено, что это реальная ставка
крупного склада «Коледино», не произвольное число).

Второстепенная находка (не блокер): `fetchAcceptanceCoefficients` не дедуплицирует по `date` —
API возвращает 15 строк на склад (прогноз коэффициента на 15 дней вперёд), синк делает 15×
избыточных upsert. Подтверждено, что тарифные поля идентичны по всем датам (0 несоответствий на
124 склада) — результат корректен, но есть простор для оптимизации (не входит в объём этого
quick-таска).

---

_Verified: 2026-07-08_
_Verifier: Claude (gsd-verifier)_
