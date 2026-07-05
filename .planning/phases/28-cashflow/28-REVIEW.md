---
phase: 28-cashflow
reviewed: 2026-07-05T20:10:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - lib/finance-cashflow/types.ts
  - lib/finance-cashflow/engine.ts
  - lib/finance-cashflow/data.ts
  - lib/cashflow-schemas.ts
  - app/actions/cashflow.ts
  - app/(dashboard)/finance/cashflow/page.tsx
  - components/finance/CashflowKpiCards.tsx
  - components/finance/CashflowChart.tsx
  - components/finance/CashflowMatrix.tsx
  - components/finance/CashflowAssumptionsBar.tsx
  - components/finance/CashflowMethodologyDialog.tsx
  - tests/finance-cashflow-engine.test.ts
  - prisma/migrations/20260705_phase28_cashflow_seed/migration.sql
  - docs/finance-cashflow-methodology.md
findings:
  critical: 1
  warning: 10
  info: 7
  total: 18
status: issues_found
---

# Phase 28: Code Review Report — ПДДС (/finance/cashflow)

**Reviewed:** 2026-07-05T20:10:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Проверены движок ПДДС (pure engine + DI-loader), server action допущений, RSC-страница, 5 клиентских компонентов, golden-тесты, seed-миграция и методология. Прослежены вызовы в зависимости: `pdds-feed.ts`, `balance-data.ts`, `balance-math.ts`, `rbac.ts`, `date-buckets.ts`, schema.prisma. Тесты прогнаны — 5/5 зелёные.

Ключевые инварианты соблюдены: engine/types — pure (ноль Prisma/React/Next); RBAC read=`requireSection("FINANCE")`, write=`MANAGE` (двойная защита: бар скрыт для VIEW + серверный гейт); `getSectionRole` возвращает MANAGE для SUPERADMIN — бар виден суперадмину; анти-двойной счёт VP делегирован pdds-feed, движок не переоценивает (тест 4); Zod allow-list ключей AppSetting + per-ключ границы — инъекция ключа исключена; Decimal→Number конвертации на месте; валюта "RUR" учтена; `rateToRub` используется корректно; sticky-ячейки заголовка/label — сплошной bg; AppSetting без createdAt; RSC не вызывает client-функции (статические классы у Link).

Главная проблема — **граница horizonFrom считается дважды**: стартовый баланс включает потоки, датированные первым днём горизонта, и та же дата снова входит в дельты факт-ряда (и в план-симуляцию дня 1). Обе колонки дат — `@db.Date` (полночь UTC), т.е. коллизия бьёт по каждой записи первого дня, а не по редкому граничному случаю. Плюс расхождение методологии с кодом по налогам и ряд дефектов устойчивости.

## Critical Issues

### CR-01: Двойной счёт потоков первого дня горизонта (startingBalance ∩ факт-ряд ∩ план дня 1)

**File:** `lib/finance-cashflow/data.ts:87` (банк), `lib/finance-cashflow/data.ts:94` (касса), `lib/finance-cashflow/data.ts:220-233` (факт-ряд)
**Issue:** Стартовый баланс включает потоки, датированные ровно `horizonFrom`:
- Касса: `where: { date: { lte: horizonFromDate } }` — `CashEntry.date` это `@db.Date` (полночь UTC), т.е. **все** записи за 01.07 попадают в `cashTotal`.
- Банк: `getBankBalanceAsOf(acc.id, horizonFromDate)` — обе ветви (`(anchor, asOf]` и `(asOf, anchor]` с `gt: asOf`) включают транзакции с `date === asOf`, т.е. все транзакции за 01.07 входят в баланс.

