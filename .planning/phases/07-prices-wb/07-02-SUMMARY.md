---
phase: 07-prices-wb
plan: 02
subsystem: pricing
tags: [pricing, unit-economics, pure-function, tdd, vitest, golden-test]

requires:
  - phase: 07-00
    provides: vitest infrastructure, tests/pricing-math.test.ts RED stub
provides:
  - lib/pricing-math.ts — pure function calculatePricing + 3 fallback resolvers
  - COLUMN_ORDER (30 колонок) для плана 07-07 (PriceCalculatorTable)
  - Golden test nmId 800750522 GREEN (profit ≈ 567.683 ₽)
  - Fallback chain resolvers для ДРР/брака/доставки
affects: [07-07, 07-08, 07-09]

tech-stack:
  added: []
  patterns:
    - "Pure TypeScript module без зависимостей (Next.js/React/Prisma)"
    - "Compile-time length assertion через conditional type"
    - "TDD golden test по canonical Excel"

key-files:
  created:
    - lib/pricing-math.ts
  modified:
    - tests/pricing-math.test.ts
    - tests/pricing-fallback.test.ts

key-decisions:
  - "Формулы calculatePricing выведены из raw Excel cell formulas (не из template-строки), эквайринг/комиссия/ДРР/джем/кредит/общие/налог все имеют базу [Цена продавца]"
  - "COLUMN_ORDER = 30 элементов без 'Фото' (Фото обрабатывается rowSpan-группировкой в таблице 07-07)"
  - "creditPct в golden test = 3 (из Excel row), а не 7 (ошибка плана/WAVE0 notes) — production будет использовать AppSetting.wbCreditPct"
  - "Zero guards встроены в calculatePricing: sellerPrice=0 → returnOnSalesPct=0, costPrice=0 → roiPct=0, priceBeforeDiscount<0 → clamp to 0"

patterns-established:
  - "Pricing pure function: одна source of truth для server (RSC) и client (realtime)"
  - "Golden test validation: любое изменение формул мгновенно сверяется с Excel-эталоном"
  - "Fallback chain resolvers: отдельные функции для каждого поля (ДРР/брак/доставка)"

requirements-completed:
  - PRICES-05
  - PRICES-09

duration: 25min
completed: 2026-04-10
---

# Phase 7 Plan 02: Pricing Math Pure Function Summary

**Pure TypeScript функция `calculatePricing` — source of truth формул юнит-экономики WB, валидированная golden test'ом nmId 800750522 против canonical Excel**

## Performance

- **Duration:** ~25 мин
- **Started:** 2026-04-10T10:06:00Z
- **Completed:** 2026-04-10T10:30:00Z
- **Tasks:** 1 (TDD one-task план)
- **Files modified:** 3 (lib/pricing-math.ts создан, 2 теста дополнены/выровнены)

## Accomplishments

- `lib/pricing-math.ts` (402 строки) — чистая TypeScript функция без зависимостей
- 18 выходных полей расчёта, 30-элементный `COLUMN_ORDER` для рендера таблицы
- Golden test nmId 800750522 GREEN на первом же запуске (34 теста вместе с zero-guards и fallback chain)
- 3 fallback resolver'а: `resolveDrrPct`, `resolveDefectRatePct`, `resolveDeliveryCostRub` с цепочкой Product override → default → hardcoded
- Hardcoded константы экспортированы: `HARDCODED_DRR_PCT=10`, `HARDCODED_DEFECT_RATE_PCT=2`, `HARDCODED_DELIVERY_COST_RUB=30`
- Реальные формулы выведены напрямую из Excel cell formulas (`I17*Q17`, `I17*3%`, `V17-W17-X17-Y17-Z17-AA17-AB17`), а не из template-строки

## Task Commits

Каждая задача атомарный коммит (`--no-verify` для параллельного выполнения с 07-00/07-01):

1. **Task 1: Реализовать lib/pricing-math.ts + тесты** — `9947e93` (feat)
   - Создан `lib/pricing-math.ts` с 18 выходными полями
   - Созданы `tests/pricing-math.test.ts` и `tests/pricing-fallback.test.ts`
   - 32 теста GREEN
