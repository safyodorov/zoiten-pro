---
phase: 28-cashflow
verified: 2026-07-05T23:40:00Z
status: passed
score: 21/21 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Рендер /finance/cashflow на проде — все секции отображаются"
    expected: "KPI-карточки, график (прогноз + факт-линия), sticky-матрица 10 строк"
    why_human: "Фаза ещё не задеплоена; деплой после UAT. Проверка визуального рендера, разрывов scroll, темы dark."
  - test: "AssumptionsBar — изменить wbPayoutPct → матрица пересчиталась"
    expected: "Debounce 500ms → toast «Настройка сохранена» → RSC-рефреш → новые цифры в матрице"
    why_human: "Требует MANAGE-роль + живой сервер + AppSetting записан в БД."
  - test: "Пустое состояние при salesPlan.activeVersionId=null"
    expected: "Страница показывает CTA «Зафиксируйте план продаж», не матрицу"
    why_human: "На проде activeVersionId есть; для теста нужен временный сброс AppSetting."
  - test: "График: линия факта обрывается на «сегодня», после — только прогноз"
    expected: "connectNulls={false}: факт-линия до сегодня по МСК, пробел дальше; прогноз-линия непрерывна"
    why_human: "Визуальная корректность; форвард-филл (WR-03) даёт данные, но connectNulls=false должна скрывать будущие null."
---

# Phase 28: ПДДС (/finance/cashflow) — Verification Report

**Phase Goal:** Прогноз денежных потоков компании на горизонте плана продаж (H2-2026): когда и сколько денег придёт и уйдёт, где кассовые разрывы. Второй из трёх финансовых отчётов (Баланс → ОДДС/ПДДС → ОПиУ).
**Verified:** 2026-07-05T23:40:00Z
**Status:** passed (с human_verification пунктами — деплой сознательно отложен)
**Re-verification:** Нет — начальная верификация