Одновременно факт-ряд (шаг 8) собирает дельты с `date: { gte: actualFromDate }` — те же записи 01.07 прибавляются к `startingBalance` **второй раз**. Итог: вся линия «Остаток (факт)» смещена на `Δ(01.07)` на всём горизонте. Симметрично для прогноза: движок симулирует плановые потоки дня `horizonFrom` поверх баланса, который уже содержит фактические потоки этого дня. Искажаются KPI «Стартовый остаток», «Мин. остаток», «Первый разрыв» и сравнение план/факт — т.е. основная ценность раздела.
**Fix:** Якорить `startingBalance` на конец дня, предшествующего `horizonFrom`:
```typescript
// Касса — строго ДО первого дня горизонта:
where: { date: { lt: horizonFromDate } }

// Банк — asOf = предыдущий день:
const dayBefore = new Date(horizonFromDate.getTime() - 86_400_000)
const bankBalances = await Promise.all(
  bankAccounts.map((acc) => getBankBalanceAsOf(acc.id, dayBefore)),
)
```
Факт-ряд оставить `gte: horizonFromDate` — тогда день 1 считается ровно один раз в обеих линиях. Обновить формулировку в `docs/finance-cashflow-methodology.md` («на начало дня horizonFrom»). Добавить регрессионный тест на граничную дату.

## Warnings

### WR-01: Методология противоречит коду: «7% ежедневно + 1% в конце квартала» vs 8% одним платежом в конце квартала

**File:** `lib/finance-cashflow/data.ts:196-203`, `components/finance/CashflowMethodologyDialog.tsx:103-106`, `docs/finance-cashflow-methodology.md:65-67`
**Issue:** Диалог «Как считается» и docs заявляют: «7% от плановых выкупов **ежедневно** + 1% в конце каждого квартала». Код делает иначе: `computeQuarterAccrual(qtrBuyoutsRub, vatPct, incomeTaxPct)` = **(7+1)% всей квартальной базы одним оттоком в payDate** (30.09 / 31.12). Итоговая сумма совпадает, но тайминг радикально другой: внутри квартала остаток завышен относительно описанной модели, в конце квартала — обрыв на ~8% квартальной выручки. Пользователь, читающий справку, неверно интерпретирует внутриквартальные разрывы.
**Fix:** Либо привести код к описанию (ежедневное начисление 7% через `taxIdx` + 1% в конце квартала), либо исправить оба текста: «(НДС% + налог%) × выкупы квартала, уплата одним платежом в последний день квартала». Согласовать диалог и docs.

### WR-02: Кварталы налогов захардкожены на 2026 — при смене горизонта налоги молча исчезают

**File:** `lib/finance-cashflow/data.ts:183-193`
**Issue:** Массив `quarters` содержит только Q3/Q4 2026. Горизонт при этом берётся из редактируемого `salesPlan.horizon` (page.tsx:94-105) и передаётся любым диапазоном. Как только горизонт сдвинется в 2027 (следующая фиксация плана), для новых кварталов налоги не посчитаются вовсе — оттоки занижены, прогноз оптимистичен, без какого-либо предупреждения.
**Fix:** Генерировать кварталы из горизонта:
```typescript
function quartersInRange(fromIso: string, toIso: string) {
  const result: Array<{ from: string; to: string; payDate: string }> = []
  let y = Number(fromIso.slice(0, 4)), q = Math.ceil(Number(fromIso.slice(5, 7)) / 3)
  while (true) {
    const from = `${y}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`
    const toMonth = q * 3
    const lastDay = new Date(Date.UTC(y, toMonth, 0)).getUTCDate()
    const to = `${y}-${String(toMonth).padStart(2, "0")}-${lastDay}`
    if (from > toIso) break
    result.push({ from, to, payDate: to })
    q === 4 ? (q = 1, y++) : q++
  }
  return result
}
```

### WR-03: Дыры в факт-линии: дни без транзакций отдают null вместо неизменного остатка

**File:** `lib/finance-cashflow/data.ts:252-263`, `lib/finance-cashflow/engine.ts:174`, `components/finance/CashflowChart.tsx:133`
**Issue:** `balanceByDay` заполняется только для дат, где были `BankTransaction`/`CashEntry`. Для дней без движения (выходные, праздники) `actualMap.has(d)` = false → `actualBalance: null` → при `connectNulls={false}` линия факта на графике рвётся на сегменты. Но остаток в такие дни не «неизвестен» — он равен остатку предыдущего дня. График показывает отсутствие данных там, где данные однозначно определены.
**Fix:** Форвард-филл по каждому дню диапазона:
```typescript
let runningBalance = startingBalance
for (const d of eachDayIso(horizonFrom, actualTo)) {
  runningBalance += dayDeltaMap.get(d) ?? 0
  actualBalanceSeries.push({ date: d, balanceRub: runningBalance })
}
```
(вынести/переиспользовать `eachDayIso` из engine).