2. **Refactor: выровнять COLUMN_ORDER с WAVE0 (30 колонок)** — `6a78660` (refactor)
   - COLUMN_ORDER: 31 → 30 (убрана «Фото», обрабатывается rowSpan)
   - Добавлен тест с ненулевым clubDiscountPct
   - 34 теста GREEN

**Plan metadata:** финальный коммит с SUMMARY + state updates будет создан орчестратором.

## Files Created/Modified

- `lib/pricing-math.ts` **(created, 402 строки)** — pure function `calculatePricing`, 3 fallback resolver'а, `COLUMN_ORDER` (30), hardcoded константы, полная документация формул
- `tests/pricing-math.test.ts` **(created, 179 строк)** — golden test + zero guards + club discount test + COLUMN_ORDER проверки
- `tests/pricing-fallback.test.ts` **(created, 83 строки)** — все три resolver'а по трём веткам fallback chain

## Формулы calculatePricing (выведены из Excel cell formulas)

Источник: `C:/Users/User/Desktop/Форма управления ценами.xlsx`, row 17 (1-indexed), 0-based row 16.

| # | Поле | Формула | Golden значение |
|---|------|---------|-----------------|
| 1 | `sellerPrice` | `priceBeforeDiscount × (1 - sellerDiscountPct/100)` | 7749.9 |
| 2 | `priceAfterWbDiscount` | `sellerPrice × (1 - wbDiscountPct/100)` | 5812.425 |
| 3 | `priceAfterClubDiscount` | `priceAfterWbDiscount × (1 - clubDiscountPct/100)` | 5812.425 (club=0) |
| 4 | `priceAfterWallet` | `priceAfterClubDiscount × (1 - walletPct/100)` | 5696.1765 |
| 5 | `walletAmount` | `priceAfterClubDiscount × walletPct/100` | 116.2485 |
| 6 | `acquiringAmount` | **`sellerPrice × acquiringPct/100`** | 209.2473 |
| 7 | `commissionAmount` | **`sellerPrice × commFbwPct/100`** | 2524.917 |
| 8 | `drrAmount` (Реклама) | `sellerPrice × drrPct/100` | 774.99 |
| 9 | `jemAmount` | `sellerPrice × jemPct/100` | 77.499 |
| 10 | `clubDiscountAmount` | `priceAfterWbDiscount × clubDiscountPct/100` | 0 |
| 11 | `transferAmount` | `sellerPrice - clubDiscountAmount - acquiringAmount - commissionAmount - drrAmount - jemAmount` | 4163.246 |
| 12 | `defectAmount` | `costPrice × defectRatePct/100` | 44.08 |
| 13 | `deliveryAmount` | `deliveryCostRub` (фикс.) | 30 |
| 14 | `creditAmount` | **`sellerPrice × creditPct/100`** | 232.497 (@ 3%) |
| 15 | `overheadAmount` | **`sellerPrice × overheadPct/100`** | 464.994 |
| 16 | `taxAmount` | **`sellerPrice × taxPct/100`** | 619.992 |
| 17 | `profit` | `transferAmount - costPrice - defectAmount - deliveryAmount - creditAmount - overheadAmount - taxAmount` | **567.683** |
| 18 | `returnOnSalesPct` | `profit / sellerPrice × 100` (0 если sellerPrice=0) | 7.33% |
| 19 | `roiPct` | `profit / costPrice × 100` (0 если costPrice=0) | 25.76% |

**Ключевое уточнение по базам формул** (жирным в таблице): `acquiringAmount`, `commissionAmount`, `creditAmount`, `overheadAmount`, `taxAmount` — ВСЕ считаются от `sellerPrice` (Цены продавца), не от `priceAfterWbDiscount` или `priceAfterWallet`. Это подтверждено raw Excel cell formulas (`I17*2.7%`, `I17*Q17`, `I17*3%` и т.д.).

## COLUMN_ORDER (30 колонок для 07-07)

Источник: Excel row 9 (заголовки), без колонки «Фото» (обрабатывается через `rowSpan`).

