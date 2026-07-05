# Phase 28: ПДДС — план движения денежных средств (/finance/cashflow) — Research

**Researched:** 2026-07-05
**Domain:** Финансовое планирование / прогноз денежных потоков (cash flow forecast) на базе плана продаж H2-2026
**Confidence:** HIGH (архитектура, источники, эмпирика payout); MEDIUM (точный net-payout коэффициент — нужна привязка к периоду)

## Summary

Phase 28 строит **ПДДС** (прогноз движения денег) — второй из трёх финансовых отчётов (Баланс ✅ → **ПДДС** → ОПиУ). Задача: на горизонте плана продаж (H2-2026, 01.07–31.12) показать по дням/неделям/месяцам, **сколько денег придёт и уйдёт и где кассовые разрывы**, стартуя от текущего остатка банк+касса.

Ключевые кирпичи уже готовы: контракт `lib/sales-plan/pdds-feed.ts` (Phase 25) даёт **притоки** (`getPlannedRevenueSeries(versionId)` — дневной ряд плановых выкупов ₽) и **виртуальные оттоки** (`getPlannedVirtualPayments(versionId)` — DEPOSIT/BALANCE платежи с live-сверкой статусов и forward-fill курса CNY→₽). Реальные оттоки — `PurchasePayment(PLANNED)`, `LoanPayment` (полный график в БД), налоги (`computeQuarterAccrual` из `lib/balance-math.ts`), опекс (касса+банк). Стартовая позиция — `getBankBalanceAsOf` + касса running-balance (паттерны `lib/balance-data.ts`). Бакетирование — готовый `lib/date-buckets.ts`. Есть даже **готовая модель тайминга выплат WB** — `wbCashDay()` в `lib/finance-model/engine.ts`.

**Самое сложное — притоки от WB.** Плановая выручка (выкупы ₽ по цене продавца до СПП) ≠ деньги на счёте. WB платит **еженедельно (в основном по понедельникам), с лагом, за вычетом удержаний** (комиссия ~30-35%, логистика, хранение, реклама/ДРР, штрафы). Эмпирика прод-БД (см. §2): поле `WbSalesDaily.forPayRub` («к перечислению» от WB) = **62-67% от gross buyouts**; после вычета рекламы (ДРР) net-to-bank ≈ **~55%**. Выплаты приходят от контрагента **ООО «РВБ»** (не «Wildberries» по имени!), в основном по понедельникам, с лагом ~1 неделя.