### WR-04: NaN из повреждённого AppSetting беззащитно проходит сквозь всю симуляцию

**File:** `lib/finance-cashflow/data.ts:71-76`
**Issue:** `Number(settingsMap.get("finance.cashflow.wbPayoutPct") ?? "55")` — если в БД лежит нечисловая строка (ручной SQL, сбой импорта), `Number("abc")` = NaN. NaN не перехватывается: `effectivePayout` → NaN → `balanceEnd` NaN на всех днях → пустой график, `fmtN(NaN)` в матрице, `minBalance` NaN. page.tsx для бара такой guard имеет (`Number.isFinite`, стр. 66-72), data.ts — нет. Server action валидирует запись, но это единственный слой.
**Fix:**
```typescript
function settingNum(map: Map<string, string>, key: string, def: number): number {
  const n = Number(map.get(key))
  return Number.isFinite(n) ? n : def
}
const wbPayoutPct = settingNum(settingsMap, "finance.cashflow.wbPayoutPct", 55)
```
Дефолты брать из `CASHFLOW_SETTING_DEFAULTS` (см. IN-01).

### WR-05: DI-контракт нарушен + неограниченный параллельный N+1 по курсам

**File:** `lib/finance-cashflow/data.ts:144-158` (также :86-88)
**Issue:** Заголовок файла декларирует DI («принимает db»), но `getBankBalanceAsOf` и `getRateForDate` из `lib/balance-data.ts` работают через глобальный `prisma` — мок `db` в unit-тестах не изолирует запросы, DI фиктивен. Дополнительно `realPurchasePayments` маппится в `Promise.all` с `await getRateForDate(...)` на каждый платёж без `amountRub` (до 2 запросов на платёж): при десятках PLANNED-платежей — залп параллельных запросов в пул соединений PostgreSQL одновременно с остальной загрузкой страницы (риск исчерпания пула → 500 на проде, где RAM/пул скромные).
**Fix:** Загрузить курсы одним запросом per валюта и резолвить в памяти:
```typescript
const currencies = [...new Set(purchasePaymentRows.filter(p => p.amountRub == null).map(p => p.currency))]
const ratesByCurrency = new Map<string, Array<{ date: Date; rateToRub: number }>>()
for (const code of currencies) {
  const rows = await db.currencyRate.findMany({ where: { code }, orderBy: { date: "asc" } })
  ratesByCurrency.set(code, rows.map(r => ({ date: r.date, rateToRub: Number(r.rateToRub) })))
}
// затем бинарный/линейный поиск последнего rate с date <= dueDate, fallback на самый ранний
```

### WR-06: Мёртвая функция buildWbPayoutSchedule с латентным багом (лаг захардкожен = 1)

**File:** `lib/finance-cashflow/engine.ts:70-80`
**Issue:** `buildWbPayoutSchedule` нигде не вызывается (`computeCashflow` строит расписание инлайн, стр. 120-124). Внутри — `wbCashDay(row.date, 1)` с комментарием «lagWeeks берётся из замыкания в computeCashflow», что ложь: никакого замыкания нет, лаг жёстко = 1. Если кто-то позже «переиспользует» эту готовую функцию, `wbPayoutLagWeeks` будет молча игнорироваться — мёртвый код с миной.
**Fix:** Удалить функцию целиком (инлайн-версия в `computeCashflow` — единственная рабочая), либо принять `lagWeeks` параметром и вызывать её из `computeCashflow`.

### WR-07: OVERDUE-платежи закупок исключены из прогноза — оттоки занижены

**File:** `lib/finance-cashflow/data.ts:129-140`
**Issue:** Фильтр `status: "PLANNED"` + `dueDate: { gte: horizonFromDate }`. Enum `PaymentStatus` = PLANNED | PAID | OVERDUE. Платёж, помеченный OVERDUE (просрочен, но будет оплачен), и PLANNED-платёж с `dueDate` до начала горизонта полностью выпадают из симуляции. Реальный предстоящий отток исчезает из прогноза → «Первый разрыв» и «Мин. остаток» оптимистичнее реальности — против назначения инструмента.
**Fix:** Включить `status: { in: ["PLANNED", "OVERDUE"] }` и платежи с `dueDate < horizonFrom` (не-PAID) относить на ближайшую дату горизонта (например, `max(dueDate, todayIsoMsk)`). Как минимум — задокументировать исключение в «Ограничения v1».

