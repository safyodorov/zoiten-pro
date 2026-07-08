---
phase: quick-260708-lhb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/pricing-math.ts
  - tests/pricing-math.test.ts
  - app/(dashboard)/prices/wb/page.tsx
  - lib/pricing-schemas.ts
  - components/prices/GlobalRatesBar.tsx
  - prisma/migrations/20260708_wb_std_v3_reverse_logistics_irp/migration.sql
  - components/prices/PriceCalculatorTable.tsx
  - components/prices/PricingCalculatorDialog.tsx
  - docs/superpowers/specs/2026-07-07-wb-planned-prices-standard-finres-design.md
autonomous: true
requirements: [QUICK-260708-lhb]

must_haves:
  truths:
    - "Обратная логистика невыкупа считается по объёму (бэнды ≤1л + база+доп-литр для V>1), НЕ плоские 50₽"
    - "Статья «Возврат продавцу» (returnToSellerRub×defect) больше НЕ вычитается из profitStd"
    - "Л_туда включает цено-зависимую надбавку ИРП: sellerPriceForIrp × ИРП%"
    - "ИЛ=1.11 и ИРП=1.56 — редактируемые ставки в GlobalRatesBar (AppSetting)"
    - "Столбец таблицы «Обратная лог.-std, руб.» показывает объёмную обратную логистику"
    - "Модалка показывает «Обратная логистика» + строку ставок с ИЛ/ИРП"
    - "Golden pricing-math (nmId 800750522) остаётся зелёным; std-golden пересчитан под v3 и зелёный"
    - "Прод отвечает curl 200 после detached-деплоя с применёнными миграцией/seed AppSetting"
  artifacts:
    - path: "lib/pricing-math.ts"
      provides: "reverseLogisticsForVolume() + calculatePricingStandard v3 (ИРП надбавка, revLog volume-based, без returnToSeller)"
      contains: "export function reverseLogisticsForVolume"
    - path: "tests/pricing-math.test.ts"
      provides: "band-тесты reverseLogisticsForVolume + пересчитанный std-golden v3"
      contains: "reverseLogisticsForVolume"
    - path: "app/(dashboard)/prices/wb/page.tsx"
      provides: "stdParams v3 (irpPct/reverseLogBaseRub/reverseLogPerLiterRub из rates), RATE_KEYS v3"
      contains: "reverseLogBaseRub"
    - path: "lib/pricing-schemas.ts"
      provides: "3 новых ключа AppSetting (wbReverseLogBaseRub/wbReverseLogPerLiterRub/wbIrpPct) + per-key max"
      contains: "wbIrpPct"
    - path: "components/prices/GlobalRatesBar.tsx"
      provides: "редакторы 3 новых ставок + ИЛ; убраны редакторы Возврат-логистика/Возврат продавцу"
      contains: "wbIrpPct"
    - path: "prisma/migrations/20260708_wb_std_v3_reverse_logistics_irp/migration.sql"
      provides: "seed 3 ключей + UPDATE wbLocalizationIndex→1.11"
      contains: "wbReverseLogBaseRub"
    - path: "components/prices/PriceCalculatorTable.tsx"
      provides: "колонка reverseLogStd (reverseLogisticsAmount) вместо returnToSellerStd + stdContext v3"
      contains: "reverseLogStd"
    - path: "components/prices/PricingCalculatorDialog.tsx"
      provides: "строка «Обратная логистика» + ИЛ/ИРП в справочной строке ставок"
      contains: "Обратная логистика"
  key_links:
    - from: "lib/pricing-math.ts:calculatePricingStandard"
      to: "reverseLogisticsForVolume"
      via: "revLog в формуле logEff"
      pattern: "reverseLogisticsForVolume\\("
    - from: "app/(dashboard)/prices/wb/page.tsx:stdParams"
      to: "calculatePricingStandard"
      via: "irpPct/reverseLogBaseRub/reverseLogPerLiterRub из rates"
      pattern: "irpPct"
    - from: "components/prices/GlobalRatesBar.tsx"
      to: "updateAppSetting"
      via: "новые ключи валидны через pricing-schemas APP_SETTING_KEYS"
      pattern: "updateAppSetting"
    - from: "components/prices/PriceCalculatorTable.tsx"
      to: "row.computedStd.reverseLogisticsAmount"
      via: "рендер колонки reverseLogStd"
      pattern: "reverseLogisticsAmount"