Примечание к статусу: задание явно указывает использовать `passed` при наличии только human_verification (деплой не сделан намеренно), а не `human_needed`.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `computeCashflow` даёт дневной ряд: остаток(d) = остаток(d-1) + притоки(d) − оттоки(d), старт = startingBalance | ✓ VERIFIED | Test 1 (conservation) green; engine.ts строки 148-176: накопительный prevBalance |
| 2 | Приток WB агрегируется по дню выплаты (пн недели + 7д + lagWeeks×7) × wbPayoutPct/100 | ✓ VERIFIED | `wbCashDay()` в engine.ts:42-50; Test 2: 2026-07-01(Ср) → выплата 2026-07-13(Пн) |
| 3 | Разрыв детектируется когда balanceEnd < gapThresholdRub; firstGapDate = первая такая дата | ✓ VERIFIED | engine.ts:154-155; Test 3: isGap=true, firstGapDate="2026-07-05" |
| 4 | payoutModel сменная: кастомная payoutFn применяется вместо коэффициента (задел v2 per-product) | ✓ VERIFIED | `PayoutFn` тип + опциональный 3-й аргумент computeCashflow; Test 5: кастомная fn 90% vs 55% |
| 5 | `loadCashflowInputs` собирает притоки/виртуальные/закупки/кредиты/налоги/старт-баланс через DI | ✓ VERIFIED | data.ts: 8 групп (AppSetting, банк RUR, касса, revenue, virtualPayments, purchase, loan, tax, actualBalance) |
| 6 | Анти-двойной счёт: virtualPayments из `getPlannedVirtualPayments` (CONVERTED/DISMISSED исключены на уровне контракта), versionStale проброшен | ✓ VERIFIED | Test 4: движок передаёт virtualPayments as-is; data.ts:167-170 вызов pdds-feed |
| 7 | AppSetting finance.cashflow.* засеяны: wbPayoutPct=55, wbPayoutLagWeeks=1, opexMonthlyRub=0, gapThresholdRub=0 | ✓ VERIFIED | migration.sql: 4 INSERT ON CONFLICT DO NOTHING без createdAt |
| 8 | Страница /finance/cashflow рендерит матрицу потоков × бакеты вместо ComingSoon-заглушки | ✓ VERIFIED | page.tsx: "ComingSoon" = 0; FinanceTabs tab ОДДС → /finance/cashflow; RSC с loadCashflowInputs→computeCashflow |
| 9 | Нет активной версии → пустое состояние с CTA «Зафиксируйте план продаж» | ✓ VERIFIED | page.tsx:77-91: if (!activeVersionId) → пустой стейт |
| 10 | KPI-карточки: Стартовый остаток, Мин. остаток, Дата первого разрыва, Net за горизонт | ✓ VERIFIED | CashflowKpiCards.tsx: 4 карточки из CashflowResult |
| 11 | График: линия остатка (прогноз) + линия факта до сегодня + ReferenceLine порог/сегодня | ✓ VERIFIED | CashflowChart.tsx: 2 Line + 2 ReferenceLine; connectNulls={false} на факт-линии |
| 12 | Матрица подсвечивает красным остаток при разрыве (hasGap) | ✓ VERIFIED | CashflowMatrix.tsx: gapCellClass(b.hasGap) на строке «Остаток на конец» |
| 13 | Гранулярность день/неделя/месяц переключается через URL searchParam | ✓ VERIFIED | page.tsx: allow-list ["day","week","month"], Link prefetch={false} |
| 14 | При versionStale — жёлтое предупреждение «виртуальные закупки изменили статус» | ✓ VERIFIED | page.tsx:153-156: amber-border div при result.versionStale |
| 15 | MANAGE-пользователь редактирует 4 допущения через дебаунснутый бар | ✓ VERIFIED | CashflowAssumptionsBar.tsx: 500ms debounce через timersRef, updateCashflowSetting |
| 16 | AssumptionsBar рендерится ТОЛЬКО при getSectionRole('FINANCE')==='MANAGE' | ✓ VERIFIED | page.tsx:150: `{canManage && <CashflowAssumptionsBar ...>}` |
| 17 | Server action updateCashflowSetting требует requireSection('FINANCE','MANAGE') + zod | ✓ VERIFIED | actions/cashflow.ts: requireSection + cashflowSettingSchema.safeParse |
| 18 | Изменение допущения → AppSetting → router.refresh() → пересчёт RSC | ✓ VERIFIED | AssumptionsBar: `toast.success + router.refresh()` в startTransition; revalidatePath("/finance/cashflow") в action |
| 19 | Кнопка «Как считается» открывает диалог с методологией ПДДС | ✓ VERIFIED | CashflowMethodologyDialog.tsx: sm:max-w-3xl, render-prop (не asChild=0) |
| 20 | docs/finance-cashflow-methodology.md описывает формулы притоков/оттоков/тайминга/налогов | ✓ VERIFIED | 9198 байт, wbPayoutPct/тайминг/кварталы/ограничения v1 — все секции есть |
| 21 | CR-01 исправлен: стартовый баланс якорится на конец дня ПЕРЕД horizonFrom | ✓ VERIFIED | data.ts:130-140: `dayBeforeHorizon = horizonFrom − 1d`; каcса `lt:` вместо `lte:`; Test CR-01 регрессия green |

**Score: 21/21 truths verified**

---

### Required Artifacts

