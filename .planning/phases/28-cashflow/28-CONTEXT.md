# Phase 28: ПДДС — план движения денежных средств (/finance/cashflow) - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning
**Source:** 28-RESEARCH.md (эмпирика прод-БД) + 4 ответа пользователя (AskUserQuestion 2026-07-05) + дефолты ресёча, принятые без возражений

<domain>
## Phase Boundary

Построить прогноз движения денег на горизонте активного плана продаж (H2-2026): дневной ряд «остаток на конец дня» = старт (банк+касса) + притоки − оттоки, с бакетами день/неделя/месяц, детекцией кассовых разрывов, KPI и графиком. Раздел `/finance/cashflow` (замена ComingSoon-заглушки, вкладка «ОДДС» в FinanceTabs уже есть), секция FINANCE.

НЕ трогаем: план продаж (движок/данные/golden iu=438 068 120), pdds-feed контракт (потребляем как есть), Баланс (/finance/balance), схемы Loan/Purchase/Bank/Cash. Новых Prisma-миграций НЕТ (только AppSetting-сид).
</domain>

<decisions>
## Implementation Decisions (LOCKED — пользователь 2026-07-05)

### D-1. Payout-модель WB v1 = единый коэффициент 55% нетто, реклама внутри — НО сменная архитектура
Приток WB = плановые выкупы (дневной ряд активной версии из `getPlannedRevenueSeries`) × `wbPayoutPct/100`. Дефолт **55%** (эмпирика: forPay 66% − реклама/ДРР ~12%), редактируемый.

**⚠ Явное требование пользователя:** «это первое приближение — в дальнейшем будем по каждому товару отдельный расчёт делать из его юнит-экономики, той, которая в Управлении ценами». Движок обязан быть спроектирован под **сменную payout-модель**: интерфейс вида `payoutModel: 'coefficient' | 'per-product'` / инъекция функции `(day, buyoutsRub) → payoutRub`, чтобы v2 подключил `lib/pricing-math.ts` per-nmId без переписывания engine. В v1 реализуется только coefficient.

### D-2. Тайминг выплат WB — недельный, wbCashDay
Выплата = понедельник-отчёт (понедельник недели выкупа + 7 дн) + `wbPayoutLagWeeks × 7`. Дефолт **lagWeeks=1** (принят без возражений), редактируемый. Формулу взять из `lib/finance-model/engine.ts:wbCashDay()` (извлечь как pure helper или скопировать в новый engine). Дневной ряд выкупов обязателен (не месячный).

### D-3. Оттоки v1 — все пять (принято по рекомендации)
1. **Реальные закупки** — `PurchasePayment(status=PLANNED)`, дата `dueDate`, сумма `amountRub ?? amount × getRateForDate(currency, dueDate)` (forward-fill, паттерн balance-data B1 / quick-260704-go2).
2. **Виртуальные закупки** — `getPlannedVirtualPayments(versionId)` из pdds-feed (уже ₽; анти-двойной счёт CONVERTED/DISMISSED встроен). При `versionStale=true` — предупреждение в UI («виртуальные закупки изменили статус — рекомендуется перефиксация плана»).
3. **Кредиты** — `LoanPayment` (date ≥ start), сумма `principal + interest`.
4. **Налоги** — `computeQuarterAccrual(планВыкупыКвартала, vatPct, incomeTaxPct)` из `lib/balance-math.ts`; уплата относится на конец квартала (упрощение v1, ЕНП 28-е — отложено).
5. **Опекс** — редактируемая константа `finance.cashflow.opexMonthlyRub`, раскладывается равномерно по дням месяца. Пользователь введёт цифру сам (ориентир: зарплаты ~3М + аренда/прочее). Авто-выделение из банка невозможно (99% DEBIT = UNCATEGORIZED).

### D-4. Факт-ряд остатка — ВКЛЮЧЁН в v1 (пользователь, против рекомендации ресёча)
За прошедшие дни горизонта показывать **фактический остаток** (банк+касса) рядом/поверх прогноза: дневная агрегация `BankTransaction` (все RUR-счета) + `CashEntry`. На графике — линия факта до «сегодня», прогноз дальше; в матрице факт-колонки для прошедших бакетов допустимы по усмотрению планировщика. Идентификация факт-притоков WB (если понадобится разрез) — контрагент **ООО «РВБ»**, НЕ «Wildberries».