---

<objective>
Std-юнитка `/prices/wb` v3 (Фаза B v3 дизайн-спеки): три уточнения формулы второго
фин-реза «на стандартных условиях» в `calculatePricingStandard`:

1. **Обратная логистика невыкупа — volume-based** по официальной формуле ВБ (бэнды ≤1л +
   база+доп-литр для V>1). Заменяет плоскую ставку `returnLogisticsRub` (50₽).
2. **Убрать ложную статью «Возврат продавцу»** (`returnToSellerRub × defectRatePct/100`) из
   `profitStd` — она дублировала расход и искажала прибыль-std.
3. **Добавить ИРП** (индекс распределения продаж) — цено-зависимую надбавку на логистику
   ТУДА: `+ sellerPriceForIrp × ИРП%`. Значения пользователя: **ИРП=1.56%, ИЛ=1.11**
   (обе ручные AppSetting).

Purpose: привести std-расчёт к реальной механике ВБ (частота возвратов через выкуп, а не
плоский амортизированный возврат; учёт цено-зависимой надбавки распределения).

Output: обновлённое ядро `calculatePricingStandard`, пересчитанный std-golden, редакторы
ставок, объёмная колонка/модалка, миграция-seed, деплой на прод.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/superpowers/specs/2026-07-07-wb-planned-prices-standard-finres-design.md
@.planning/quick/260708-f23-b-v2-acceptance-api/260708-f23-SUMMARY.md
@.planning/quick/260708-h9l-std-prices-wb/260708-h9l-SUMMARY.md

# Ключевые файлы (уже прочитаны планировщиком, executor правит именно их)
@lib/pricing-math.ts
@tests/pricing-math.test.ts
@lib/pricing-schemas.ts
@components/prices/GlobalRatesBar.tsx

<interfaces>
<!-- Контракты, извлечённые из кодовой базы. Executor использует напрямую, без разведки. -->

ТЕКУЩЕЕ состояние calculatePricingStandard (lib/pricing-math.ts:502-547) — v2:
  logTo = (delivBaseLiter + delivAddLiter × max(0,V−1)) × localizationIndex        # БЕЗ ИРП
  logEff = pv > 0 ? (logTo + (1−pv) × returnLogisticsRub) / pv : logTo             # плоский 50₽ → заменить revLog
  storage = (storageBaseLiter + storageAddLiter × max(0,V−1)) × daysInStock
  returnToSeller = returnToSellerRub × (defectRatePct/100)                          # УБРАТЬ
  base = calculatePricing({ ...inputs, commFbwPct: commStdPct, deliveryCostRub: logEff })
  profitStd = base.profit − storage − returnToSeller                               # убрать returnToSeller
  return { ...base, profitStd, roiPctStd, returnOnSalesPctStd, storageAmount,
           logisticsEffAmount, logisticsToAmount, returnToSellerAmount }           # returnToSellerAmount → reverseLogisticsAmount

PricingInputs std-поля (lib/pricing-math.ts:76-101) — сейчас:
  commStdPct?, volumeLiters?, delivBaseLiter?, delivAddLiter?, localizationIndex?,
  returnLogisticsRub?, storageBaseLiter?, storageAddLiter?, daysInStock?, returnToSellerRub?

PricingOutputs std-поля (lib/pricing-math.ts:150-166) — сейчас:
  profitStd?, roiPctStd?, returnOnSalesPctStd?, storageAmount?, logisticsEffAmount?,
  logisticsToAmount?, returnToSellerAmount?

page.tsx stdParams (app/(dashboard)/prices/wb/page.tsx:677-688) — определён ОДИН раз,
переиспользуется для всех 5 типов строк (current/planned/regular/auto/calc) + как stdContext:
  { commStdPct, volumeLiters, delivBaseLiter: effCoef.delivBaseLiter, delivAddLiter: effCoef.delivAddLiter,
    storageBaseLiter: effCoef.storageBaseLiter, storageAddLiter: effCoef.storageAddLiter,
    localizationIndex: rates.wbLocalizationIndex,
    returnLogisticsRub: rates.wbReturnLogisticsRub,   # УБРАТЬ
    returnToSellerRub: rates.wbReturnToSellerRub,     # УБРАТЬ
    daysInStock }