### WR-08: Конфликт классов bg-background + bg-muted на sticky-ячейке без tailwind-merge

**File:** `components/finance/CashflowMatrix.tsx:15-16, 154`
**Issue:** `STICKY_BASE` содержит `bg-background`; для subtotal-строк через template literal дописывается `bg-muted`: `${STICKY_BASE} ${isSubtotal ? "bg-muted ..." : "bg-background"}`. Два конфликтующих bg-* на одном элементе — победитель определяется порядком utility в собранном CSS, а не порядком классов в className: рендер непредсказуем (subtotal-ячейка может остаться `bg-background` и разойтись с `bg-muted` остальной строки). Образец `PlanFactMatrix.tsx` решает это через `cn()` (tailwind-merge, `lib/utils.ts`). Тот же дубль в non-subtotal ветке (`bg-background` дважды).
**Fix:**
```tsx
import { cn } from "@/lib/utils"
className={cn(STICKY_BASE, isSubtotal ? "bg-muted font-semibold text-foreground/80" : "bg-background")}
```
(Просвечивания нет — оба фона сплошные, инвариант CLAUDE.md соблюдён; проблема в недетерминированном цвете.)

### WR-09: Факт-ряд включает транзакции счетов, не вошедших в стартовый баланс

**File:** `lib/finance-cashflow/data.ts:81-89` vs `lib/finance-cashflow/data.ts:220-226`
**Issue:** `getBankBalanceAsOf` возвращает `null` для счёта без `closingBalance`/`balanceDate` — такой счёт даёт 0 в `startingBalance` (`b ?? 0`). Но факт-ряд (шаг 8) собирает дельты по **всем** RUR-счетам (`account: { currency: "RUR" }`) без этого условия. Транзакции счёта, чей базовый остаток не учтён, двигают факт-линию от якоря, в котором этого счёта нет → систематический перекос сравнения план/факт при появлении счёта без анкера.
**Fix:** Использовать один и тот же набор счетов: собрать `accountIds` со счётов, у которых `getBankBalanceAsOf` вернул не-null, и фильтровать `accountId: { in: accountIds }` в `txRows` (или наоборот — трактовать null-баланс как 0 явно и логировать).

### WR-10: Нулевые притоки WB в первые 1–2 недели горизонта — незадекларированный перекос старта

**File:** `lib/finance-cashflow/data.ts:110-117`, `lib/finance-cashflow/engine.ts:41-49`, `docs/finance-cashflow-methodology.md:104-111`
**Issue:** Выплата за выкупы недели N приходит в понедельник N+1 + lagWeeks — значит, первые `7 + lagWeeks×7` дней горизонта могут получить деньги только за выкупы **до** `horizonFrom`. Таких данных нет (revenueSeries начинается с horizonFrom), и первые ~2 недели июля показывают притоки = 0 при полных оттоках (опекс, закупки, платежи). Реально в эти дни поступят выплаты за июньские продажи. Стартовый участок систематически пессимистичен → ложные «Первый разрыв» в начале горизонта. В «Ограничениях v1» (диалог и docs) это не упомянуто.
**Fix:** Минимум — добавить пункт в «Ограничения v1» (диалог + docs). Лучше — подмешивать выкупы факта за `[horizonFrom − (1+lagWeeks)×7 дней, horizonFrom)` из `WbCardFunnelDaily` для построения входящих выплат стартовых недель.

## Info

### IN-01: Дублирование CASHFLOW_SETTING_KEYS (коллизия имён) и дефолтов