### D-5. Порог тревоги разрыва = 0 ₽, редактируемый
`finance.cashflow.gapThresholdRub` дефолт 0 → красная подсветка при отрицательном остатке. Настройка в AssumptionsBar.

### D-6. Консолидация юрлиц (принято по рекомендации)
Все RUR-счета одним пулом (как `bankRurTotal` в Балансе) + касса. Внутренние переводы между своими юрлицами взаимно гасятся в netFlow. Per-company разрез — не в этой фазе.

### D-7. Горизонт и источник притоков (принято по рекомендации)
Горизонт = `salesPlan.horizon` (01.07–31.12.2026). Притоки/виртуальные — ТОЛЬКО из активной версии (`salesPlan.activeVersionId`; на проде есть: `cmr83ire307x7vh2p015w1xgk`, 349М планвыкупов). Нет активной версии → пустое состояние с CTA «Зафиксируйте план продаж». Fallback на драфт НЕ делаем.

### D-8. RBAC
Read: `requireSection("FINANCE")`. Write (server actions допущений): `requireSection("FINANCE","MANAGE")`. AssumptionsBar рендерится только при MANAGE. Паттерн /finance/balance (Phase 24).

### D-9. v1 = read-only матрица + редактируемые допущения
Платежи в ПДДС не редактируются (их источники — план продаж/закупки/кредиты). Редактируются только допущения через AppSetting-бар (паттерн GlobalRatesBar, debounced + router.refresh): `wbPayoutPct`, `wbPayoutLagWeeks`, `opexMonthlyRub`, `gapThresholdRub`. Zod-валидация числовых границ.

### Claude's Discretion
- Точная структура строк матрицы (порядок притоков/оттоков, свёртки) — по скелету ресёча: Старт → Притоки (WB, прочие) → Оттоки (закупки, виртуальные, кредиты, налоги, опекс) → Net → Остаток на конец.
- Гранулярность-переключатель день/неделя/месяц — URL searchParam (паттерн PlanFactControls).
- Как показывать факт-ряд в матрице (отдельные колонки vs только график) — на усмотрение планировщика, график обязателен.
- Названия/структура AppSetting-ключей `finance.cashflow.*`.
</decisions>

<canonical_refs>
## Canonical References

### Новые модули (Wave 0)
- `lib/finance-cashflow/types.ts` — CashflowInputs, CashflowDay, CashflowBucket, CashflowResult; payout-модель как интерфейс (D-1).
- `lib/finance-cashflow/engine.ts` — `computeCashflow(inputs)`: PURE (ноль Prisma/React), образец `lib/sales-plan/engine.ts`; wbPayoutSchedule + gap-детекция.
- `lib/finance-cashflow/data.ts` — `loadCashflowInputs(db, {versionId, from, to})`: pdds-feed + PurchasePayment + LoanPayment + старт банк/касса + AppSetting.
- `tests/finance-cashflow-engine.test.ts` — golden (старт+притоки−оттоки=остаток), тайминг по понедельникам+лаг, gap-детекция, анти-двойной счёт CONVERTED.

### Потребляемые контракты (НЕ менять)
- `lib/sales-plan/pdds-feed.ts` — `getPlannedRevenueSeries(db, versionId)`, `getPlannedVirtualPayments(db, versionId)` (возвращает versionStale/convertedVpIds/dismissedVpIds).
- `lib/balance-data.ts` — `getBankBalanceAsOf`, `getRateForDate` (forward-fill курса).
- `lib/balance-math.ts` — `computeQuarterAccrual(buyouts, vatPct, incomeTaxPct)`; ставки в AppSetting `finance.vatPct`/`incomeTaxPct` (7+1).
- `lib/date-buckets.ts` — bucketKey/bucketLabel (day/week/month/...).
- `lib/finance-model/engine.ts:wbCashDay()` — формула тайминга (извлечь/скопировать; legacy-движок целиком НЕ переиспользовать).
- `lib/procurement-math.ts` — computeDepositDueDate/computeBalanceDueDate (уже внутри pdds-feed).