**Primary recommendation:** Pure-движок `lib/finance-cashflow/engine.ts` (по образцу `lib/sales-plan/engine.ts` + `lib/finance-model/engine.ts:wbCashDay`): дневной ряд «остаток на конец дня» = start + Σпритоки − Σоттоки, с недельной агрегацией выручки → выплата в понедельник+лаг × payout-коэффициент (настройка в AppSetting, дефолт из эмпирики). UI — `/finance/cashflow` (секция FINANCE): матрица потоков × бакеты (стиль `PlanFactMatrix`/`BalanceSheetTable`) + график остатка + KPI (мин. остаток, дата разрыва). **v1 read-only с редактируемыми допущениями** (payout-коэффициент, лаг, опекс/мес) в AppSetting-баре (паттерн `GlobalRatesBar`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Плановые притоки WB (выкупы→деньги) | pure-движок `lib/finance-cashflow/` | pdds-feed loader (versionId) | Тайминг+коэффициент — детерминированная трансформация дневного ряда выкупов |
| Плановые оттоки (закупки/VP/кредиты/налоги) | pure-движок + loader-обёртки | `lib/balance-data`, `pdds-feed`, `lib/balance-math` | Даты/суммы платежей уже в БД или в pdds-feed; движок только раскладывает по дням |
| Стартовая позиция (банк+касса) | loader (`lib/finance-cashflow/data.ts`) | `getBankBalanceAsOf` (balance-data) | Point-in-time агрегация транзакций — уже есть в Phase 24 |
| Бакетирование день/неделя/месяц | pure `lib/date-buckets.ts` | — | Переиспользуем как есть (Phase 21/25) |
| Рендер матрицы + график + KPI | RSC page + client-компоненты | `components/finance/` | Паттерн `/finance/balance` (RSC + FinanceTabs + sticky-таблица) |
| Редактируемые допущения (коэффициент/лаг/опекс) | AppSetting KV + server actions | паттерн `GlobalRatesBar` | Per-инсталляция настройки, debounced save |

## Standard Stack

Новых зависимостей **нет** — весь стек уже в проекте.

### Core (переиспользуемое)
| Модуль | Что даёт | Готовность |
|--------|----------|------------|
| `lib/sales-plan/pdds-feed.ts` | `getPlannedRevenueSeries(db, versionId)` (притоки-выкупы по дням) + `getPlannedVirtualPayments(db, versionId)` (виртуальные оттоки ₽ с live-сверкой) + `buildVirtualPurchasePayments` (pure) | ✅ Phase 25, в проде |
| `lib/date-buckets.ts` | `bucketKey`/`bucketLabel`/`getIsoWeek` — day/week/month/quarter/halfyear/year | ✅ Phase 21/25 |
| `lib/balance-data.ts` | `getBankBalanceAsOf(accountId, asOf)` (стартовая позиция банка), `getRateForDate(code, asOf)` (курс с forward-fill) | ✅ Phase 24 |
| `lib/balance-math.ts` | `computeQuarterAccrual(buyouts, vatPct, incomeTaxPct)` — налоговое начисление (7%+1%) | ✅ Phase 24 |
| `lib/loan-math.ts` | `computeSchedule` / `computeLoanAggregates` — если нужны агрегаты; для ПДДС достаточно сырых `LoanPayment.date/principal/interest` | ✅ Phase 21 |
| `lib/procurement-math.ts` | `computeDepositDueDate` (orderDate+3) / `computeBalanceDueDate` (+leadTime) — уже используются pdds-feed | ✅ Phase 20 |
| `lib/finance-model/engine.ts:wbCashDay()` | **Готовая модель тайминга выплат WB**: reportMonday = понедельник недели продажи + 7 дней; деньги = reportMonday + payoutWeeks×7 | ✅ (legacy /finance-models, извлечь как pure helper) |
| `lib/date-periods.ts` | `startOfDayMsk` / MSK-хелперы | ✅ Phase 13/24 |

### Supporting (данные)
| Источник | Что | Когда |
|----------|-----|-------|
| `SalesPlanVersion` + `SalesPlanVersionDay` | зафиксированный план (активная версия `salesPlan.activeVersionId`) | притоки + база налогов |
| `PurchasePayment(status=PLANNED)` | реальные будущие платежи закупок (dueDate/amount/currency/amountRub) | реальные оттоки-закупки |
| `LoanPayment` | полный график тело+проценты (`date`,`principal`,`interest`) | оттоки-кредиты |
| `BankAccount.closingBalance` + `BankTransaction` | стартовая позиция банка | старт |
| `CashEntry` | касса (running balance + опекс по категориям) | старт + опекс |
| `AppSetting` KV | `salesPlan.activeVersionId`, `finance.vatPct`/`incomeTaxPct`, новые `finance.cashflow.*` | настройки |

### Alternatives Considered
| Вместо | Можно | Tradeoff |
|--------|-------|----------|
| payout-коэффициент как AppSetting-константа | считать net-to-seller live через `lib/pricing-math.ts` per-nmId (комиссия+ДРР+логистика per товар) | Точнее, но дорого и хрупко (нужен productId→nmId→pricing-контекст в притоках). §8 Phase 25 доки прямо разрешает оба; для v1 рекомендуется **единый коэффициент** — вопрос B пользователю |
| недельная выплата (понедельник+лаг) | помесячная агрегация | Помесячно проще, но теряет кассовые разрывы внутри месяца (главная ценность ПДДС) — не рекомендуется |
| собственный `lib/finance-cashflow/engine.ts` | расширить legacy `lib/finance-model/engine.ts` | legacy — сценарный симулятор с хардкод-товарами (`inputs.ts:PRODUCTS`), не привязан к плану продаж; переиспользуем только `wbCashDay`, движок пишем свой |

**Installation:** `npm install` не требуется.

**Version verification:** N/A — новых пакетов нет.

## Эмпирика: выплаты WB (прод-БД, SELECT-only)

> Все цифры получены `ssh root@85.198.97.89 "sudo -u postgres psql ... zoiten_erp"` 2026-07-05.

### Кто платит: контрагент **ООО «РВБ»** (НЕ «Wildberries»!)
`[VERIFIED: прод-БД BankTransaction+Counterparty]` Поиск по имени контрагента `%ВАЙЛДБЕРРИЗ%`/`%WILDBERRIES%` в CREDIT-транзакциях → **0 совпадений**. Выплаты WB приходят от **ООО «РВБ»** (Русский ВайлдБерриз — операционное юрлицо WB/РВБ). «Wildberries» встречается только в DEBIT (пополнение рекламы, 12 транзакций, 515K).

**Критично для реализации:** идентификация притоков WB по контрагенту `name LIKE '%РВБ%'`, а НЕ по «Wildberries». Ozon-выплаты — от `Интернет Решения` + `ОЗОН Банк`. «ЗОЙТЕН»/«ГЕЙМ БЛОКС» CREDIT — **внутренние переводы между своими юрлицами** (казначейство), НЕ выручка.

### Тайминг: недельно, в основном по понедельникам
`[VERIFIED: прод-БД]` Крупные выплаты РВБ (~4-6М) приходят преимущественно по **понедельникам** (ISO dow=1), реже Пт/Вт. Пример (2026):

| Дата | День | Сумма |
|------|------|-------|
| 29.06 | Пн | 4 846 273 |
| 19.06 | Пт | 6 498 387 |
| 15.06 | Пн | 4 794 500 |
| 08.06 | Пн | 3 943 850 |
| 25.05 | Пн | 5 307 810 |
| 18.05 | Пн | 3 652 182 |

Совпадает с моделью `wbCashDay()`: WB-отчёт по понедельникам за прошлую неделю, деньги через N недель.

### Коэффициент «к перечислению» (payout ratio)
`[VERIFIED: прод-БД WbSalesDaily, июнь-июль 2026]` — **самая надёжная привязка через поле `forPayRub`** (Σ forPay из Sales API = сколько WB считает к перечислению продавцу):

| Месяц | Gross buyouts ₽ | forPay ₽ | forPay / gross | forPay / net(−возвраты) |
|-------|-----------------|----------|----------------|--------------------------|
| 2026-06 | 76 974 427 | 51 461 348 | **66.9%** | 62.1% |
| 2026-07 (частич.) | 13 503 319 | 9 252 804 | **68.5%** | 65.3% |

**forPay ≈ 62-67% от gross buyouts** — это до вычета рекламы/ДРР. WB-реклама (ДРР) вычитается из выплаты дополнительно: `[VERIFIED: WbAdvertStatDaily]` июнь spend = **9.1М** (≈12% от gross). Итого **net-to-bank ≈ forPay − реклама ≈ (66% − 12%) ≈ ~55% от gross buyouts**.

**Сверка с фактом банка (лаг виден):** `[VERIFIED]` РВБ-выплаты июня = **20.3М**, но forPay июня = 51.4М — расхождение из-за **лага** (июньские выкупы платятся в июле) + неполный месяц в WbSalesDaily (данные с 04.06). Помесячная сверка «в лоб» некорректна именно из-за лага — поэтому берём коэффициент из `forPay/gross` (внутри одного контура, без временного сдвига), а тайминг моделируем отдельно через `wbCashDay`.

**Рекомендуемый дефолт коэффициента (AppSetting):**
- `finance.cashflow.wbPayoutPct` = **55** (net-to-bank, % от плановых выкупов; эмпирика forPay 66% − ДРР ~12%)
- `finance.cashflow.wbPayoutLagWeeks` = **1** (выплата = понедельник-отчёт недели выкупа + 1 неделя; согласуется с `wbCashDay`)
- Оба — редактируемы в UI (вопрос A/C пользователю: подтвердить/уточнить).

### Прочие потоки (эмпирика для дефолтов оттоков)
`[VERIFIED: прод-БД]`
- **Стартовая позиция банк (01.07.2026):** ЗОЙТЕН ВТБ 9.54М + ЗОЙТЕН Сбер 4.12М + ГЕЙМ БЛОКС 0.93М + ПЕЛИКАН 0.84М + прочие → **~15.6М ₽ всего** (13 RUR-счетов, все `balanceDate=2026-07-01`). Касса running balance ≈ **−68К** (петти-фонд, ≈0).
- **Кредиты (LoanPayment H2):** ~5.2М/мес обслуживание (июль: тело 4.15М + % 1.12М; далее ~4М/мес). График полный до 2027+.
- **Реальные закупки (PurchasePayment PLANNED):** редкие, только CNY-балансы (июль 4 платежа 445K CNY, авг 917K CNY). Большинство закупок уже оплачено — основной отток закупок пойдёт через **виртуальные** (pdds-feed).
- **Касса опекс:** ~500К/мес расход (Образцы/Китай, Выкупы товаров, Грузчики, Курьеры) — приход≈расход (петти-фонд, для ПДДС можно игнорировать или включить нетто≈0).
- **Налоги/таможня (банк):** ФНС ~7.1М + Таможня 6.35М (за период). Зарплаты через банк ~3М/мес.
- ⚠ **TxCategory почти не заполнена** — 99% DEBIT = `UNCATEGORIZED` (1632 txn). Категоризацию оттоков по `category` использовать **нельзя**; идентификация — по контрагенту (ФНС=`Казначейство России`, зарплата по purpose-keyword) или ручной ввод опекса-константы.

## Расчётная модель

### Формула ядра (дневной ряд остатка)
```
Для каждого дня d в горизонте [start .. horizonTo]:
  притоки(d)  = wbPayout(d) + прочиеПритоки(d)
  оттоки(d)   = закупкиРеал(d) + виртуальные(d) + кредиты(d) + налоги(d) + опекс(d)
  netFlow(d)  = притоки(d) − оттоки(d)
  остаток(d)  = остаток(d−1) + netFlow(d)     // остаток(start−1) = стартоваяПозиция

Разрыв(d) = остаток(d) < 0  (или < порога тревоги)
```

### Притоки WB — тайминг + коэффициент (ядро сложности)
```ts
// Из getPlannedRevenueSeries(versionId): дневной ряд { date, buyoutsRub }
// Переиспользуем wbCashDay() (lib/finance-model/engine.ts) как pure helper:
//   reportMonday = понедельник недели выкупа + 7 дней
//   cashDay      = reportMonday + wbPayoutLagWeeks × 7
// Агрегируем buyoutsRub по cashDay, умножаем на wbPayoutPct/100:
wbPayout(cashDay) = Σ{ выкупы дней недели, чей cashDay == этот } × wbPayoutPct/100
```
Результат — крупные притоки по понедельникам (совпадает с эмпирикой РВБ). **Дневной ряд выкупов обязателен** (не месячный): ре-бакетирование по неделям выплат из месяцев невозможно (§8 Phase 25 доки).

### Оттоки
| Отток | Источник | Дата платежа | Сумма |
|-------|----------|--------------|-------|
| Реальные закупки | `PurchasePayment(status=PLANNED)` | `dueDate` | `amountRub ?? amount×курс(dueDate)` (паттерн balance-data B1) |
| Виртуальные закупки | `getPlannedVirtualPayments(versionId)` | `payment.dueDate` | `payment.amountRub` (уже ₽, forward-fill курса) — **анти-двойной счёт: CONVERTED/DISMISSED исключены** |
| Кредиты | `LoanPayment` (date≥start) | `date` | `principal + interest` |
| Налоги | `computeQuarterAccrual(планВыкупыКвартала, 7, 1)` | конец квартала / дата уплаты | плановое начисление; уплата — в конце квартала (упрощение) |
| Опекс (зарплаты, банк-комиссии, аренда) | AppSetting-константа `finance.cashflow.opexMonthlyRub` **или** касса-средний | равномерно по месяцу (÷дни) | вопрос E пользователю |

**Анти-двойной счёт (критично):** `getPlannedVirtualPayments` возвращает `versionStale`/`convertedVpIds`/`dismissedVpIds` — CONVERTED VP уже стали реальными `PurchasePayment(PLANNED)`, их виртуальные платежи исключены (иначе двойной отток). UI показывает предупреждение при `versionStale=true` («N виртуальных закупок изменили статус — рекомендуется перефиксация плана»).

### Pure-движок (структура, образец lib/sales-plan/)
```
lib/finance-cashflow/
├── types.ts     — CashflowInputs, CashflowDay, CashflowBucket, CashflowResult
├── engine.ts    — computeCashflow(inputs): PURE, детерминированная симуляция дневного остатка
│                  + wbPayoutSchedule (переиспользует wbCashDay), gap-детекция
├── data.ts      — loadCashflowInputs(db, {versionId, from, to}): Prisma-загрузчик
│                  (pdds-feed притоки/виртуальные + PurchasePayment + LoanPayment
│                   + стартовая позиция банк/касса + AppSetting коэффициенты)
└── (тесты)      — tests/finance-cashflow-engine.test.ts (golden: старт+притоки−оттоки=остаток;
                   разрыв детектируется; анти-двойной счёт CONVERTED)
```
`engine.ts` — **pure** (ноль Prisma/React/Next), как `lib/sales-plan/engine.ts`. `data.ts` — loader-обёртка (DI-совместимая для тестов).

### Факт vs план (прошедшие дни)
Горизонт H2 = 01.07–31.12; «сегодня» 05.07 → большая часть в будущем. Для v1 рекомендуется **план-only** (весь горизонт прогнозный); фактический ряд остатка (из `BankTransaction`+`CashEntry` по дням) — опционально, вопрос H. Если делать — паттерн `getBankBalanceAsOf` по дням (дорого) или дневная агрегация транзакций.

## UI-скелет

`/finance/cashflow` (существует как ComingSoon-заглушка, секция FINANCE, `FinanceTabs` уже включает вкладку «ОДДС»). Заменяем заглушку на RSC-страницу (паттерн `/finance/balance`):

```
app/(dashboard)/finance/cashflow/page.tsx  (RSC, force-dynamic, requireSection("FINANCE"))
  ├── <FinanceTabs />                        — уже есть (Баланс|ОДДС|ОПиУ)
  ├── <CashflowAssumptionsBar />             — MANAGE-only: payout% / лаг / опекс/мес (паттерн GlobalRatesBar, debounced AppSetting save)
  ├── <CashflowKpiCards />                   — Стартовый остаток · Мин. остаток · Дата первого разрыва · Итог за горизонт
  ├── <CashflowChart />                      — линия «остаток на конец периода» + zero-line (motion/recharts как в LoanBalanceChart)
  └── <CashflowMatrix />                     — sticky-таблица: строки=потоки, колонки=бакеты (стиль PlanFactMatrix/BalanceSheetTable)
       Строки: Стартовый остаток → [Притоки: WB, прочие] → [Оттоки: закупки, виртуальные, кредиты, налоги, опекс]
               → Net поток → Остаток на конец (подсветка красным если <порога)
       Переключатель гранулярности день/неделя/месяц (URL searchParam, паттерн PlanFactControls)
```

**Sticky-таблица:** соблюдать `bg-background` (без `/NN` прозрачности) на sticky-ячейках (CLAUDE.md — повторяющийся баг).

**v1 read-only с редактируемыми допущениями:** сама таблица read-only (не редактируем платежи здесь — они из плана продаж/закупок/кредитов); редактируются только 3 глобальных допущения через AppSetting-бар (payout%, лаг, опекс). Это даёт «сценарии» без версионирования (вопрос G).

## План внедрения (3 деплоябельных под-этапа)

### Этап 1 — Движок + данные (невидимый деплой)
- `lib/finance-cashflow/{types,engine,data}.ts` + извлечь `wbCashDay` как pure helper (или скопировать в engine).
- Сид AppSetting: `finance.cashflow.wbPayoutPct=55`, `.wbPayoutLagWeeks=1`, `.opexMonthlyRub` (дефолт из кассы-среднего или 0), `.gapThresholdRub=0`.
- Тесты: golden (старт+притоки−оттоки=остаток), gap-детекция, анти-двойной счёт CONVERTED, тайминг wbPayout по понедельникам.
- Без Prisma-миграции (только AppSetting-сид через INSERT ON CONFLICT).

### Этап 2 — RSC-страница + матрица + KPI (замена заглушки)
- `page.tsx` (RSC): `loadCashflowInputs(activeVersionId, horizon)` → `computeCashflow` → рендер.
- `CashflowMatrix` (sticky, гранулярность в URL) + `CashflowKpiCards` + `CashflowChart`.
- Предупреждение при `versionStale` (виртуальные закупки изменили статус).
- Пустое состояние: нет активной версии → «Зафиксируйте план продаж» (см. Риск 1).

### Этап 3 — Редактируемые допущения + методология + деплой
- `CashflowAssumptionsBar` (MANAGE-only, debounced AppSetting save + `router.refresh()`).
- `docs/finance-cashflow-methodology.md` + кнопка «Как считается» (паттерн `BalanceMethodologyDialog`).
- Provision RBAC (FINANCE уже есть), deploy на VPS, UAT.

## Риски

1. **Активная версия плана — единственный источник притоков (versionId).** `getPlannedRevenueSeries`/`getPlannedVirtualPayments` требуют `versionId`. `salesPlan.activeVersionId` **есть** (`cmr83ire307x7vh2p015w1xgk`, 349М планвыкупов) — но если сброшена/не зафиксирована, ПДДС пуст. **Fallback:** если `activeVersionId` null → пустое состояние с CTA «Зафиксируйте план». Драфт напрямую не читается (pdds-feed работает только с версией). Вопрос: fallback на драфт-номинал не рекомендуется (нет versionId для виртуальных из paramsJson).
2. **Payout-коэффициент — эмпирика одного месяца (июнь).** WbSalesDaily только с 04.06.2026 (окно Sales API). 55% — оценка forPay(66%)−реклама(12%). Реальный net-to-bank варьирует (штрафы, хранение, компенсации). Митигация: редактируемый коэффициент + оговорка «приближённо» (как в balance-методологии).
3. **Лаг выплат нестабилен.** Эмпирика: в основном Пн, но встречаются Пт/Вт и разброс сумм. `wbCashDay` даёт понедельник+N недель — приближение. Митигация: `wbPayoutLagWeeks` редактируем; ПДДС — прогноз, не бухгалтерия.
4. **Мультивалюта закупок.** Виртуальные — уже ₽ (forward-fill в pdds-feed). Реальные `PurchasePayment` CNY — конвертировать через `getRateForDate(dueDate)`; для будущих dueDate курса нет → forward-fill последнего (11.38 CNY, 77.23 USD на 04.07). `amountRub` (факт банка) приоритетнее (паттерн balance-data B1/260704-go2).
5. **Несколько юрлиц (Company).** Банк-счета 6 компаний (ЗОЙТЕН, ГЕЙМ БЛОКС, ПЕЛИКАН…), выплаты РВБ на разные счета, внутренние переводы между своими. **v1 — консолидированно** (все RUR-счета суммой, как в balance `bankRurTotal`); внутренние переводы взаимно гасятся и в netFlow не искажают. Вопрос F: консолидация vs per-company.
6. **Опекс не категоризован.** TxCategory=UNCATEGORIZED в 99% → нельзя авто-выделить зарплаты/аренду из банка. v1: опекс = редактируемая константа/мес (вопрос E), либо касса-средний (~0.5М петти, мало).
7. **Налоги — упрощение.** `computeQuarterAccrual` даёт начисление; момент **уплаты** ЕНП — 28-е число месяца после квартала. v1: относить уплату на конец квартала/28-е след. месяца (приближение).

## Вопросы пользователю

> Главный выход ресёча. Каждый — с рекомендацией. Ответы → CONTEXT.md → фиксируются как decisions.

1. **[A] Payout-модель WB (коэффициент).** Эмпирика прод-БД: WB «к перечислению» (forPay) = **66% от выкупов**, минус реклама/ДРР ≈ 12% → **net-to-bank ≈ 55%**. Использовать **55%** как дефолт (редактируемый в UI)?
   *Рекомендация: да, 55% дефолт + слайдер. При желании уточнить — назвать свою цифру (напр. если реклама вынесена отдельной строкой оттока, коэффициент = 66%).*

2. **[B] Реклама/ДРР — в коэффициенте или отдельной строкой оттока?** Вариант 1: коэффициент 55% (реклама «зашита», притоки уже нетто рекламы). Вариант 2: коэффициент 66% (forPay) + отдельная строка оттока «Реклама WB» (~9М/мес по эмпирике).
   *Рекомендация: Вариант 1 (55%, реклама в коэффициенте) для v1 — проще, реклама WB удерживается из выплаты автоматически. Отдельная строка — если хотите видеть/планировать рекламный бюджет явно.*

3. **[C] Лаг выплат WB.** Эмпирика: выплаты по понедельникам, за неделю продажи + ~1 неделя. Модель `wbCashDay`: понедельник-отчёт (неделя выкупа+7д) + `lagWeeks×7`. Дефолт **lagWeeks=1**?
   *Рекомендация: lagWeeks=1 (редактируемо). Если по вашему опыту деньги идут быстрее/медленнее — назвать (0=в понедельник-отчёт, 2=через 2 недели).*

4. **[D] Какие оттоки включить в v1?** Кандидаты: реальные закупки (PurchasePayment), виртуальные закупки (pdds-feed), кредиты (LoanPayment), налоги (7%+1%), опекс/зарплаты.
   *Рекомендация: все пять. Виртуальные+кредиты — самые весомые и точные (из БД); налоги — расчётно; опекс — константой (см. E).*

5. **[E] Опекс — константа или из кассы?** Зарплаты/аренда/комиссии в банке не категоризованы (99% UNCATEGORIZED). Варианты: (a) редактируемая константа «опекс ₽/мес», (b) средний расход кассы (~0.5М/мес, но это петти-фонд), (c) не включать (0).
   *Рекомендация: (a) редактируемая константа/мес (напр. зарплаты ~3М + аренда/прочее). Вы вводите одну цифру, движок раскладывает равномерно по дням.*

6. **[F] Консолидация юрлиц.** 6 компаний со счетами, выплаты РВБ на разные, внутренние переводы между своими.
   *Рекомендация: v1 — консолидированно (все RUR-счета одним пулом, как в Балансе). Внутренние переводы взаимно гасятся. Per-company разрез — отдельная фаза при необходимости.*

7. **[G] Горизонт.** = горизонт активного плана продаж H2-2026 (01.07–31.12)?
   *Рекомендация: да, = `salesPlan.horizon` (01.07–31.12.2026). Совпадает с версией, где есть притоки. Продление — вслед за планом продаж.*

8. **[H] Факт-ряд в v1?** Показывать фактический остаток (из банка/кассы) для прошедших дней рядом с планом, или чистый прогноз?
   *Рекомендация: v1 — чистый прогноз (план-only), стартуя от фактического остатка на сегодня. Факт-vs-план остатка — v2 (дорого по данным, мало прошедших дней в горизонте).*

9. **[I] Порог тревоги разрыва + редактируемость допущений.** Подсвечивать остаток < 0 или < порога X? Допущения (payout%/лаг/опекс) — редактируемые в UI (MANAGE) или хардкод?
   *Рекомендация: порог = редактируемая настройка (дефолт 0 → красный при отрицательном остатке; можно поднять до «неснижаемого остатка», напр. 2М). Допущения — редактируемые в AppSetting-баре (сценарии без версионирования).*

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | net-to-bank ≈ 55% от плановых выкупов (forPay 66% − реклама 12%) | §2, Модель | Средний — коэффициент редактируем; ошибка масштабирует все притоки |
| A2 | Лаг выплат = 1 неделя после понедельника-отчёта | §2, Модель | Средний — сдвигает притоки во времени; редактируем |
| A3 | Опекс включается редактируемой константой (зарплаты/аренда не в БД структурированно) | §Оттоки, Q5 | Низкий — зависит от ответа E |
| A4 | Уплата налогов относится на конец квартала (упрощение, не 28-е ЕНП) | §Оттоки, Риск 7 | Низкий — небольшой временной сдвиг |
| A5 | v1 консолидирует юрлица; внутренние переводы взаимно гасятся | Риск 5, Q6 | Низкий — стандартный подход, подтвердить F |
| A6 | ООО «РВБ» = единственный контрагент выплат WB (не «Wildberries») | §2 | Низкий — VERIFIED прод-БД, но если появится второй контрагент-агент, идентификация притоков-факта неполна (влияет только на опциональный факт-ряд H) |

## Open Questions

1. **Точный net-payout за полный месяц.** WbSalesDaily только с 04.06 → нет чистого полного месяца для сверки forPay vs факт РВБ без лага. Рекомендация: принять 55% с редактированием; уточнить после накопления ≥2 полных месяцев Sales-данных.
2. **Момент уплаты налога.** Начисление есть (`computeQuarterAccrual`); уплата ЕНП — 28-е след. месяца. v1: конец квартала. Уточнить при планировании, критично ли для разрывов.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL 16 (прод) | все данные | ✓ | 16 | — |
| Активная версия плана продаж | притоки/виртуальные (pdds-feed) | ✓ | `cmr83ire307x7vh2p015w1xgk` (349М планвыкупов) | пустое состояние + CTA «зафиксируйте план» |
| `lib/sales-plan/pdds-feed.ts` | контракт | ✓ | Phase 25, в проде | — |
| CurrencyRate CNY/USD | конвертация закупок | ✓ | до 04.07 (11.38/77.23) | forward-fill (уже в getRateForDate) |
| `lib/finance-model/engine.ts:wbCashDay` | тайминг выплат | ✓ | legacy | скопировать формулу в новый engine |

**Missing dependencies with no fallback:** нет.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 (alias `@`→корень) |
| Config file | `vitest.config.ts` |
| Quick run | `npm run test -- finance-cashflow` |
| Full suite | `npm run test` |

### Phase Requirements → Test Map
| Behavior | Test Type | Command | Exists? |
|----------|-----------|---------|---------|
| Остаток = старт + Σпритоки − Σоттоки | unit (golden) | `npm run test -- finance-cashflow-engine` | ❌ Wave 0 |
| Тайминг wbPayout по понедельникам + лаг | unit | `-- finance-cashflow-engine` | ❌ Wave 0 |
| Gap-детекция (остаток<порога) | unit | `-- finance-cashflow-engine` | ❌ Wave 0 |
| Анти-двойной счёт CONVERTED (виртуальные) | unit | `-- finance-cashflow-engine` | ❌ Wave 0 |
| Бакетирование день/неделя/месяц | reuse | `-- date-buckets` (Phase 25) | ✅ |
| pdds-feed контракт | reuse | `-- sales-plan-pdds-feed` (Phase 25) | ✅ |

### Sampling Rate
- **Per task:** `npm run test -- finance-cashflow`
- **Per wave:** `npm run test`
- **Phase gate:** полный suite зелёный + не тронуты golden'ы плана продаж (iu=438 068 120)

### Wave 0 Gaps
- [ ] `tests/finance-cashflow-engine.test.ts` — движок (старт/притоки/оттоки/gap/анти-двойной счёт)
- [ ] `lib/finance-cashflow/{types,engine,data}.ts` — новые модули
- [ ] AppSetting-сид `finance.cashflow.*`

## Security Domain

`security_enforcement` не отключён явно — секция включена.

### Applicable ASVS Categories
| Category | Applies | Control |
|----------|---------|---------|
| V4 Access Control | yes | `requireSection("FINANCE")` (read) / `requireSection("FINANCE","MANAGE")` (write допущений) — паттерн /finance/balance 24-08 |
| V5 Input Validation | yes | zod-схемы для AppSetting-значений (payout%/лаг/опекс — числовые границы), паттерн `lib/pricing-schemas.ts` |
| V6 Cryptography | no | нет секретов в фазе (WB_FINANCE_TOKEN уже настроен Phase 24) |

### Threat Patterns
| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| Read-only юзер меняет допущения | Elevation | AssumptionsBar рендерится только при MANAGE (getSectionRole); server actions всё равно `requireSection("FINANCE","MANAGE")` |
| Двойной отток (виртуальная+реальная закупка) | Tampering | `getPlannedVirtualPayments` сверяет CONVERTED/DISMISSED (§8 Phase 25, уже в pdds-feed) |
| Инъекция в AppSetting-значение | Tampering | zod-валидация числовых границ перед upsert |

## Sources

### Primary (HIGH confidence)
- `lib/sales-plan/pdds-feed.ts` — сигнатуры/семантика притоков+виртуальных оттоков (изучено дословно)
- `lib/balance-data.ts` — getBankBalanceAsOf, getRateForDate, loadBalanceSheet (паттерны Phase 24)
- `lib/finance-snapshot.ts`, `lib/date-buckets.ts`, `lib/procurement-math.ts`, `lib/loan-math.ts`, `lib/finance-model/engine.ts:wbCashDay`
- `lib/sales-plan/plan-fact.ts` — buildPlanFactReport (образец бакет-матрицы)
- `docs/finance-balance-methodology.md` — стиль методологии
- Прод-БД (SELECT-only, 2026-07-05): BankTransaction/Counterparty (РВБ payout, тайминг), WbSalesDaily (forPay/gross коэффициент), WbAdvertStatDaily (ДРР), BankAccount (старт), LoanPayment/PurchasePayment (оттоки), CashEntry (опекс), SalesPlanVersion/Day (активная версия), AppSetting
- `.planning/ROADMAP.md` §Phase 28, `.planning/phases/25-v2-h2-2026/25-RESEARCH.md` §8 (контракт ПДДС), CRITIC-VERDICT.md

### Secondary (MEDIUM confidence)
- CLAUDE.md — паттерны sticky-таблиц, per-user prefs, RBAC, WB API

## Metadata

**Confidence breakdown:**
- Источники данных / архитектура: HIGH — все кирпичи в коде, изучены дословно
- Payout-модель (тайминг): HIGH — эмпирика прод-БД + готовый `wbCashDay`
- Payout-коэффициент (55%): MEDIUM — forPay/gross=66% VERIFIED, вычет рекламы — оценка, один месяц данных
- Оттоки: HIGH — все из БД (кроме опекса — зависит от ответа E)
- UI: HIGH — прямой аналог /finance/balance

**Research date:** 2026-07-05
**Valid until:** 2026-08-05 (стабильный внутренний стек; коэффициент уточнять по мере накопления Sales-данных)