| Artifact | Provides | Status | Детали |
|----------|----------|--------|--------|
| `lib/finance-cashflow/types.ts` | CashflowInputs/Day/Bucket/Result + PayoutModelType (pure) | ✓ VERIFIED | 72 строки, ноль запрещённых импортов |
| `lib/finance-cashflow/engine.ts` | computeCashflow PURE — дневная симуляция + бакеты + gap + сменная PayoutFn | ✓ VERIFIED | 231 строка, eachDayIso экспортирован, wbCashDay верна |
| `lib/finance-cashflow/data.ts` | loadCashflowInputs DI-загрузчик 8 групп | ✓ VERIFIED | 335 строк, CR-01/WR-02/WR-03/WR-05/WR-07 исправлены |
| `tests/finance-cashflow-engine.test.ts` | 6 тестов (conservation, WB timing, gap, anti-double, payout switch, loanRub) + CR-01 регрессия | ✓ VERIFIED | 27/27 green (включая sales-plan golden) |
| `prisma/migrations/20260705_phase28_cashflow_seed/migration.sql` | AppSetting-сид 4 ключа finance.cashflow.* | ✓ VERIFIED | ON CONFLICT DO NOTHING, без createdAt |
| `app/(dashboard)/finance/cashflow/page.tsx` | RSC force-dynamic, RBAC, granularity, пустое состояние, versionStale | ✓ VERIFIED | ComingSoon = 0, requireSection FINANCE, canManage |
| `components/finance/CashflowKpiCards.tsx` | 4 KPI-карточки | ✓ VERIFIED | firstGapDate/startingBalance/minBalance/netTotal |
| `components/finance/CashflowChart.tsx` | recharts прогноз+факт+2 ReferenceLine | ✓ VERIFIED | 2 ReferenceLine, var(--muted-foreground) тики, connectNulls=false |
| `components/finance/CashflowMatrix.tsx` | sticky-матрица 10 строк × бакеты с gap-подсветкой | ✓ VERIFIED | border-separate, 0 прозрачных sticky bg, hasGap |
| `lib/cashflow-schemas.ts` | pure zod-схемы + CASHFLOW_SETTING_KEYS/DEFAULTS | ✓ VERIFIED | Нет "use server" директивы, cashflowSettingSchema + isValidCashflowSettingKey |
| `app/actions/cashflow.ts` | updateCashflowSetting MANAGE + zod + upsert | ✓ VERIFIED | requireSection MANAGE, safeParse, revalidatePath, createdAt = 0 |
| `components/finance/CashflowAssumptionsBar.tsx` | дебаунснутый редактор 4 допущений | ✓ VERIFIED | 500ms timersRef, startTransition, router.refresh |
| `components/finance/CashflowMethodologyDialog.tsx` | диалог «Как считается» | ✓ VERIFIED | sm:max-w-3xl, render-prop, asChild = 0 |
| `docs/finance-cashflow-methodology.md` | методология ПДДС | ✓ VERIFIED | Содержательный документ 9198 байт |

---

### Key Link Verification