### UI
- `app/(dashboard)/finance/cashflow/page.tsx` — сейчас ComingSoon-заглушка; заменить на RSC (force-dynamic, `requireSection("FINANCE")`), образец `app/(dashboard)/finance/balance/page.tsx`.
- `components/finance/` — FinanceTabs уже включает «ОДДС». Новые: CashflowAssumptionsBar (образец GlobalRatesBar), CashflowKpiCards, CashflowChart (recharts, тики fill var(--muted-foreground)), CashflowMatrix (sticky-таблица).
- Методология: `docs/finance-cashflow-methodology.md` + диалог «Как считается» (образец BalanceMethodologyDialog).

### Правила проекта (CLAUDE.md + memory)
- Sticky-таблицы: сплошной `bg-background`/`bg-muted` БЕЗ `/NN` на sticky-ячейках (повторяющийся баг).
- НЕ вызывать client-функции (buttonVariants) из RSC — статические классы ([[project_rsc_client_fn_runtime_trap]]).
- Модалки: sm:-префиксованная ширина + загрузка данных через useEffect(open) ([[project-baseui-dialog-gotchas]]).
- Server Actions: "use server" + requireSection + try/catch + revalidatePath; zod-валидация.
- AppSetting INSERT: колонки key/value/updatedAt (createdAt НЕТ) — `ON CONFLICT (key) DO UPDATE`.
- Деплой: push → nohup deploy.sh → ==> Done → curl 200 + journalctl-smoke.

### Эмпирика (28-RESEARCH.md §2, VERIFIED прод-БД)
- Выплаты WB: контрагент ООО «РВБ», понедельники, forPay/gross = 66-68%, реклама ~12% gross → net ≈ 55%.
- Старт 01.07: банк ~15.6М ₽ (13 RUR-счетов), касса ≈ 0.
- Кредиты H2: ~5.2М/мес (июль: тело 4.15М + % 1.12М).
- Реальные закупки PLANNED: редкие CNY-балансы (июль 445K CNY, авг 917K CNY); основной отток закупок — виртуальные.
</canonical_refs>

<specifics>
## Specific Ideas
- 3 деплоябельных под-этапа (из ресёча): (1) движок+данные+тесты+AppSetting-сид — невидимый деплой; (2) RSC-страница+матрица+KPI+график — замена заглушки; (3) AssumptionsBar+методология+UAT.
- AppSetting-сид: `finance.cashflow.wbPayoutPct=55`, `.wbPayoutLagWeeks=1`, `.opexMonthlyRub=0` (пользователь заполнит сам), `.gapThresholdRub=0`.
- KPI-карточки: Стартовый остаток · Мин. остаток за горизонт · Дата первого разрыва · Net за горизонт.
- Факт-ряд (D-4): дневная агрегация суммы CREDIT−DEBIT по RUR-BankTransaction + CashEntry, накопительно от стартовой позиции; линия «факт» на графике до сегодня.
- Тест сменной payout-модели: инъекция кастомной функции вместо коэффициента → движок применяет её (задел под v2 per-product).

## Golden anchors (НЕ менять)
- `iuTotalForRange("2026-07-01","2026-12-31") === 438_068_120` + все sales-plan тесты.
- pdds-feed сигнатуры/семантика (анти-двойной счёт).
- Баланс (/finance/balance) — не задевать общие модули без обратной совместимости.
</specifics>

<deferred>
## Deferred Ideas
- **Per-товар payout из юнит-экономики** (lib/pricing-math.ts) — v2, пользователь явно анонсировал; v1 закладывает только интерфейс (D-1).
- Реклама WB отдельной строкой оттока (вариант 66% + строка) — отклонено для v1, возможно вместе с per-товар моделью.
- Per-company разрез ПДДС (D-6) — отдельная фаза при необходимости.
- Точный момент уплаты ЕНП (28-е число) — v1 упрощает до конца квартала.
- Уточнение payout-коэффициента после ≥2 полных месяцев Sales-данных (WbSalesDaily с 04.06).
</deferred>

---

*Phase: 28-cashflow*
*Context gathered: 2026-07-05 — 28-RESEARCH.md + 4 ответа пользователя (payout 55% нетто как первое приближение со сменной моделью; опекс константой; факт-ряд в v1 — да; порог 0 ₽) + дефолты ресёча без возражений (лаг 1 неделя, все 5 оттоков, консолидация юрлиц, горизонт H2)*
