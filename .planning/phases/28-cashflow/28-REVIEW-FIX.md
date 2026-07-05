---
phase: 28-cashflow
fixed_at: 2026-07-05T20:30:00Z
review_path: .planning/phases/28-cashflow/28-REVIEW.md
iteration: 1
findings_in_scope: 11
fixed: 11
skipped: 0
status: all_fixed
---

# Phase 28: Code Review Fix Report

**Fixed at:** 2026-07-05T20:30:00Z
**Source review:** .planning/phases/28-cashflow/28-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 11 (по явному scope промпта: CR-01, WR-01, WR-02, WR-03, WR-05 лайт, WR-06, WR-07, WR-10, IN-01, IN-02, IN-06)
- Fixed: 11
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

## Не в scope (зафиксированы в REVIEW.md, ждут отдельного решения)

- **WR-04** (NaN-guard AppSetting в data.ts) — не входил в scope фиксов; частично смягчён IN-01 (дефолты из канонического источника), но `Number("abc")` guard не добавлялся.
- **WR-08** (конфликт bg-классов в CashflowMatrix) — не входил в scope.
- **WR-09** (факт-ряд включает счета без анкера баланса) — не входил в scope.
- **IN-03** (ресинк/откат AssumptionsBar), **IN-04** (сырой текст ошибки в toast), **IN-05** (метки MM-DD через границу года), **IN-07** (валидация salesPlan.horizon) — явно исключены промптом.

---

_Fixed: 2026-07-05T20:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