```
0: Сводка              | 10: Цена со скидкой WB   | 20: К перечислению
1: Статус цены          | 11: WB Клуб              | 21: Закупка, руб.
2: Ярлык                | 12: Цена со скидкой клуба | 22: Брак, руб.
3: Артикул              | 13: Кошелёк              | 23: Доставка, руб.
4: Процент выкупа       | 14: Цена с кошельком     | 24: Кредит, руб.
5: Цена для установки   | 15: Эквайринг            | 25: Общие расходы
6: Скидка продавца      | 16: Комиссия, %          | 26: Налог, руб.
7: Цена продавца        | 17: Комиссия, руб.        | 27: Прибыль, руб.
8: Скидка WB            | 18: ДРР, %               | 28: Re продаж, %
9: Цена со скидкой WB   | 19: Реклама, руб.        | 29: ROI, %
```

Compile-time assertion: `(typeof COLUMN_ORDER)["length"] extends 30 ? true : never`.

## Decisions Made

1. **creditPct в golden test = 3**, а не 7. Excel cell `Z17` содержит буквально `I17*3%`, поэтому creditAmount=232.497. План 07-02 и WAVE0 notes ошибочно указывали 7%. Production код использует `sellerPrice × creditPct/100` где creditPct приходит из `AppSetting.wbCreditPct` (будет 7% в production).
2. **COLUMN_ORDER = 30** (без «Фото»), соответствует WAVE0 notes. Исходно реализовал 31 (включая «Фото»), поправил в refactor коммите.
3. **Базы формул выведены из raw Excel cell formulas**, а не из template-строки Excel. Template говорит «[Цена продавца]-[скидка WB клуба]-...», но реальная формула `V17 = I17-P17-R17-T17-U17` не содержит члена clubDiscount. Моя реализация всё равно вычитает `clubDiscountAmount` в `transferAmount` (для корректной работы при ненулевом clubDiscount), и в golden row это даёт идентичный результат т.к. clubDiscountAmount=0.
4. **Zero guards на priceBeforeDiscount** через `Math.max(0, ...)`: отрицательные входы округляются до 0, предотвращая отрицательные цены.
5. **Pure TypeScript module**: 0 импортов (подтверждено `grep -c "^import" lib/pricing-math.ts = 0`). Модуль безопасно использовать и на сервере (RSC), и на клиенте (realtime модалка).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] План использовал неверную формулу для `transferAmount`**
- **Found during:** Task 1 (Реализация calculatePricing)
- **Issue:** Плановая формула `transferAmount = priceAfterWallet - acquiringAmount - commissionAmount - drrAmount - jemAmount` даёт 2225₽, что не совпадает с Excel golden 4163.246₽
- **Fix:** Выведена реальная формула из Excel cell `V17 = I17-P17-R17-T17-U17` = `sellerPrice - acquiring - commission - drr - jem` (+ `- clubDiscountAmount` для ненулевого clubDiscount). База — sellerPrice, не priceAfterWallet
- **Files modified:** lib/pricing-math.ts
- **Verification:** Golden test profit=567.683 GREEN
- **Committed in:** 9947e93

**2. [Rule 1 - Bug] План указал `creditPct: 7` в golden inputs, но Excel использует 3%**
- **Found during:** Task 1 (Проверка golden test)
- **Issue:** Плановые inputs дают profit ≈ 257.69 при creditPct=7, не 567.68. Excel cell `Z17 = I17*3%` → creditAmount=232.497
- **Fix:** В golden test inputs `creditPct=3` (матч Excel). Формула остаётся универсальной `sellerPrice × creditPct/100`. Production в AppSetting будет 7%, calculatePricing сработает корректно для любого значения
- **Files modified:** tests/pricing-math.test.ts
- **Verification:** Golden test profit=567.683 GREEN
- **Committed in:** 9947e93

**3. [Rule 1 - Bug] План указал базу для acquiring/commission как `priceAfterWallet`/`priceAfterWbDiscount`, Excel использует `sellerPrice`**
- **Found during:** Task 1 (Проверка промежуточных значений)
- **Issue:** Комиссия = `priceAfterWbDiscount × commFbwPct = 5812.425 × 0.3258 = 1893.69` ≠ Excel значение 2524.917. Excel cell `R17 = I17*Q17` = `sellerPrice × commFbwPct` = 2524.917
- **Fix:** Все % расходы (acquiring/commission/drr/jem/credit/overhead/tax) привязаны к `sellerPrice`
- **Files modified:** lib/pricing-math.ts
- **Verification:** Все промежуточные значения совпали с Excel в первом запуске тестов
- **Committed in:** 9947e93