Каждая строка вызывает calculatePricingStandard({ ...rowInputs, ...stdParams }), где rowInputs
несёт priceBeforeDiscount/sellerDiscountPct → ИРП надбавка варьируется per строку автоматически
(rate irpPct общий, цена — из inputs строки).

page.tsx RATE_KEYS/DEFAULT_RATES (строки 53-81) и GlobalRatesBar RateKey/RATES (строки 27-59) —
ДВА независимых объявления одних и тех же 10 ключей; page.tsx:1106 передаёт `rates` в
<GlobalRatesBar initialRates={rates} />, поэтому оба union'а ДОЛЖНЫ совпадать.

pricing-schemas.ts APP_SETTING_KEYS/DEFAULTS/MAX (строки 16-63) — whitelist для updateAppSetting.
GlobalRatesBar.handleChange → updateAppSetting(key, value) отклонит ключ, которого нет в whitelist.

PriceCalculatorTable.tsx:
  - stdContext type (строки 129-140): { commStdPct, volumeLiters, delivBaseLiter, delivAddLiter,
    storageBaseLiter, storageAddLiter, localizationIndex, returnLogisticsRub, returnToSellerRub, daysInStock }
  - std-колонки (5 точек: COLUMN_KEYS ~305-307, DEFAULT_WIDTHS ~349-351, HIDEABLE ~391-393,
    SCROLL_COLUMNS ~429-431, render-row ~1403-1405): logisticsEffStd → storageStd → returnToSellerStd;
    последняя читает row.computedStd?.returnToSellerAmount через fmtMoneyInt (нейтральная amount-ячейка)

PricingCalculatorDialog.tsx (строки 613-643): блок «Стандартные условия» с OutputRow
"Логистика туда"/"Логистика эфф."/"Хранение"/"Возврат продавцу" + справочная строка
row.stdContext.delivBaseLiter.toFixed(1)+...  Realtime: calculatePricingStandard({ ...liveInputs, ...row.stdContext })