| From | To | Via | Status | Детали |
|------|----|-----|--------|--------|
| `lib/finance-cashflow/data.ts` | `lib/sales-plan/pdds-feed.ts` | `getPlannedRevenueSeries` + `getPlannedVirtualPayments` | ✓ WIRED | Импорт + вызов в шагах 3 и 4 |
| `lib/finance-cashflow/engine.ts` | `lib/date-buckets.ts` | `bucketKey` / `bucketLabel` / `Granularity` | ✓ WIRED | Импорт + вызов в агрегации бакетов (строки 185, 190) |
| `app/(dashboard)/finance/cashflow/page.tsx` | `lib/finance-cashflow/data.ts + engine.ts` | `loadCashflowInputs → computeCashflow` | ✓ WIRED | Импорт + вызов строки 108-113 |
| `app/(dashboard)/finance/cashflow/page.tsx` | `AppSetting salesPlan.activeVersionId` | `findMany + activeVersionId check` | ✓ WIRED | Строки 52-74; пустое состояние при null |
| `components/finance/CashflowAssumptionsBar.tsx` | `app/actions/cashflow.ts` | `updateCashflowSetting + router.refresh` | ✓ WIRED | Импорт + вызов в handleChange→startTransition |
| `app/(dashboard)/finance/cashflow/page.tsx` | `components/finance/CashflowAssumptionsBar.tsx` | `canManage && <CashflowAssumptionsBar>` | ✓ WIRED | Строка 150 page.tsx |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `CashflowKpiCards` | `result: CashflowResult` | `computeCashflow(inputs)` из RSC page | Да — из БД через loadCashflowInputs | ✓ FLOWING |
| `CashflowChart` | `days: CashflowDay[]` | `result.days` из computeCashflow | Да — дневная симуляция | ✓ FLOWING |
| `CashflowMatrix` | `buckets: CashflowBucket[]` | `result.buckets` из computeCashflow | Да — агрегация дней по granularity | ✓ FLOWING |
| `CashflowAssumptionsBar` | `initialSettings` | AppSetting.findMany в RSC page | Да — из БД, fallback CASHFLOW_SETTING_DEFAULTS | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 27 тестов движка green | `npx vitest run tests/finance-cashflow-engine.test.ts tests/sales-plan-engine.test.ts tests/sales-plan-iu.test.ts` | 27 passed | ✓ PASS |
| tsc чист | `npx tsc --noEmit` | 0 ошибок | ✓ PASS |
| eachDayIso экспортирован из engine | `grep -c "export function eachDayIso" lib/finance-cashflow/engine.ts` | 1 | ✓ PASS |
| WR-06: мёртвая buildWbPayoutSchedule удалена | `grep -c "buildWbPayoutSchedule" lib/finance-cashflow/engine.ts` | 0 | ✓ PASS |
| Sticky bg без /NN в CashflowMatrix | `grep -c "bg-background/\|bg-muted/40\|bg-muted/60\|bg-card/" components/finance/CashflowMatrix.tsx` | 0 | ✓ PASS |

---

### Requirements Coverage

Фаза 28 объявлена без requirement IDs (после исходного REQUIREMENTS.md). Верификация по must_haves планов 28-01/02/03 и LOCKED-решениям D-1..D-9 из 28-CONTEXT.md.

| LOCKED-решение | Статус | Evidence |
|---------------|--------|----------|
| D-1: payout-модель сменная (coefficient v1, per-product v2) | ✓ | PayoutFn тип + опциональный 3-й аргумент; payoutModel: "coefficient" в types/data |
| D-2: тайминг WB пн+лаг, wbCashDay скопирована | ✓ | engine.ts:42-50; Test 2 golden |
| D-3: 5 оттоков (реал.закупки, виртуальные, кредиты, налоги, опекс) | ✓ | data.ts шаги 5-7+opex; матрица строки 53-106 |
| D-4: факт-ряд остатка включён | ✓ | actualBalanceSeries в data.ts шаг 8; chart-линия факта; WR-03 форвард-филл |
| D-5: gapThresholdRub дефолт 0, редактируемый | ✓ | cashflow-schemas.ts + AppSetting сид |
| D-6: консолидация RUR-счетов | ✓ | data.ts: bankAccounts where {currency: "RUR"}, cashEntry sum |
| D-7: горизонт из salesPlan.horizon, нет fallback на драфт | ✓ | page.tsx: activeVersionId check + пустое состояние |
| D-8: RBAC read=FINANCE, write=MANAGE, бар только MANAGE | ✓ | requireSection/getSectionRole; canManage && AssumptionsBar; двойная защита |
| D-9: read-only матрица, редактируемые только допущения (zod-валидация) | ✓ | cashflowSettingSchema per-ключ границы; updateCashflowSetting единственная точка записи |

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `components/finance/CashflowMatrix.tsx:153` | `${STICKY_BASE} ${isSubtotal ? "bg-muted ..." : "bg-background"}` — два конфликтующих bg-* без cn(tailwind-merge) | ⚠ Warning | Визуально subtotal-строки могут показывать не тот фон (недетерминированно при смене CSS-сборки). Зафиксирован как WR-08 в REVIEW.md. Не блокер: оба фона сплошные (инвариант CLAUDE.md соблюдён), пока нет репортов о проблеме на проде. |

