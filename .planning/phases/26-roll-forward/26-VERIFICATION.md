---
phase: 26-roll-forward
verified: 2026-07-05T12:00:00Z
status: human_needed
score: 11/11
overrides_applied: 0
human_verification:
  - test: "Открыть /sales-plan/products в режиме редактирования, установить уровень на первый месяц — галка «Распространить на последующие месяцы» должна быть включена по умолчанию; после «Пересчитать план» авто-месяцы должны получить тот же уровень, ручные месяцы (если есть) — остаться нетронутыми"
    expected: "Уровень распространяется в авто-месяцы, ручные не перезаписываются"
    why_human: "Требует живого взаимодействия с БД + UI; нельзя проверить grep-ом"
  - test: "На товаре с нехваткой стока в конкретном месяце в матрице должен быть виден бейдж «срезано −X% · приход dd.mm» (янтарный) в ячейке этого месяца (не в других месяцах где сток восстановился)"
    expected: "Бейдж «срезано −X%» только на месяцах с per-month недоливом > 2%, бейдж «⚠ нет товара» на месяцах без товара вовсе"
    why_human: "Требует реальных данных со стокаутом в конкретный месяц горизонта"
  - test: "Кнопка «Сбросить ручные (месяц): Август» — нажать, убедиться что toast «Сброшено ручных уровней: N», таблица обновилась (N уровней стёрто)"
    expected: "resetMonthLevelsToAuto сбрасывает уровни по колонке, toast показывает реальный deletedCount"
    why_human: "Требует живой БД с ручными уровнями и UI"
  - test: "Крон-роут GET /api/cron/sales-plan-rollforward с корректным x-cron-secret возвращает {ok:true}; без заголовка — 401"
    expected: "Авторизация работает, regenerateVirtualPurchasesInternal завершается без ошибок"
    why_human: "Требует запущенного сервера + CRON_SECRET из env"
---

# Phase 26: Roll-Forward — Verification Report

**Phase Goal:** Довести `/sales-plan` до ручной рабочей модели пользователя: (A/SP-15) автопротяжка месячного уровня вперёд с галкой «распространить дальше» + сброс ручных→авто; (B/SP-16) явное предупреждение в матрице при срезе/обнулении плана; (C/SP-17) динамический roll-forward виртуальных отгрузок (просроченные авто-ACCEPTED сдвигаются вперёд) + ежедневный крон.