prisma AppSetting = KV (key PK, value, updatedAt) — schema.prisma:659-664. Изменений схемы НЕТ.
Миграции создаются ВРУЧНУЮ (нет локальной PG), применяются prisma migrate deploy на VPS.
Precedent seed-only миграции: prisma/migrations/20260708_wb_acceptance_coef/migration.sql (INSERT ... ON CONFLICT DO NOTHING).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: pricing-math.ts — reverseLogisticsForVolume + calculatePricingStandard v3 + пересчёт std-golden</name>
  <files>lib/pricing-math.ts, tests/pricing-math.test.ts</files>
  <behavior>
    reverseLogisticsForVolume(V, baseRub, perLiterRub) — pure, ТОЛЬКО объём (без коэф/ИЛ/ИРП/цены/выкупа):
    - V ≤ 0 → 0
    - 0 < V ≤ 0.2 → 23
    - 0.2 < V ≤ 0.4 → 26
    - 0.4 < V ≤ 0.6 → 29
    - 0.6 < V ≤ 0.8 → 30
    - 0.8 < V ≤ 1.0 → 32
    - V > 1 → baseRub + perLiterRub × (V − 1)     (default baseRub=46, perLiterRub=14)
    Band-тесты (пин): V=0→0, V=0.1→23, V=0.3→26, V=0.5→29, V=0.7→30, V=0.9→32, V=1.0→32,
    V=2→60 (46+14), V=5→102 (46+56).

    calculatePricingStandard v3 (std-golden nmId 800750522 + новые stdParams v3):
    - Л_туда = (94.3 + 28.7×4)×1.11 + 7749.9×(1.56/100) = 209.1×1.11 + 120.89844 = 352.99944
    - Л_обратно(V=5) = 46 + 14×4 = 102
    - Л_эфф = [352.99944 + (1−0.9)×102] / 0.9 = 363.19944/0.9 ≈ 403.5549
    - Хранение = (0.16 + 0.16×4)×60 = 48
    - base.profit (commFbwPct=25, deliveryCostRub=Л_эфф) ≈ 781.5708
    - profitStd = base.profit − Хранение = 781.5708 − 48 ≈ 733.5708  (БЕЗ вычета возврата-продавцу)
    - roiPctStd ≈ 33.28 %, returnOnSalesPctStd ≈ 9.47 %
    Golden первого блока calculatePricing(goldenInputs) БЕЗ std-полей → profit≈567.68, ОСТАЁТСЯ зелёным.
  </behavior>
  <action>
    В lib/pricing-math.ts:

    1. **Добавить pure-хелпер** (экспортировать, для unit-теста), рядом с calculatePricingStandard:
       ```typescript
       /** Обратная логистика невыкупа — ТОЛЬКО объём (офиц. формула ВБ).
        *  Бэнды ≤1л фиксированы (23/26/29/30/32 ₽); V>1 = baseRub + perLiterRub×(V−1).
        *  Выкуп в тариф НЕ входит — входит через частоту в calculatePricingStandard (Л_эфф). */
       export function reverseLogisticsForVolume(
         V: number, baseRub: number, perLiterRub: number,
       ): number {
         if (V <= 0) return 0
         if (V <= 0.2) return 23
         if (V <= 0.4) return 26
         if (V <= 0.6) return 29
         if (V <= 0.8) return 30
         if (V <= 1.0) return 32
         return baseRub + perLiterRub * (V - 1)
       }
       ```

    2. **PricingInputs** (строки 76-101): ДОБАВИТЬ опциональные поля
       `irpPct?` (индекс распределения продаж, % — AppSetting.wbIrpPct),
       `reverseLogBaseRub?` (база обратной лог. для V>1, ₽ — AppSetting.wbReverseLogBaseRub, default 46),
       `reverseLogPerLiterRub?` (доп-литр обратной лог. для V>1, ₽ — AppSetting.wbReverseLogPerLiterRub, default 14).
       УБРАТЬ поля `returnLogisticsRub?` и `returnToSellerRub?` (больше не используются).

    3. **PricingOutputs** (строки 150-166): ДОБАВИТЬ `reverseLogisticsAmount?` (объёмная обратная
       логистика невыкупа, ₽). УБРАТЬ `returnToSellerAmount?`.

    4. **calculatePricingStandard** (строки 502-547) переписать по формуле v3:
       ```typescript
       const irpPct = inputs.irpPct ?? 0
       const reverseLogBaseRub = inputs.reverseLogBaseRub ?? 46
       const reverseLogPerLiterRub = inputs.reverseLogPerLiterRub ?? 14
       // delivBaseLiter/delivAddLiter/storageBaseLiter/storageAddLiter/localizationIndex/daysInStock — как было

       const V = Math.round(Math.max(0, inputs.volumeLiters ?? 0) * 10) / 10
       const pv = (inputs.buyoutPct ?? 100) / 100

       // sellerPriceForIrp — цена продавца ДО СПП (допущение): priceBeforeDiscount×(1−sellerDiscountPct/100)
       const sellerPriceForIrp =
         Math.max(0, inputs.priceBeforeDiscount) * (1 - inputs.sellerDiscountPct / 100)

       // Л_туда = база+доп-литр × ИЛ + цено-зависимая надбавка ИРП
       const logTo =
         (delivBaseLiter + delivAddLiter * Math.max(0, V - 1)) * localizationIndex +
         sellerPriceForIrp * (irpPct / 100)

       // Обратная логистика невыкупа — volume-based (без коэф/ИЛ/ИРП/цены/выкупа)
       const revLog = reverseLogisticsForVolume(V, reverseLogBaseRub, reverseLogPerLiterRub)

       // Выкуп входит через частоту: Л_эфф = [Л_туда + (1−ПВ)×Л_обратно] / ПВ
       const logEff = pv > 0 ? (logTo + (1 - pv) * revLog) / pv : logTo

       const storage = (storageBaseLiter + storageAddLiter * Math.max(0, V - 1)) * daysInStock

       const base = calculatePricing({ ...inputs, commFbwPct: inputs.commStdPct ?? inputs.commFbwPct, deliveryCostRub: logEff })

       const profitStd = base.profit - storage   // БЕЗ − returnToSeller
       const costPrice = Math.max(0, inputs.costPrice)
       const roiPctStd = costPrice > 0 ? (profitStd / costPrice) * 100 : 0
       const returnOnSalesPctStd = base.sellerPrice > 0 ? (profitStd / base.sellerPrice) * 100 : 0

       return { ...base, profitStd, roiPctStd, returnOnSalesPctStd,
         storageAmount: storage, logisticsEffAmount: logEff, logisticsToAmount: logTo,
         reverseLogisticsAmount: revLog }
       ```
       Удалить весь код про `returnToSeller`/`returnToSellerRub`/`returnLogisticsRub`. Обновить
       docstring функции (формула v3, «returnLogisticsRub заменён на volume-based revLog»,
       «ИРП надбавка на Л_туда», «returnToSeller убран»).

    В tests/pricing-math.test.ts:

    5. Импорт: добавить `reverseLogisticsForVolume` в import из "@/lib/pricing-math".

    6. Новый describe-блок «reverseLogisticsForVolume — бэнды объёма» с band-тестами из <behavior>
       (baseRub=46, perLiterRub=14).

    7. Обновить `const stdParams` (строки 205-217): УБРАТЬ `returnLogisticsRub: 50` и
       `returnToSellerRub: 250`; ДОБАВИТЬ `localizationIndex: 1.11` (было 1.0), `irpPct: 1.56`,
       `reverseLogBaseRub: 46`, `reverseLogPerLiterRub: 14`.

    8. Обновить std-golden describe (строки 219-257) под v3-значения из <behavior>:
       - logisticsToAmount ≈ 352.9994 (было 209.1)
       - reverseLogisticsAmount = 102 (переименовать assert из returnToSellerAmount=5)
       - logisticsEffAmount ≈ 403.5549 (было 237.8889)
       - storageAmount = 48 (без изменений)
       - profitStd ≈ 733.5708 (было 894.2368)
       - roiPctStd ≈ 33.28 (было 40.57)
       - returnOnSalesPctStd ≈ 9.47 (было 11.54)
       - out.profit (base) ≈ 781.5708 (было 947.2368)
       Комментарий-шапку блока переписать под пересчёт v3.

    9. Обновить zero-guard «без std-входов» (строки 304-312): заменить проверку
       `out.returnToSellerAmount` на `out.reverseLogisticsAmount` (без volumeLiters → V=0 →
       reverseLogisticsForVolume(0,...) = 0, поэтому `expect(out.reverseLogisticsAmount).toBe(0)`).

    ВАЖНО: calculatePricing (первый блок, ИУ) НЕ ТРОГАТЬ — golden nmId 800750522 остаётся.
    Числа std-golden в <behavior> — ручной пересчёт; ФИНАЛ определяет код: если toBeCloseTo падает
    на последней цифре, скорректировать ожидаемое значение под фактический вывод функции (формула — истина).
  </action>
  <verify>
    <automated>cd "c:/Users/User/zoiten-pro" && npm run test -- pricing-math</automated>
  </verify>
  <done>reverseLogisticsForVolume экспортирован и band-тесты зелёные; std-golden v3 (profitStd≈733.57 / roiStd≈33.28% / reverseLog=102) зелёный; golden первого блока (profit≈567.68) зелёный; returnToSellerAmount отсутствует в PricingOutputs.</done>