**4. [Rule 3 - Blocking] Test файлы отсутствовали при старте (07-00 ещё не закончил параллельно)**
- **Found during:** Task 1 (Попытка запустить tests)
- **Issue:** Плановое depends_on 07-00 нарушено в параллельном режиме — `tests/pricing-math.test.ts` и `tests/pricing-fallback.test.ts` не существовали
- **Fix:** Создал собственные версии test файлов по контракту из плана 07-02 (должны быть идемпотентными с 07-00 версиями)
- **Files modified:** tests/pricing-math.test.ts, tests/pricing-fallback.test.ts
- **Verification:** 34 теста GREEN
- **Committed in:** 9947e93

**5. [Rule 1 - Bug] COLUMN_ORDER изначально имел 31 элемент (включая «Фото»)**
- **Found during:** После прочтения 07-WAVE0-NOTES.md (07-00 закончил позже)
- **Issue:** Excel имеет 31 колонку, но WAVE0 notes указывают: «Фото» обрабатывается rowSpan-группировкой и не входит в `COLUMN_ORDER`. Правильный COLUMN_ORDER = 30 элементов
- **Fix:** Убрал «Фото» из COLUMN_ORDER, обновил compile-time assertion на `extends 30`, обновил тест
- **Files modified:** lib/pricing-math.ts, tests/pricing-math.test.ts
- **Verification:** `expect(COLUMN_ORDER).toHaveLength(30)` passes
- **Committed in:** 6a78660

---

**Total deviations:** 5 auto-fixed (3 bug-fixes по формулам, 1 blocking-fix недостающих файлов, 1 rule-1 bug alignment)
**Impact on plan:** Все отклонения ОБЯЗАТЕЛЬНЫ для корректности. Golden test защитит от регрессий в будущих фазах.

## Known Stubs

Нет. `lib/pricing-math.ts` полностью функционален; используется в планах 07-08 (RSC таблица) и 07-09 (модалка).

## Issues Encountered

1. **Параллельное выполнение с 07-00**: 07-00 создавал тест-файлы и `vitest.config.ts` одновременно с моим планом. В результате первый коммит `9947e93` захватил вместе с `lib/pricing-math.ts` и файлы 07-00 (WAVE0 notes, fixture, package.json/lock). Это не повредило семантике — коммит атомарно содержит и инфраструктуру vitest, и pricing-math модуль. 07-00 свой коммит сделал следующим (`d25e67b`), добавив оставшиеся RED stubs тестов.
2. **CRLF warnings** от git при коммите — Windows line-ending нормализация. Не критично.

## Self-Check: PASSED

- [x] `lib/pricing-math.ts` существует: FOUND
- [x] `tests/pricing-math.test.ts` существует: FOUND
- [x] `tests/pricing-fallback.test.ts` существует: FOUND
- [x] Commit `9947e93`: FOUND (feat pricing-math)
- [x] Commit `6a78660`: FOUND (refactor COLUMN_ORDER)
- [x] 34 теста GREEN (golden + zero-guards + club discount + fallback chain)
- [x] `grep -c "^import" lib/pricing-math.ts` = 0 (pure module)
- [x] COLUMN_ORDER.length = 30

## Next Phase Readiness

**Ready for 07-07, 07-08, 07-09:**
- `calculatePricing` импортируется любым компонентом — server (RSC) или client (realtime модалка).
- `COLUMN_ORDER` готов к использованию в `PriceCalculatorTable` (план 07-07).
- Fallback resolvers готовы к использованию при чтении `Product.drrOverridePct` / `Subcategory.defaultDrrPct` и т.д.
- Golden test защищает все последующие изменения от регрессий формул.

**Блокеры:** Нет.

---
*Phase: 07-prices-wb*
*Plan: 02*
*Completed: 2026-04-10*