**Verified:** 2026-07-05T12:00:00Z
**Status:** human_needed (все технические проверки VERIFIED; 4 пункта требуют UI/live тестирования)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | distributeMonthLevelForward исключает месяцы с явным SalesPlanMonthLevel (ручные не перезаписываются) | VERIFIED | `lib/sales-plan/distribute-forward.ts:14` — `return args.horizonMonths.filter(m => m > args.targetMonth && !manual.has(m))`; test «не перезаписывает ручные» GREEN |
| 2 | saveMonthLevels принимает distributeForward и применяет (загружает existing → вызывает хелпер → upsert авто-месяцев) | VERIFIED | `app/actions/sales-plan.ts:135,143-184` — opts.distributeForward + opts.horizonMonths → findMany existing → distributeMonthLevelForward → expandedPayload |
| 3 | resetMonthLevelsToAuto покрывает по товару/месяцу/выбранным + защита от пустого where (Zod .refine) | VERIFIED | `app/actions/sales-plan.ts:372-384` — ResetMonthLevelsSchema с `.refine` требует ≥1 критерий; RBAC requireSection("SALES","MANAGE") на строке 397 |
| 4 | UI: тумблер «Распространить на последующие месяцы» (default on) + заметный ✕ в ячейке + массовый сброс по товару/месяцу | VERIFIED (code) | `ProductPlanTable.tsx:186,352,356` — `useState(true)` + checkbox; `ProductPlanCell.tsx:134-143` — `<button> ✕` в div[role="button"] при `value != null && !readOnly`; `ProductPlanTable.tsx:389,507` — два вызова resetMonthLevelsToAuto |
| 5 | Бейдж «срезано −X% · приход dd.mm» рендерится per-month (из planResult.days, порог 2%) | VERIFIED | `ProductPlanTable.tsx:553,562,625-629` — `monthShortfall(psr.days, monthPrefix, ...)`, `sf.lostShare > 0.02`, `срезано −{cutPct}%` |
| 6 | Плашка «⚠ нет товара · dd.mm» при нулевом месяце из-за стокаута | VERIFIED | `ProductPlanTable.tsx:560,620-623` — `isEmptyMonth = monthPlanUnits < 0.5 && stockoutInOrBefore` + span «⚠ нет товара» |
| 7 | Срез считается ПО МЕСЯЦУ (not product-total): бейдж не появляется на месяцах после восстановления стока | VERIFIED | `monthShortfall` фильтрует дни по `monthPrefix` (строка 153); `isCutMonth = !isEmptyMonth && sf.lostShare > 0.02` — per-month доля |
| 8 | rollForwardAcceptedArrivals сдвигает ТОЛЬКО source="auto" ACCEPTED с orderDate<today; manual не трогает | VERIFIED | `lib/sales-plan/virtual-purchases.ts:173-183` — `isAutoAccepted = vp.source === "auto" && vp.status === "ACCEPTED"` + `overdue = vp.orderDate < today`; Test 3 (manual) GREEN |
| 9 | Инвариант orderDate≥today и expectedArrivalDate≥today+leadTime в регенерации; UPDATE в транзакции | VERIFIED | `app/actions/sales-plan.ts:907-1004` — rollForwardAcceptedArrivals применяется, `allShiftedVps` обновляет `existingByProduct`, `tx.virtualPurchase.update` в транзакции; deleteMany только status=SUGGESTED |
| 10 | Крон-роут с x-cron-secret guard + vpRollforwardCronTime(04:40)/vpRollforwardLastRun в dispatcher | VERIFIED | `app/api/cron/sales-plan-rollforward/route.ts:16` — guard; `dispatch/route.ts:40,74-75,158-176` — KV-ключи + shouldFireCron + dynamic import |
| 11 | Движок engine.ts НЕ изменён; golden anchor iu===438_068_120 цел | VERIFIED | git log e44c2c2..348bee9: engine.ts отсутствует в diff; `tests/sales-plan-iu.test.ts:17-18` — golden anchor в неизменённом тесте |