</task>

<task type="auto">
  <name>Task 2: rates/settings/migration — page.tsx stdParams v3 + 3 новых AppSetting + GlobalRatesBar + seed-миграция</name>
  <files>app/(dashboard)/prices/wb/page.tsx, lib/pricing-schemas.ts, components/prices/GlobalRatesBar.tsx, prisma/migrations/20260708_wb_std_v3_reverse_logistics_irp/migration.sql</files>
  <action>
    1. **lib/pricing-schemas.ts** — добавить 3 новых ключа в APP_SETTING_KEYS (строки 16-29),
       APP_SETTING_DEFAULTS (35-46), APP_SETTING_MAX (52-63):
       - `wbReverseLogBaseRub`: default 46, max 1000 (₽)
       - `wbReverseLogPerLiterRub`: default 14, max 1000 (₽)
       - `wbIrpPct`: default 1.56, max 100 (%)
       Существующие ключи `wbReturnLogisticsRub`/`wbReturnToSellerRub` ОСТАВИТЬ в whitelist
       (их всё ещё пишет sync `lib/wb-box-tariffs.ts` сырым upsert — не ломать; UI-редакторы убираем в GlobalRatesBar).

    2. **app/(dashboard)/prices/wb/page.tsx**:
       - RATE_KEYS (строки 53-66) и DEFAULT_RATES (70-81): ДОБАВИТЬ `wbReverseLogBaseRub` (46.0),
         `wbReverseLogPerLiterRub` (14.0), `wbIrpPct` (1.56). УБРАТЬ `wbReturnLogisticsRub` и
         `wbReturnToSellerRub` (больше не используются в stdParams). Обновить `wbLocalizationIndex`
         default в DEFAULT_RATES на 1.11.
       - stdParams (строки 677-688): УБРАТЬ `returnLogisticsRub: rates.wbReturnLogisticsRub` и
         `returnToSellerRub: rates.wbReturnToSellerRub`; ДОБАВИТЬ
         `irpPct: rates.wbIrpPct`, `reverseLogBaseRub: rates.wbReverseLogBaseRub`,
         `reverseLogPerLiterRub: rates.wbReverseLogPerLiterRub`. `localizationIndex: rates.wbLocalizationIndex` — остаётся.
       - Блок «3.1 эфф-ставки» (delivBaseLiter/... из wbEffCoef) НЕ трогать.

    3. **components/prices/GlobalRatesBar.tsx**:
       - RateKey union (27-37) и RATES массив (48-59): УБРАТЬ `wbReturnLogisticsRub` и
         `wbReturnToSellerRub` (обе строки RATES + оба члена union). ДОБАВИТЬ:
         `{ key: "wbReverseLogBaseRub", label: "Обр.логистика база", unit: "₽", max: 1000 }`,
         `{ key: "wbReverseLogPerLiterRub", label: "Обр.логистика доп/л", unit: "₽", max: 1000 }`,
         `{ key: "wbIrpPct", label: "ИРП", unit: "%" }`.
         `wbLocalizationIndex` (label "Индекс локализации", unit "×") — ОСТАВИТЬ.
       - Обновить комментарий-шапку файла (Фаза B v3: volume-based обр.логистика + ИРП; убраны
         wbReturnLogisticsRub/wbReturnToSellerRub).
       ⚠ RateKey union'ы в page.tsx и GlobalRatesBar ДОЛЖНЫ совпадать (page.tsx:1106 передаёт rates
       в initialRates) — иначе tsc-ошибка. Проверить оба списка идентичны.

    4. **Создать миграцию** prisma/migrations/20260708_wb_std_v3_reverse_logistics_irp/migration.sql
       (изменений схемы НЕТ — только seed/update AppSetting KV):
       ```sql
       -- Фаза B v3 (2026-07-08): обратная логистика невыкупа volume-based + ИРП + ИЛ=1.11.
       -- База/доп-литр обратной логистики (V>1), ₽; ИРП (индекс распределения продаж), %.
       INSERT INTO "AppSetting" ("key","value","updatedAt") VALUES
         ('wbReverseLogBaseRub','46', now()),
         ('wbReverseLogPerLiterRub','14', now()),
         ('wbIrpPct','1.56', now())
       ON CONFLICT ("key") DO NOTHING;
       -- ИЛ (индекс локализации) — ручное значение пользователя 1.11 (было 1.0).
       UPDATE "AppSetting" SET "value" = '1.11', "updatedAt" = now() WHERE "key" = 'wbLocalizationIndex';
       ```

    Полный `npx tsc --noEmit` здесь ещё КРАСНЫЙ (PriceCalculatorTable/Dialog ещё читают
    returnToSellerAmount / имеют старый stdContext type) — это чинится в Task 3, где стоит
    авторитетный tsc-гейт. Не запускать full tsc как гейт этой задачи.
  </action>
  <verify>
    <automated>cd "c:/Users/User/zoiten-pro" && grep -q "wbIrpPct" lib/pricing-schemas.ts && grep -q "wbReverseLogBaseRub" lib/pricing-schemas.ts && grep -q "reverseLogBaseRub: rates.wbReverseLogBaseRub" "app/(dashboard)/prices/wb/page.tsx" && grep -q "irpPct: rates.wbIrpPct" "app/(dashboard)/prices/wb/page.tsx" && grep -q "wbIrpPct" components/prices/GlobalRatesBar.tsx && ! grep -q "wbReturnToSellerRub" components/prices/GlobalRatesBar.tsx && test -f prisma/migrations/20260708_wb_std_v3_reverse_logistics_irp/migration.sql && grep -q "1.11" prisma/migrations/20260708_wb_std_v3_reverse_logistics_irp/migration.sql && echo STRUCT_OK</automated>
  </verify>
  <done>3 новых ключа в pricing-schemas (KEYS/DEFAULTS/MAX); stdParams использует irpPct/reverseLogBaseRub/reverseLogPerLiterRub из rates и не содержит returnLogisticsRub/returnToSellerRub; GlobalRatesBar имеет редакторы ИРП/обр.логистики + ИЛ и НЕ имеет Возврат-логистика/Возврат продавцу; RATE_KEYS в page.tsx и GlobalRatesBar идентичны; миграция создана с seed 3 ключей + UPDATE ИЛ→1.11.</done>
