---
phase: 28-cashflow
fixed_at: 2026-07-06T05:10:00Z
review_path: .planning/phases/28-cashflow/28-REVIEW.md
iteration: 2
findings_in_scope: 18
fixed: 18
skipped: 0
status: all_fixed
---

# Phase 28: Code Review Fix Report

**Fixed at:** 2026-07-06T05:10:00Z (волна 2) / 2026-07-05T20:30:00Z (волна 1)
**Source review:** .planning/phases/28-cashflow/28-REVIEW.md
**Iteration:** 2 (две волны)

**Summary:**
- Findings in scope: 18 (волна 1: CR-01, WR-01, WR-02, WR-03, WR-05 лайт, WR-06, WR-07, WR-10, IN-01, IN-02, IN-06; волна 2: WR-04, WR-08, WR-09, IN-03, IN-04, IN-05, IN-07)
- Fixed: 18
- Skipped: 0

**Гейты:**
- `npx vitest run tests/finance-cashflow-engine.test.ts tests/sales-plan-engine.test.ts tests/sales-plan-iu.test.ts` — 27/27 green (включая новый регресс CR-01 и Test 6 loanRub)
- `npx tsc --noEmit` — чист
- `npm run build` — зелёный

## Fixed Issues

### CR-01: Двойной счёт потоков первого дня горизонта

**Files modified:** `lib/finance-cashflow/data.ts`, `tests/finance-cashflow-engine.test.ts`, `docs/finance-cashflow-methodology.md`
**Commit:** 3e83424
**Applied fix:** Стартовый баланс якорится на конец дня перед horizonFrom: банк — `getBankBalanceAsOf(acc.id, horizonFrom − 1 день)`, касса — `lt: horizonFromDate` вместо `lte`. Факт-ряд оставлен `gte: horizonFromDate` — день 1 считается ровно один раз. Добавлен регрессионный тест (мок balance-data/pdds-feed + fake db): транзакция днём horizonFrom входит в факт-ряд, но не в стартовый баланс. Методология уточнена («на начало первого дня горизонта»). Семантика подтверждена тестом.

### WR-02: Кварталы налогов захардкожены на 2026

**Files modified:** `lib/finance-cashflow/data.ts`
**Commit:** a6afe4b
**Applied fix:** `quartersInRange(from, to)` — календарные кварталы любого года, пересекающиеся с горизонтом; дата уплаты = последний день квартала, обрезанный по horizonTo (частичный квартал платится в последний день горизонта).

### WR-03: Дыры в факт-линии (null в дни без транзакций)

**Files modified:** `lib/finance-cashflow/data.ts`, `lib/finance-cashflow/engine.ts`
**Commit:** 327e037
**Applied fix:** Форвард-филл по каждому дню [horizonFrom..min(horizonTo, сегодня МСК)] — день без движений получает остаток предыдущего дня. `eachDayIso` экспортирован из engine и переиспользован в data.ts.

### WR-06: Мёртвая buildWbPayoutSchedule с захардкоженным лагом

**Files modified:** `lib/finance-cashflow/engine.ts`
**Commit:** 811bfe1
**Applied fix:** Функция удалена целиком. Живой путь — инлайн-расписание в `computeCashflow` с `inputs.wbPayoutLagWeeks` (проверено).

### WR-05 (лайт): N+1 по курсам валют

**Files modified:** `lib/finance-cashflow/data.ts`
**Commit:** 221bff1
**Applied fix:** Map-кэш по ключу `${currency}:${dateIso}` + последовательный резолв вместо `Promise.all` — без залпа параллельных запросов в пул. Полноценный DI-рефакторинг НЕ делался (по scope).

### WR-07: OVERDUE-платежи исключены из прогноза

**Files modified:** `lib/finance-cashflow/data.ts`, `docs/finance-cashflow-methodology.md`, `components/finance/CashflowMethodologyDialog.tsx`
**Commit:** 9d77acc
**Applied fix:** Enum `PaymentStatus` содержит OVERDUE — платежи включены: `{ status: "OVERDUE", dueDate: { lte: horizonToDate } }`, дата оттока = max(dueDate, сегодня МСК, horizonFrom) (последний clamp — чтобы движок не отбросил дату вне горизонта). Методология обновлена.

### WR-01: Методология противоречит коду по налогам

**Files modified:** `docs/finance-cashflow-methodology.md`, `components/finance/CashflowMethodologyDialog.tsx`
**Commit:** 6060604
**Applied fix:** Дока приведена к коду (не наоборот): 8% (7% + 1%) начисляется на выкупы квартала и списывается одним платежом в последний день квартала; добавлена оговорка про тайминг (внутри квартала налог не резервируется).