**Score:** 11/11 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/sales-plan/distribute-forward.ts` | Чистый хелпер distributeMonthLevelForward | VERIFIED | Существует, 24 строки, экспортирована, без Next.js зависимостей |
| `app/actions/sales-plan.ts` | saveMonthLevels(distributeForward) + resetMonthLevelsToAuto + rollForwardAcceptedArrivals wiring + export internal | VERIFIED | Все четыре элемента на местах (строки 135, 392, 805, 913) |
| `components/sales-plan/ProductPlanTable.tsx` | Тумблер + массовый сброс + бейдж среза + хелперы | VERIFIED | distributeForward state/checkbox, 2 вызова resetMonthLevelsToAuto, nextArrivalAfter/fmtDayMonth/fmtMonthShort/monthShortfall, бейдж |
| `components/sales-plan/ProductPlanCell.tsx` | Заметный ✕ в не-editing состоянии | VERIFIED | div[role="button"] с вложенным button ✕ при `value != null && !readOnly` (строка 134-143) |
| `lib/sales-plan/virtual-purchases.ts` | rollForwardAcceptedArrivals (pure, exported) | VERIFIED | `export function rollForwardAcceptedArrivals` на строке 168 |
| `app/api/cron/sales-plan-rollforward/route.ts` | GET-роут с x-cron-secret + vpRollforwardLastRun | VERIFIED | Существует, guard строка 16, upsert vpRollforwardLastRun строка 22 |
| `app/api/cron/dispatch/route.ts` | vpRollforwardCronTime default 04:40 + shouldFireCron + dynamic import | VERIFIED | KV-ключи строки 40,50; default "04:40" строка 74; shouldFireCron блок строки 158-176 |
| `tests/sales-plan-distribute-forward.test.ts` | 3 теста с vi.hoisted; ключевой «не перезаписывает ручные» | VERIFIED | 3 describe/it, vi.hoisted на строке 11, ключевая строка «не перезаписывает ручные» строка 40 |
| `tests/sales-plan-rollforward.test.ts` | 4 теста инварианта; ключевой «не прошлым числом» | VERIFIED | 4 it, «не прошлым числом» на строках 9 и 13 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|------|-----|--------|---------|
| `ProductPlanTable.tsx` | `saveMonthLevels` | `applyRecalc` передаёт `{ distributeForward, horizonMonths: months }` | VERIFIED | Строка 260: `saveMonthLevels(payload, { distributeForward, horizonMonths: months })` |
| `ProductPlanTable.tsx` | `resetMonthLevelsToAuto` | onClick кнопок сброса по месяцу (стр.389) и по товару (стр.507) | VERIFIED | Два вызова с `{ month: m }` и `{ productId: p.productId }` |
| `app/actions/sales-plan.ts` | `prisma.virtualPurchase.update` | UPDATE просроченных авто-ACCEPTED в транзакции regenerate | VERIFIED | Строки 995-1004: `tx.virtualPurchase.update` для каждого `s` в `allShiftedVps` |
| `app/api/cron/dispatch/route.ts` | `app/api/cron/sales-plan-rollforward/route.ts` | dynamic import + shouldFireCron по vpRollforwardCronTime | VERIFIED | Строка 169: `import("../sales-plan-rollforward/route")` |
| `lib/sales-plan/distribute-forward.ts` | `app/actions/sales-plan.ts` | import в saveMonthLevels | VERIFIED | Строка 23 sales-plan.ts: `import { distributeMonthLevelForward } from "@/lib/sales-plan/distribute-forward"` |
| `app/api/cron/sales-plan-rollforward/route.ts` | `regenerateVirtualPurchasesInternal` | прямой импорт (не public action — без RBAC) | VERIFIED | Строка 9 роута: `import { regenerateVirtualPurchasesInternal } from "@/app/actions/sales-plan"` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `ProductPlanTable` → бейдж среза | `psr.days` (PlanDayRow[]) | RSC page.tsx → `planResult: pr` (computeSalesPlan) | Да — engine считает rateRequested/ordersUnits per day | FLOWING |
| `ProductPlanTable` → бейдж прихода | `p.arrivals` | RSC page.tsx → `arrivals: p.arrivals` (resolveArrivalBatches) | Да — реальные + виртуальные закупки из Prisma | FLOWING |
| `saveMonthLevels` → distributeForward | `existing` (existingByProduct) | `prisma.salesPlanMonthLevel.findMany` | Да — реальные строки БД | FLOWING |
| `resetMonthLevelsToAuto` → где | `where` (productId/month) | payload из UI (Zod-validated) | Да — deleteMany с реальным where | FLOWING |
| `rollForwardAcceptedArrivals` → UPDATE | `allShiftedVps` | existingByProduct (ACCEPTED VPs из Prisma) | Да — tx.virtualPurchase.update с реальными ID | FLOWING |

---

### Behavioral Spot-Checks

Runnable без сервера проверки ограничены (не запускаем Next.js/Prisma).

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| distributeMonthLevelForward — pure function correct | Tests: sales-plan-distribute-forward.test.ts (reported GREEN by SUMMARY) | 3/3 GREEN | PASS (SUMMARY) |
| rollForwardAcceptedArrivals — invariant test | Tests: sales-plan-rollforward.test.ts (reported GREEN) | 4/4 GREEN | PASS (SUMMARY) |
| engine golden anchor iu===438_068_120 | tests/sales-plan-iu.test.ts (reported GREEN) | GREEN | PASS (SUMMARY) |
| tsc --noEmit | Reported 0 errors in SUMMARY | 0 errors | PASS (SUMMARY) |
| npm run build | Reported SUCCESS in all 3 SUMMARYs | SUCCESS | PASS (SUMMARY) |

Note: Spot-checks ran against SUMMARY self-reports. Independent test run not performed in this verification session — human should confirm `npx vitest run tests/sales-plan-distribute-forward.test.ts tests/sales-plan-rollforward.test.ts` → all GREEN.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| SP-15 | 26-01-PLAN.md | Автопротяжка + сброс ручных уровней | SATISFIED | distributeMonthLevelForward + saveMonthLevels(opts) + resetMonthLevelsToAuto + UI тумблер + ✕ |
| SP-16 | 26-02-PLAN.md | Предупреждение о срезе плана (per-month) | SATISFIED | monthShortfall(psr.days) + бейдж «срезано −X%» + плашка «нет товара» в ProductPlanTable |
| SP-17 | 26-03-PLAN.md | Roll-forward авто-ACCEPTED + ежедневный крон | SATISFIED | rollForwardAcceptedArrivals + regenerate UPDATE + крон-роут + dispatcher wiring |

All three requirements marked `[x]` in REQUIREMENTS.md.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| — | — | — | No stubs, no placeholder returns, no TODO/FIXME in modified files |

No anti-patterns found in modified files. All implementations are substantive.

---

### Human Verification Required

#### 1. SP-15: Live UI — тумблер автопротяжки

**Test:** На `/sales-plan/products?mode=edit`: убедиться что тумблер-checkbox «Распространить на последующие месяцы» виден в тулбаре и checked=true. Поставить уровень на июль для товара где август — уже ручной, а сентябрь — авто. Нажать «Пересчитать план». Сентябрь должен получить тот же уровень, август — остаться нетронутым.

**Expected:** Протяжка работает, ручные не перезаписываются.
**Why human:** Требует живой БД с данными + UI взаимодействия.

#### 2. SP-16: Бейдж среза в матрице

**Test:** Найти товар с прогнозируемым стокаутом в середине горизонта (например, приход ожидается 28.09). Открыть вкладку Товары в обычном (compare) режиме. В ячейке сентября должен быть янтарный бейдж «срезано −X% · приход 28.09». Ячейки октября и далее (после прихода) НЕ должны показывать бейдж.

**Expected:** Бейдж только на месяцах с per-month недоливом; правильная дата прихода.
**Why human:** Требует реальных данных со стокаутом.

#### 3. SP-15: Массовый сброс

**Test:** Убедиться что кнопки с иконкой Eraser: (а) для каждого месяца в тулбаре и (б) в sticky-ячейке названия каждого товара видны в edit-режиме. Нажать «Сбросить ручные (месяц): Август» — должен показаться toast «Сброшено ручных уровней: N» и таблица обновиться.

**Expected:** Работает массовый сброс по колонке и по строке.
**Why human:** Требует живой БД + UI.

#### 4. SP-17: Крон-роут авторизация

**Test:** `curl -H "x-cron-secret: $CRON_SECRET" https://zoiten.pro/api/cron/sales-plan-rollforward` → `{"ok":true}`. Без заголовка → 401.