</task>

<task type="auto">
  <name>Task 3: UI (таблица/модалка) + спека + деплой — reverseLogStd колонка, «Обратная логистика», ИЛ/ИРП, финальные гейты, detached deploy</name>
  <files>components/prices/PriceCalculatorTable.tsx, components/prices/PricingCalculatorDialog.tsx, docs/superpowers/specs/2026-07-07-wb-planned-prices-standard-finres-design.md</files>
  <action>
    1. **components/prices/PriceCalculatorTable.tsx**:
       - stdContext type (строки 129-140): привести в соответствие stdParams v3 — УБРАТЬ
         `returnLogisticsRub` и `returnToSellerRub`; ДОБАВИТЬ `irpPct: number`,
         `reverseLogBaseRub: number`, `reverseLogPerLiterRub: number`. `localizationIndex` — оставить.
       - Переименовать колонку `returnToSellerStd` → `reverseLogStd` во ВСЕХ 5 точках:
         COLUMN_KEYS (~307), DEFAULT_WIDTHS (~351, ширина 130 оставить), HIDEABLE_COLUMN_KEYS (~393),
         SCROLL_COLUMNS (~431, label → "Обратная лог.-std, руб."), render-row массив (~1405).
       - render-row значение: читать `row.computedStd?.reverseLogisticsAmount ?? 0` через `fmtMoneyInt`
         (нейтральная amount-ячейка, как было). Порядок колонок сохранить:
         logisticsEffStd → storageStd → reverseLogStd → profitStd → roiPctStd.
       - Инвариант thead/tbody: число элементов SCROLL_COLUMNS не меняется (rename, не add/remove).

    2. **components/prices/PricingCalculatorDialog.tsx** (блок «Стандартные условия», строки 613-643):
       - Переименовать OutputRow "Возврат продавцу" → "Обратная логистика", значение
         `fmtMoney(liveOutputsStd.reverseLogisticsAmount ?? 0)` (было returnToSellerAmount).
       - В справочную строку ставок (строки 636-642) ДОБАВИТЬ ИЛ и ИРП, например:
         `Ставки: лог {delivBaseLiter}+{delivAddLiter} / хран {storageBaseLiter}+{storageAddLiter} ₽/л · ИЛ {localizationIndex} · ИРП {irpPct}%`
         (использовать `row.stdContext.localizationIndex.toFixed(2)` и `row.stdContext.irpPct.toFixed(2)`).
       - Realtime-вызов `calculatePricingStandard({ ...liveInputs, ...row.stdContext })` (строка 257) НЕ
         менять — liveInputs уже несёт priceBeforeDiscount/sellerDiscountPct (ИРП надбавка пересчитывается
         при правке цены), stdContext несёт irpPct/reverseLog* после Task 2.

    3. **docs/superpowers/specs/2026-07-07-...design.md**: добавить пометку «Фаза B v3 реализована»
       в шапку (строки 3-8) и краткий блок в §4 (после блока v2, строки 78-88): v3 —
       обратная логистика невыкупа volume-based (бэнды ≤1л + база+доп-литр V>1, выкуп через частоту
       Л_эфф), ИРП-надбавка на Л_туда (`+ sellerPriceForIrp×ИРП%`, допущение «цена до СПП»),
       статья «Возврат продавцу» УБРАНА из profitStd; ИЛ=1.11, ИРП=1.56 (ручные AppSetting).

    4. **Финальные гейты** (авторитетные — все файлы теперь консистентны):
       - `npx tsc --noEmit` → 0 ошибок.
       - `npm run test -- pricing-math sales-plan` → зелёные (golden + std-golden v3 + sales-plan регресс).

    5. **Деплой (делегирован, detached)** — по правилам CLAUDE.md, миграция/seed на проде.
       НЕ дёргать WB API в билд-тайме (никаких sync-эндпоинтов при билде).
       ```bash
       cd "c:/Users/User/zoiten-pro"
       git add -A && git commit -m "feat(prices-wb): std-юнитка v3 — обратная логистика volume-based + ИРП, убран возврат-продавцу

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
       git push origin main
       ssh -o ConnectTimeout=20 root@85.198.97.89 "df -h /"   # ≥5GB свободно
       ssh -o ConnectTimeout=20 root@85.198.97.89 "cd /opt/zoiten-pro && nohup bash deploy.sh > /var/log/zoiten-deploy.log 2>&1 &"
       ```
       Следить за `/var/log/zoiten-deploy.log` до `==> Done` (миграция
       20260708_wb_std_v3_reverse_logistics_irp применяется через `prisma migrate deploy` внутри
       deploy.sh — 3 seed-ключа + UPDATE ИЛ→1.11). Затем curl https://zoiten.pro → 200 и journalctl без ошибок.
  </action>
  <verify>
    <automated>cd "c:/Users/User/zoiten-pro" && npx tsc --noEmit && npm run test -- pricing-math sales-plan && grep -q "reverseLogStd" components/prices/PriceCalculatorTable.tsx && grep -q "Обратная логистика" components/prices/PricingCalculatorDialog.tsx && curl -s -o /dev/null -w "%{http_code}" https://zoiten.pro</automated>
  </verify>
  <done>tsc чист (0 ошибок); pricing-math + sales-plan тесты зелёные; колонка reverseLogStd («Обратная лог.-std, руб.») рендерит reverseLogisticsAmount; модалка показывает «Обратная логистика» + ИЛ/ИРП; спека помечена B v3; прод задеплоен (миграция seed применена), curl https://zoiten.pro → 200.</done>