**File:** `lib/finance-cashflow/data.ts:25-32, 71-76`, `lib/cashflow-schemas.ts:18-34`, `app/(dashboard)/finance/cashflow/page.tsx:52-63`
**Issue:** Две константы с одинаковым именем `CASHFLOW_SETTING_KEYS` в разных модулях с разным содержимым (4 vs 6 ключей) — риск импорта не той; дефолты «55/1/0/0» захардкожены строками в data.ts вместо `CASHFLOW_SETTING_DEFAULTS` — дрейф при изменении дефолта. Плюс page.tsx читает те же 4 ключа из AppSetting, которые `loadCashflowInputs` тут же читает повторно (дублирующий запрос).
**Fix:** В data.ts импортировать канонический список и расширять: `[...CASHFLOW_SETTING_KEYS, "finance.vatPct", "finance.incomeTaxPct"]`; дефолты — из `CASHFLOW_SETTING_DEFAULTS`.

### IN-02: Неиспользуемый prop gapThresholdRub в CashflowMatrix

**File:** `components/finance/CashflowMatrix.tsx:111`, `app/(dashboard)/finance/cashflow/page.tsx:170-173`
**Issue:** Prop переименован в `_gapThresholdRub` и не используется — мёртвый API, page.tsx его передаёт.
**Fix:** Убрать prop из интерфейса и вызова, либо задействовать (например, подпись порога в шапке матрицы).

### IN-03: AssumptionsBar: нет ресинка/отката значений и очистки таймеров

**File:** `components/finance/CashflowAssumptionsBar.tsx:88-99, 114-125, 152`
**Issue:** (a) `values` инициализируются из `initialSettings` один раз — после неудачного сохранения поле продолжает показывать отклонённое значение без отката; изменения второго администратора не подтягиваются до перезагрузки. (b) Таймеры не чистятся на unmount (`useEffect` cleanup отсутствует) — отложенный save может выстрелить после ухода со страницы. (c) `disabled={isPending}` блокирует все 4 инпута на время transition — кратковременная потеря фокуса при наборе.
**Fix:** На `result.ok === false` откатывать значение поля к последнему сохранённому; добавить `useEffect(() => () => Object.values(timersRef.current).forEach(clearTimeout), [])`.

### IN-04: Server action возвращает сырое сообщение внутренней ошибки в клиентский toast

**File:** `app/actions/cashflow.ts:77-79`
**Issue:** `return { ok: false, error: (e as Error).message }` — текст Prisma-ошибки (имена таблиц, connection string детали) уходит в toast. Внутренняя ERP — риск низкий, но паттерн лучше не тиражировать.
**Fix:** `return { ok: false, error: "Не удалось сохранить настройку" }` + `console.error(e)` на сервере.

### IN-05: Метки графика "MM-DD" неоднозначны при горизонте через границу года

**File:** `components/finance/CashflowChart.tsx:86, 92`
**Issue:** `d.date.slice(5)` даёт дубликаты категорий, если горизонт когда-либо пересечёт год (v2 — скользящий горизонт): ReferenceLine `x={todayLabel}` привяжется к первому вхождению. Для фиксированного H2-2026 безопасно — латентно для v2.
**Fix:** Использовать полную дату как dataKey категории и форматировать в tickFormatter.

### IN-06: Пробелы покрытия тестов: loanRub никогда не срабатывает, опекс/бакеты/налоги не покрыты

**File:** `tests/finance-cashflow-engine.test.ts:43`
**Issue:** `loanPayments: [{ date: "2026-07-15", ... }]` — дата вне горизонта (to = 2026-07-14), т.е. ни один тест не проверяет ветку кредитных оттоков (и не ассертит, что вне-горизонтные платежи отбрасываются). Нет тестов: распределение опекса по дням месяца, агрегация бакетов (`balanceEnd` = последний день бакета), `actualBalance`-маппинг, налоговый отток.
**Fix:** Сдвинуть платёж в горизонт + assert `loanRub`; добавить тест на опекс (Σ за полный месяц = opexMonthlyRub) и на бакеты.

### IN-07: salesPlan.horizon принимается без валидации формата дат

**File:** `app/(dashboard)/finance/cashflow/page.tsx:96-105`
**Issue:** `parsed.from`/`parsed.to` проверяются только на truthiness. Мусорная строка → `eachDayIso` вернёт пустой массив → страница молча показывает «Нет данных» вместо fallback H2-2026.
**Fix:** `/^\d{4}-\d{2}-\d{2}$/.test(parsed.from)` && то же для `to` && `from <= to` перед принятием.

---

_Reviewed: 2026-07-05T20:10:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