**Expected:** Авторизация работает, regenerate завершается без ошибок.
**Why human:** Требует запущенного сервера + CRON_SECRET.

---

### Gaps Summary

Нет технических блокеров. Все 11 must-haves VERIFIED по коду:

- SP-15: `distributeMonthLevelForward` корректно исключает ручные месяцы (logical chain verified); `saveMonthLevels` грузит existing и вызывает хелпер; `resetMonthLevelsToAuto` с Zod-защитой от пустого where и RBAC SALES MANAGE; UI тумблер (default true) + кнопки сброса + заметный ✕ — все на месте в коде.

- SP-16: `monthShortfall(psr.days, monthPrefix)` считает per-month (не product-total); бейдж «срезано −X%» + плашка «нет товара» рендерятся условно при `sf.lostShare > 0.02` / `isEmptyMonth`; данные текут через `planResult.days` из RSC.

- SP-17: `rollForwardAcceptedArrivals` сдвигает только auto+ACCEPTED+overdue, manual нетронут; UPDATE в транзакции внутри `regenerateVirtualPurchasesInternal`; deleteMany только по status=SUGGESTED (ACCEPTED выживают); крон-роут с x-cron-secret + dispatcher wiring на 04:40 МСК.

- Движок engine.ts не изменён (нет в git diff фазы); golden anchor iu===438_068_120 в нетронутом тесте.

Status `human_needed` — требуется live-тестирование 4 UI/server-dependent сценариев выше.

---

_Verified: 2026-07-05T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