</task>

</tasks>

<verification>
- **Формула:** std-golden v3 (nmId 800750522) — logisticsToAmount≈352.9994 (с ИРП-надбавкой),
  reverseLogisticsAmount=102 (volume-based), logisticsEffAmount≈403.5549, storageAmount=48,
  profitStd≈733.5708 (БЕЗ вычета возврата-продавцу), roiPctStd≈33.28%, returnOnSalesPctStd≈9.47%.
- **Регрессия:** golden первого блока calculatePricing(goldenInputs) → profit≈567.68 не изменился.
- **band-функция:** reverseLogisticsForVolume пинована на 9 точках (0/0.1/0.3/0.5/0.7/0.9/1.0/2/5).
- **tsc:** `npx tsc --noEmit` → 0 ошибок (все ссылки на returnToSellerAmount/returnLogisticsRub/
  returnToSellerRub убраны; stdContext type/RateKey union'ы консистентны).
- **AppSetting:** 3 новых ключа (wbReverseLogBaseRub=46, wbReverseLogPerLiterRub=14, wbIrpPct=1.56)
  + wbLocalizationIndex обновлён на 1.11 миграцией.
- **Прод:** curl https://zoiten.pro → 200 после detached-деплоя; journalctl без ошибок.
</verification>

<success_criteria>
- [ ] reverseLogisticsForVolume экспортирован, band-тесты зелёные
- [ ] calculatePricingStandard: Л_туда с ИРП, revLog volume-based в Л_эфф, profitStd без возврата-продавцу
- [ ] std-golden v3 пересчитан и зелёный; golden первого блока (567.68) не сломан
- [ ] 3 новых AppSetting-ключа в pricing-schemas + page.tsx RATE_KEYS + GlobalRatesBar; ИЛ default 1.11
- [ ] GlobalRatesBar: редакторы ИРП/обр.логистики база+доп/л + ИЛ; убраны Возврат-логистика/Возврат продавцу
- [ ] Миграция seed 3 ключей + UPDATE wbLocalizationIndex→1.11
- [ ] Колонка reverseLogStd (reverseLogisticsAmount) вместо returnToSellerStd; модалка «Обратная логистика» + ИЛ/ИРП
- [ ] Спека помечена «Фаза B v3 реализована»
- [ ] `npx tsc --noEmit` чист + `npm run test -- pricing-math sales-plan` зелёные
- [ ] Задеплоено detached, миграция применена, curl https://zoiten.pro → 200
</success_criteria>

<output>
После завершения создать `.planning/quick/260708-lhb-volume-based-prices-wb-std/260708-lhb-SUMMARY.md`
(шаблон @$HOME/.claude/get-shit-done/templates/summary.md).
</output>