Все прочие обнаруженные REVIEW-находки задокументированы и закрыты (CR-01, WR-01..07, WR-10, IN-01, IN-02, IN-06 — всего 11).

---

### Open Warnings (известные, не-блокеры — задокументированы в 28-REVIEW.md)

| ID | Описание | Файл | Решение |
|----|----------|------|---------|
| WR-04 | NaN-guard отсутствует в data.ts для AppSetting (частично смягчён IN-01 дефолтами) | `lib/finance-cashflow/data.ts:116-117` | Добавить `settingNum()` helper в следующем hotfix |
| WR-08 | Конфликт bg-классов в CashflowMatrix sticky-ячейке (без cn/tailwind-merge) | `components/finance/CashflowMatrix.tsx:153` | Рефактор на `cn(STICKY_BASE, ...)` |
| WR-09 | Факт-ряд включает счета без анкера баланса (`getBankBalanceAsOf` вернул null) | `lib/finance-cashflow/data.ts:275-280` | Фильтровать по accountIds со non-null балансом |
| IN-03 | AssumptionsBar: нет отката при ошибке сохранения, нет cleanup таймеров на unmount | `components/finance/CashflowAssumptionsBar.tsx` | useEffect cleanup + откат значения |
| IN-04 | action возвращает сырой текст Prisma-ошибки в toast | `app/actions/cashflow.ts:78` | Обобщить сообщение + console.error |
| IN-05 | Метки графика "MM-DD" — дубли при горизонте через границу года | `components/finance/CashflowChart.tsx:86` | Латентно для v2 скользящего горизонта |
| IN-07 | salesPlan.horizon из AppSetting не валидируется regex | `app/(dashboard)/finance/cashflow/page.tsx:98-104` | `/.test()` + fallback явный |

---

### Human Verification Required

Следующие проверки требуют живого деплоя + браузерного UAT. Фаза ещё не задеплоена (сознательно отложено).

#### 1. Полный рендер /finance/cashflow

**Test:** Открыть https://zoiten.pro/finance/cashflow после деплоя
**Expected:** KPI-карточки (4 штуки с реальными цифрами), график (прогноз + факт-линия), sticky-матрица 10 строк × 6 месяцев (H2-2026), granularity switcher
**Why human:** Визуальный рендер, overflow, dark-тема

#### 2. AssumptionsBar — дебаунснутое сохранение

**Test:** Залогиниться как MANAGE, изменить «Выплата WB» с 55 → 60
**Expected:** Через 500ms: toast «Настройка сохранена», RSC обновился, «Выплата WB» в матрице пересчиталась
**Why human:** Требует MANAGE-права + живой сервер + AppSetting в БД

#### 3. Пустое состояние при отсутствии activeVersionId

**Test:** Временно обнулить salesPlan.activeVersionId в AppSetting, открыть /finance/cashflow
**Expected:** Страница показывает «Нет активной версии плана продаж» + CTA «Зафиксируйте план продаж», без матрицы
**Why human:** На проде activeVersionId есть, нужно временное вмешательство

#### 4. График: факт-линия до сегодня, прогноз-линия всегда

**Test:** Визуально: линия «Остаток (факт)» заканчивается сегодня (вертикаль «сегодня»), далее — null-gap; линия «Остаток (прогноз)» непрерывна на весь горизонт
**Expected:** connectNulls={false} корректно отображает разрыв
**Why human:** Визуальная корректность требует браузера

---

### Gaps Summary

Гапов нет. Все 21 must-have труths верифицированы. Известные открытые предупреждения (WR-04, WR-08, WR-09, IN-03, IN-04, IN-05, IN-07) задокументированы в REVIEW.md и не блокируют цель фазы.

Фаза достигла своей цели: прогноз денежных потоков H2-2026 реализован как работающий модуль с pure-движком, DI-загрузчиком, RSC-страницей, редактируемыми допущениями и методологией.

---

_Verified: 2026-07-05T23:40:00Z_
_Verifier: Claude (gsd-verifier)_