### WR-10: Незадекларированный перекос старта (притоки первых недель)

**Files modified:** `docs/finance-cashflow-methodology.md`, `components/finance/CashflowMethodologyDialog.tsx`
**Commit:** ae7b868
**Applied fix:** В «Ограничения v1» (docs + диалог) добавлен пункт: выплаты WB за выкупы до начала горизонта не моделируются — притоки первых ~1–2 недель занижены, возможен ложный ранний «разрыв». Код не менялся (по scope).

### IN-01: Дублирование CASHFLOW_SETTING_KEYS и дефолтов

**Files modified:** `lib/finance-cashflow/data.ts`
**Commit:** b84d140
**Applied fix:** data.ts импортирует канонические `CASHFLOW_SETTING_KEYS`/`CASHFLOW_SETTING_DEFAULTS` из `lib/cashflow-schemas.ts`; локальный дубль с коллизией имени заменён на `LOADER_SETTING_KEYS` (расширение налоговыми ключами); дефолты бара — через `settingOrDefault()`.

### IN-06: Ветка loanRub не покрыта тестами

**Files modified:** `tests/finance-cashflow-engine.test.ts`
**Commit:** 045def6
**Applied fix:** Кредитный платёж фикстуры сдвинут с 2026-07-15 (вне горизонта) на 2026-07-14 + Test 6: `loanRub` попадает в отток ровно своего дня, суммарный кредитный отток = сумме платежа.

### IN-02: Неиспользуемый prop gapThresholdRub в CashflowMatrix

**Files modified:** `components/finance/CashflowMatrix.tsx`, `app/(dashboard)/finance/cashflow/page.tsx`
**Commit:** aa9d777
**Applied fix:** Prop удалён из интерфейса и вызова.

## Волна 2 (2026-07-06) — оставшиеся находки

Закрыты все находки, не вошедшие в волну 1. Гейты волны 2:
- `npx vitest run tests/finance-cashflow-engine.test.ts tests/sales-plan-engine.test.ts tests/sales-plan-iu.test.ts` — 29/29 green (включая новые регрессы WR-04 и WR-09)
- `npx tsc --noEmit` — чист
- `npm run build` — зелёный

| ID | Коммит | Файлы | Что сделано |
|----|--------|-------|-------------|
| WR-04 | `5822d65` | `lib/finance-cashflow/data.ts`, `tests/finance-cashflow-engine.test.ts` | NaN-guard настроек: `settingNum()` (Number.isFinite + пустая строка → дефолт) для 4 ключей бара + vatPct/incomeTaxPct. Регрессионный тест на fake db. |
| WR-08 | `6358725` | `components/finance/CashflowMatrix.tsx` | Конфликт `bg-background`+`bg-muted` на sticky label-ячейке решён через `cn()` (tailwind-merge) — цвет subtotal детерминирован. Period-ячейки тоже переведены на `cn()`. |
| WR-09 | `ea33e1c` | `lib/finance-cashflow/data.ts`, `tests/finance-cashflow-engine.test.ts` | Факт-ряд фильтруется по `anchoredAccountIds` (счета, где `getBankBalanceAsOf` ≠ null) — единый набор счетов со стартовым балансом. Регрессионный тест (счёт без анкера исключается из txRows). |
| IN-03 | `8a97204` | `components/finance/CashflowAssumptionsBar.tsx` | Откат поля к последнему сохранённому значению при `result.ok=false` (через `lastSavedRef`, без клоббера если пользователь уже печатает новое) + `useEffect`-cleanup pending debounce-таймеров на unmount. |
| IN-04 | `dcee0db` | `app/actions/cashflow.ts` | Оба catch возвращают нейтральное сообщение («Не удалось сохранить настройку» / «Не удалось проверить доступ»), сырая ошибка — в `console.error` на сервере. |
| IN-05 | `b3853cd` | `components/finance/CashflowChart.tsx` | Категория оси X — полная ISO-дата (уникальна через границу года), MM-DD только в `tickFormatter`; `ReferenceLine x={today}`; tooltip — DD.MM.YYYY. |
| IN-07 | `4fd31e5` | `app/(dashboard)/finance/cashflow/page.tsx` | `salesPlan.horizon`: regex `YYYY-MM-DD` на from/to + `from <= to`, иначе fallback H2-2026 (вместо молчаливого «Нет данных»). |

Замечание из IN-03(c) — `disabled={isPending}` на инпутах (кратковременная потеря фокуса) — сознательно не менялось: секция Fix ревью его не требовала, изменение UX вне scope.

---

_Fixed: 2026-07-06T05:10:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
