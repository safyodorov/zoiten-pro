---
phase: quick-260710-hkj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - prisma/migrations/20260710_wb_commission_snapshot/migration.sql
  - lib/wb-commission-history.ts
  - app/api/wb-sync/route.ts
  - app/api/wb-commission-iu/route.ts
  - lib/finance-weekly/data.ts
  - lib/finance-weekly/plan-fact.ts
  - lib/finance-weekly/attribution.ts
  - lib/finance-weekly/credit-accrual.ts
  - app/(dashboard)/finance/weekly/page.tsx
  - tests/finance-weekly-attribution.test.ts
  - tests/finance-weekly-credit-accrual.test.ts
  - components/finance/WeeklyFinReportTable.tsx
  - components/finance/WeeklyFinArticleDialog.tsx
autonomous: true
requirements: [W2D-FIX1-CLOTHING-BUYOUTS, W2D-FIX2-COMMISSION-HISTORY, W2D-FIX3-UPD-ADS, W2D-FIX4-CREDIT-ACCRUAL]

must_haves:
  truths:
    - "Строки одежды (clothing) в /finance/weekly считаются по выкупам: qty = Σ WbSalesDaily.buyoutsCount (gross), выручка = Σ buyoutsRub за неделю; бытовая техника — по заказам (WbCardFunnelDaily), как раньше"
    - "План-факт для clothing-товаров: план = Σ planBuyoutsRub, факт МТД = Σ WbSalesDaily.buyoutsRub; для appliances — planOrdersRub/ordersSumRub без изменений"
    - "Комиссии артикула за неделю берутся из истории WbCommissionSnapshot по validFrom <= weekEnd — прошлые недели не пересчитываются задним числом после роста ставок"
    - "Backfill-миграция сохраняет текущие ставки всех WbCard как снапшот от 2026-06-01"
    - "Реклама недели = Σ WbAdvertSpendRow.updSum за неделю, распределённая по nmId пропорционально долям WbAdvertStatDaily.sum (ground truth ~820 853 ₽ вместо fullstats 578 950 ₽)"
    - "Кредитный пул = начисление по кредитам ЗОЙТЕН: остаток тела на weekStart × ставка/100 × 7/365 (не платежи по дате — большинство недель было 0)"
    - "UI показывает базис каждой вселенной (заголовок группы + подпись KPI); модалка называет количество «Кол-во, шт» с базисом, а не «Заказов»"
  artifacts:
    - path: "prisma/migrations/20260710_wb_commission_snapshot/migration.sql"
      provides: "CREATE TABLE WbCommissionSnapshot + backfill INSERT из WbCard от 2026-06-01"
      contains: "gen_random_uuid"
    - path: "lib/wb-commission-history.ts"
      provides: "snapshotCommissionChanges() + loadCommissionsForDate(date)"
      exports: ["snapshotCommissionChanges", "loadCommissionsForDate"]
    - path: "lib/finance-weekly/attribution.ts"
      provides: "attributeSpendByShares(updTotal, sharesMap) — pure, zero-guard"
      exports: ["attributeSpendByShares"]
    - path: "lib/finance-weekly/credit-accrual.ts"
      provides: "weeklyAccruedInterest(loans, weekStart) — pure accrual остаток×ставка×7/365"
      exports: ["weeklyAccruedInterest"]
    - path: "tests/finance-weekly-attribution.test.ts"
      provides: "unit-тесты пропорции + zero-guard + инвариант суммы"
    - path: "tests/finance-weekly-credit-accrual.test.ts"
      provides: "unit-тесты accrual: баланс на weekStart, погашенные исключены, формула 7/365"
  key_links:
    - from: "lib/finance-weekly/data.ts"
      to: "prisma.wbSalesDaily"
      via: "groupBy nmId _sum buyoutsCount/buyoutsRub за неделю (базис clothing)"
      pattern: "wbSalesDaily\\.groupBy"
    - from: "lib/finance-weekly/data.ts"
      to: "lib/wb-commission-history.ts"
      via: "loadCommissionsForDate(weekEnd) с fallback на WbCard-поля"
      pattern: "loadCommissionsForDate"
    - from: "lib/finance-weekly/data.ts"
      to: "prisma.wbAdvertSpendRow"
      via: "aggregate _sum updSum за неделю по effectiveDate → attributeSpendByShares"
      pattern: "updSum"
    - from: "lib/finance-weekly/data.ts"
      to: "lib/finance-weekly/credit-accrual.ts"
      via: "weeklyAccruedInterest по кредитам компании ЗОЙТЕН"
      pattern: "weeklyAccruedInterest"
    - from: "app/api/wb-sync/route.ts"
      to: "lib/wb-commission-history.ts"
      via: "snapshotCommissionChanges() в конце синка (try/catch)"
      pattern: "snapshotCommissionChanges"
    - from: "lib/finance-weekly/plan-fact.ts"
      to: "prisma.salesPlanVersionDay"
      via: "_sum planBuyoutsRub (clothing) + planOrdersRub (appliances)"
      pattern: "planBuyoutsRub"
---

<objective>
W2d — четыре фикса Понедельного фин-отчёта (/finance/weekly) по результатам агентной сверки с Excel экономиста (docs/superpowers/specs/2026-07-10-weekly-finreport-reconcile-report.md). Все решения приняты пользователем 2026-07-10:

1. **Базис одежды = выкупы**: clothing-строки считаются по WbSalesDaily (gross buyouts), appliances — по заказам как раньше. Сверка подтвердила: Excel F=37 по одежде = gross buyouts точно, расхождение -328% по заказам было семантическим.
2. **История комиссий**: новая таблица WbCommissionSnapshot + backfill старых ставок (комиссии оферты выросли с 07.07.2026; ночной синк 2026-07-10 02:30 ещё держит старые — backfill успевает).
3. **Реклама через /adv/v1/upd**: fullstats недосчитывает ~30% (578 950 vs 820 853 ₽) — тотал из WbAdvertSpendRow.updSum, распределение по nmId пропорционально fullstats-долям.
4. **Кредитный пул = начисление**: остаток тела × ставка × 7/365 по кредитам ЗОЙТЕН вместо платежей по дате (большинство недель было 0; Excel U331=393 624, accrual-оценка ≈299 091 — разрыв ~24% = предмет сверки реестра кредитов, не баг формулы).

Purpose: отчёт «как у экономиста» — устраняет 3 систематических расхождения сверки + защищает исторические недели от ретроактивного изменения комиссий.
Output: миграция + 2 новых pure-модуля + 2 unit-теста + правки data.ts/plan-fact.ts/page.tsx/UI. engine.ts НЕ тронут.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/superpowers/specs/2026-07-10-weekly-finreport-reconcile-report.md
@lib/finance-weekly/data.ts
@lib/finance-weekly/plan-fact.ts
@lib/finance-weekly/types.ts
@lib/loan-math.ts
@lib/credits-schedule-data.ts

<interfaces>
<!-- Ключевые контракты из кодовой базы — исполнителю НЕ нужно исследовать. -->

Из prisma/schema.prisma (существующие модели, НЕ менять):
```prisma
model WbSalesDaily {
  nmId         Int
  date         DateTime @db.Date   // дата РЕАЛИЗАЦИИ (MSK day); settled ~2 дня
  buyoutsRub   Float    @default(0) // Σ priceWithDisc по выкупам (gross, до СПП)
  buyoutsCount Int      @default(0)
  @@unique([nmId, date])
}

model WbAdvertSpendRow {
  effectiveDate DateTime               // updTime ?? now() — DateTime С ВРЕМЕНЕМ, не @db.Date
  updSum        Decimal @db.Decimal(12, 2) // ₽ списано → Number() при чтении
}

model WbAdvertStatDaily {
  nmId Int
  date DateTime @db.Date
  sum  Float @default(0)               // fullstats spend — используется как ДОЛИ
}

model Loan {
  amount        Decimal @db.Decimal(14, 2)  // тело кредита
  annualRatePct Decimal @db.Decimal(6, 3)   // годовая ставка %
  issueDate     DateTime?
  deletedAt     DateTime?
  company       Company  // company.name — «ЗОЙТЕН» матчится toUpperCase().includes
  payments      LoanPayment[]
}
model LoanPayment {
  date      DateTime @db.Date
  principal Decimal @default(0) @db.Decimal(14, 2)  // тело — поле ЕСТЬ
  interest  Decimal @default(0) @db.Decimal(14, 2)
}
// ⚠ LoanPayment хранит ПОЛНЫЙ график (прошлое + будущее плановое) —
// остаток на дату = amount − Σ principal(date < asOf), только прошлые.

model SalesPlanVersionDay {
  productId     String
  date          DateTime @db.Date
  planOrdersRub  Float
  planBuyoutsRub Float   // план по выкупам — базис clothing
}
```

Из lib/finance-weekly/types.ts (pure, менять только комментарии):
```typescript
export type Universe = "appliances" | "clothing"
export interface WeeklyArticleInput {
  nmId: number; universe: Universe
  qtyOrders: number          // H — с W2d: заказы (appliances) ИЛИ выкупы gross (clothing)
  grossPricePerUnit: number  // K = выручка/qty
  commIuPct: number; commStdPct: number; costPerUnit: number
  adSpendTotal: number; ...
}
export interface ArticleResult { nmId: number; universe: Universe; qtyOrders: number; iu: ...; std: ... }
```

Из lib/finance-weekly/data.ts (текущая структура загрузчика):
- `productByNmId: Map<number, LinkedProduct>` — universe = `product.brand?.direction?.hasSizes ? "clothing" : "appliances"`
- Promise.all: wbCards / appSettings / funnelRows (groupBy WbCardFunnelDaily) / adRows (groupBy WbAdvertStatDaily) / schedule (loadSummarySchedule — УДАЛЯЕТСЯ в Fix 4)
- Основной цикл: `for (const [nmId, funnel] of funnelByNmId)` c guard H <= 0 → continue
- Комиссии сейчас: `card?.commFbwIu ?? card?.commFbsIu ?? 0` (Fix 2 меняет источник)

Из lib/finance-weekly/plan-fact.ts:
- `distributePlanAcrossNmIds(planTotal, nmIds, factByNmId)` — pure, НЕ МЕНЯТЬ (её тесты пинят контракт)
- `loadWeeklyPlanFact(weekStart, weekEnd, articleNmIds, nmIdToProductId)` — сигнатура РАСШИРЯЕТСЯ (+ universeByNmId)
- totals.planWeek/planMonth = Σ по ВСЕМ товарам версии (не только в отчёте) — сохранить

Из lib/loan-math.ts:
- `computeAccruedInterest` НЕ подходит: пропорционирует interest СЛЕДУЮЩЕГО планового платежа графика,
  а нужна формула остаток × ставка/100 × 7/365 → новая pure-функция
- `round2(n)` — переиспользовать для округления копеек

Из app/api/wb-commission-iu/route.ts:
- Route пишет ТОЛЬКО в WbCommissionIu (deleteMany + createMany); WbCard-поля обновляет
  следующий /api/wb-sync (join по category) → хук snapshotCommissionChanges() там
  обычно no-op, но ставится по решению пользователя (future-proof + захват после ручного UPDATE)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: WbCommissionSnapshot — модель, миграция с backfill, lib/wb-commission-history.ts, хуки в 2 routes (Фикс 2)</name>
  <files>prisma/schema.prisma, prisma/migrations/20260710_wb_commission_snapshot/migration.sql, lib/wb-commission-history.ts, app/api/wb-sync/route.ts, app/api/wb-commission-iu/route.ts</files>
  <action>
**1. prisma/schema.prisma** — новая модель рядом с WbCard-блоком (существующие модели НЕ трогать):

```prisma
// W2d (quick 260710-hkj): история комиссий per nmId. Прошлые недели /finance/weekly
// считаются по ставкам, действовавшим на weekEnd (validFrom <= weekEnd, последняя запись).
model WbCommissionSnapshot {
  id         String   @id @default(cuid())
  validFrom  DateTime @db.Date // дата начала действия ставок (МСК-дата, UTC-полночь)
  nmId       Int
  commFbwIu  Float?
  commFbwStd Float?
  commFbsIu  Float?
  commFbsStd Float?
  createdAt  DateTime @default(now())

  @@unique([validFrom, nmId])
  @@index([nmId, validFrom])
}
```

**2. Hand-written миграция** `prisma/migrations/20260710_wb_commission_snapshot/migration.sql` (паттерн проекта — 20260707_wb_box_tariff и соседи; на проде применит deploy.sh через `prisma migrate deploy`):

```sql
-- CreateTable
CREATE TABLE "WbCommissionSnapshot" (
    "id" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "nmId" INTEGER NOT NULL,
    "commFbwIu" DOUBLE PRECISION,
    "commFbwStd" DOUBLE PRECISION,
    "commFbsIu" DOUBLE PRECISION,
    "commFbsStd" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WbCommissionSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WbCommissionSnapshot_validFrom_nmId_key" ON "WbCommissionSnapshot"("validFrom", "nmId");
CREATE INDEX "WbCommissionSnapshot_nmId_validFrom_idx" ON "WbCommissionSnapshot"("nmId", "validFrom");

-- Backfill: текущие ставки WbCard как снапшот от 2026-06-01 (заведомо ДО роста комиссий 07.07.2026).
-- Ночной синк 2026-07-10 02:30 ещё держал СТАРЫЕ ставки — backfill успевает их сохранить.
-- gen_random_uuid() доступен в PG16 без расширений; id в схеме cuid, uuid-текст допустим для миграции.
INSERT INTO "WbCommissionSnapshot" ("id","validFrom","nmId","commFbwIu","commFbwStd","commFbsIu","commFbsStd")
SELECT gen_random_uuid()::text, DATE '2026-06-01', "nmId", "commFbwIu","commFbwStd","commFbsIu","commFbsStd"
FROM "WbCard";
```

После правки схемы: `npx prisma generate` (локальной PG нет — migrate deploy на проде через deploy.sh, паттерн Phase 09-returns).

**3. lib/wb-commission-history.ts** — новый модуль (импортирует prisma, НЕ pure):

а) `snapshotCommissionChanges(): Promise<number>`:
- Последний снапшот per nmId одним запросом: `prisma.$queryRaw<Row[]>` с `SELECT DISTINCT ON ("nmId") "nmId","commFbwIu","commFbwStd","commFbsIu","commFbsStd" FROM "WbCommissionSnapshot" ORDER BY "nmId", "validFrom" DESC`
- Текущие ставки: `prisma.wbCard.findMany({ where: { deletedAt: null }, select: { nmId, commFbwIu, commFbwStd, commFbsIu, commFbsStd } })`
- validFrom = сегодня МСК как UTC-полночь: `const msk = new Date(Date.now() + 3*3600_000); const validFrom = new Date(Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate()))` (паттерн lib/sales-plan/dates.ts getMskTodayIso)
- Для каждой карточки: если nmId нет в снапшотах ИЛИ хотя бы одно из 4 полей отличается (null-safe сравнение: `a !== b` где оба уже `number | null`) → `prisma.wbCommissionSnapshot.upsert({ where: { validFrom_nmId: { validFrom, nmId } }, create: {...}, update: {4 поля} })`. Upsert (не createMany skipDuplicates) — если ставки изменились дважды за день, вторая правка НЕ теряется. Изменившихся обычно единицы — цикл upsert'ов ок.
- Возвращает число записанных снапшотов (для лога).

б) `loadCommissionsForDate(date: Date): Promise<Map<number, { commFbwIu: number|null; commFbwStd: number|null; commFbsIu: number|null; commFbsStd: number|null }>>`:
- Один запрос: `prisma.$queryRaw` с `SELECT DISTINCT ON ("nmId") "nmId","commFbwIu","commFbwStd","commFbsIu","commFbsStd" FROM "WbCommissionSnapshot" WHERE "validFrom" <= ${date} ORDER BY "nmId", "validFrom" DESC` → Map по nmId.
- JSDoc: последняя запись с validFrom <= date per nmId; DOUBLE PRECISION приходит как number (не Decimal).

**4. app/api/wb-sync/route.ts** — в САМОМ КОНЦЕ успешного пути (после блока product-photo-resolve, ПЕРЕД финальным `return NextResponse.json({ synced, ... })`, ~строка 650):

```typescript
// W2d: снапшот истории комиссий — после того как upsert-цикл записал свежие ставки в WbCard.
try {
  const snapshotted = await snapshotCommissionChanges()
  if (snapshotted > 0) console.log(`[wb-sync] commission snapshots: ${snapshotted}`)
} catch (e) {
  console.error("[wb-sync] commission snapshot failed:", e)
  errors.push(`commission-snapshot: ${(e as Error).message}`)
}
```
Import вверху файла. Ошибка снапшота НЕ валит синк (паттерн product-photo-resolve).

**5. app/api/wb-commission-iu/route.ts** — после `prisma.$transaction([...])`, перед `return NextResponse.json({ imported, ... })` — тот же try/catch вызов `snapshotCommissionChanges()`. Комментарий: route пишет только WbCommissionIu, WbCard обновит следующий wb-sync → вызов обычно no-op, но захватывает изменения если WbCard правили вручную/SQL между синками (решение пользователя 2026-07-10).

**6. Задокументировать в коде (JSDoc lib/wb-commission-history.ts) и позже в SUMMARY:** после роста ставок будущий синк создаст записи validFrom=дата синка (> 05.07) — неделя 29.06–05.07 останется на старых ставках. При необходимости пользователь скорректирует validFrom новых записей на 2026-07-07 SQL-ом: `UPDATE "WbCommissionSnapshot" SET "validFrom" = DATE '2026-07-07' WHERE "validFrom" = DATE '<дата синка>';`
  </action>
  <verify>
    <automated>npx prisma generate && npx tsc --noEmit</automated>
  </verify>
  <done>Модель WbCommissionSnapshot в схеме; migration.sql с CREATE TABLE + 2 индекса + backfill INSERT от 2026-06-01; lib/wb-commission-history.ts экспортирует snapshotCommissionChanges + loadCommissionsForDate; оба route вызывают снапшот в try/catch; prisma generate и tsc чистые. Коммит: `feat(260710-hkj): история комиссий WbCommissionSnapshot + backfill + хуки sync`</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: data.ts + plan-fact.ts — все 4 фикса данных + pure-функции attribution/credit-accrual + unit-тесты</name>
  <files>lib/finance-weekly/attribution.ts, lib/finance-weekly/credit-accrual.ts, tests/finance-weekly-attribution.test.ts, tests/finance-weekly-credit-accrual.test.ts, lib/finance-weekly/data.ts, lib/finance-weekly/plan-fact.ts, app/(dashboard)/finance/weekly/page.tsx</files>
  <behavior>
**tests/finance-weekly-attribution.test.ts** (pure, без Prisma-моков):
- Пропорция: attributeSpendByShares(1000, Map{1→300, 2→100}, 400) → {1: 750, 2: 250}
- Инвариант суммы: Σ значений === updTotal × (Σ shares из map / totalShares); при totalShares == Σ map — Σ === updTotal (точность 1e-6)
- Zero-guard: totalShares === 0 → все nmId получают 0 (не NaN/Infinity)
- updTotal === 0 → все 0
- Денominator больше Σ переданных shares (доля unlinked nmIds) → Σ attributed < updTotal, каждое значение = updTotal × share/denominator

**tests/finance-weekly-credit-accrual.test.ts** (pure, без Prisma-моков):
- Один кредит без платежей: amount=1_000_000, rate=28 → weeklyAccruedInterest = round2(1_000_000 × 0.28 × 7/365) = 5369.86
- Платежи principal ДО weekStart уменьшают остаток; платёж В ДЕНЬ weekStart и ПОЗЖЕ — НЕ уменьшают (строго date < weekStart)
- Погашенный кредит (остаток <= 0) → вклад 0
- Несколько кредитов → Σ по каждому
- interest-поля платежей игнорируются (формула от тела, не от графика процентов)
  </behavior>
  <action>
**RED → GREEN: сначала тесты двух pure-функций, затем реализация, затем интеграция в data.ts/plan-fact.ts.**

**1. lib/finance-weekly/attribution.ts** — pure (ноль импортов, паттерн types.ts):

```typescript
export function attributeSpendByShares(
  updTotal: number,
  sharesByNmId: ReadonlyMap<number, number>,
  totalShares: number,
): Map<number, number>
```
- totalShares — знаменатель (Σ fullstats по ВСЕМ nmId недели, может быть > Σ переданной map — доля непривязанных nmId не показывается в отчёте, их часть updTotal остаётся нераспределённой намеренно).
- Guard: totalShares <= 0 || updTotal === 0 → Map со всеми nmId = 0.
- Иначе: value = updTotal × (share / totalShares). Float без округления (display-округление в UI — паттерн distributePlanAcrossNmIds).
- JSDoc: почему upd (ground truth списаний /adv/v1/upd), а fullstats — только доли; fullstats недосчитывает ~30% (сверка 2026-07-10: 578 950 vs 820 853 ₽). Нераспределённый остаток updTotal (доля unlinked) в водопад НЕ добавляется — v1, задокументировано.

**2. lib/finance-weekly/credit-accrual.ts** — pure (ноль импортов Prisma; можно импортировать round2 из @/lib/loan-math — он pure):

```typescript
export interface AccrualLoanInput {
  amount: number          // тело кредита
  annualRatePct: number   // годовая ставка %
  payments: { date: Date | string; principal: number }[]  // полный график
}
export function weeklyAccruedInterest(loans: AccrualLoanInput[], weekStart: Date): number
```
- Per кредит: `balance = amount − Σ principal(date < weekStart)` — СТРОГО раньше weekStart, UTC-полночь сравнение (паттерн loan-math: Date.UTC(y,m,d)).
- balance <= 0 → кредит погашен, пропустить.
- Вклад = balance × (annualRatePct / 100) × 7 / 365.
- Результат = round2(Σ вкладов).
- JSDoc: computeAccruedInterest из loan-math НЕ подходит — он пропорционирует interest следующего планового платежа графика; здесь простой accrual от тела. Разрыв с Excel U331 (~24%: 393 624 vs ≈299 091) — предмет сверки реестра кредитов с экономистом, НЕ баг формулы (решение пользователя 2026-07-10).

**3. Тесты** (см. behavior). Запуск: `npx vitest run tests/finance-weekly-attribution.test.ts tests/finance-weekly-credit-accrual.test.ts` — сначала RED (модулей нет), после реализации GREEN.

**4. lib/finance-weekly/data.ts — интеграция всех 4 фиксов** (engine.ts НЕ трогать):

ФИКС 1 (базис clothing):
- В Promise.all добавить `prisma.wbSalesDaily.groupBy({ by: ["nmId"], where: { nmId: { in: linkedNmIds }, date: { gte: weekStart, lte: weekEnd } }, _sum: { buyoutsCount: true, buyoutsRub: true } })` → `salesByNmId: Map<number, { qty: number; rub: number }>`. GROSS — БЕЗ вычета returns (сверка: Excel F=37 = gross buyouts точно).
- Основной цикл переписать: итерировать по union nmIds `new Set([...funnelByNmId.keys(), ...salesByNmId.keys()])`; для каждого nmId сначала резолвить product → universe; затем:
  - appliances → qty/rub из funnelByNmId (как раньше);
  - clothing → qty = salesByNmId.qty (Σ buyoutsCount), rub = salesByNmId.rub (Σ buyoutsRub, gross до СПП);
  - guard `qty <= 0 → continue` (заменяет H <= 0).
- K = rub / qty. Поле WeeklyArticleInput.qtyOrders получает qty выбранного базиса (контракт движка не меняется — обновить комментарий).
- Комментарий у запроса: WbSalesDaily settled ~2 дня, по дате РЕАЛИЗАЦИИ — для текущей незавершённой недели данные частичные, это ок (как и заказы).

ФИКС 2 (комиссии из истории):
- В Promise.all добавить `loadCommissionsForDate(weekEnd)` (import из @/lib/wb-commission-history).
- В цикле: `const snap = commissionsByNmId.get(nmId); const commIuPct = (snap ? snap.commFbwIu ?? snap.commFbsIu : null) ?? card?.commFbwIu ?? card?.commFbsIu ?? 0` — аналогично commStdPct (snap.commFbwStd ?? snap.commFbsStd, fallback card). nmId нет в снапшотах → текущие WbCard-поля (fallback).

ФИКС 3 (реклама через upd):
- adRows (groupBy WbAdvertStatDaily по linkedNmIds) ОСТАЁТСЯ — теперь это ЧИСЛИТЕЛИ долей.
- Добавить 2 запроса в Promise.all:
  - `prisma.wbAdvertSpendRow.aggregate({ where: { effectiveDate: { gte: weekStart, lt: weekEndExclusive } }, _sum: { updSum: true } })` где `weekEndExclusive = new Date(weekStart.getTime() + 7 * 86_400_000)` — effectiveDate это DateTime С ВРЕМЕНЕМ (не @db.Date), поэтому полуоткрытый интервал; `updTotal = Number(agg._sum.updSum ?? 0)` (Decimal → Number).
  - `prisma.wbAdvertStatDaily.aggregate({ where: { date: { gte: weekStart, lte: weekEnd } }, _sum: { sum: true } })` БЕЗ фильтра nmId — знаменатель по ВСЕМ nmId недели.
- `adByNmId = attributeSpendByShares(updTotal, fullstatsSharesMap, totalFullstats)` где fullstatsSharesMap строится из adRows.
- Если totalFullstats === 0 → все adSpend = 0, updTotal остаётся нераспределённым (в водопад НЕ добавлять — комментарий, v1).

ФИКС 4 (кредит = начисление):
- УДАЛИТЬ import loadSummarySchedule и его вызов из Promise.all + блок zoitenGroup/zoitenWeekInterest.
- Вместо этого в Promise.all: `prisma.loan.findMany({ where: { deletedAt: null }, select: { amount: true, annualRatePct: true, company: { select: { name: true } }, payments: { select: { date: true, principal: true } } } })`.
- После: фильтр `loan.company.name.toUpperCase().includes("ЗОЙТЕН")` (паттерн старого кода), маппинг Decimal → Number (`Number(loan.amount)`, `Number(loan.annualRatePct)`, `Number(p.principal)`), затем `zoitenWeekInterest = weeklyAccruedInterest(zoitenLoans, weekStart)`.
- Пул creditInterest подключается как раньше (total: zoitenWeekInterest, baseRevenue: applBase).

**5. lib/finance-weekly/plan-fact.ts — базис плана/факта для clothing:**
- Сигнатура: добавить 5-й параметр `universeByNmId: ReadonlyMap<number, "appliances" | "clothing">` (тип импортировать как `Universe` из ./types). `distributePlanAcrossNmIds` НЕ МЕНЯТЬ.
- План: в оба groupBy SalesPlanVersionDay добавить `_sum: { planOrdersRub: true, planBuyoutsRub: true }`. Universe товаров плана определить отдельным запросом по productId из plan-строк: `prisma.product.findMany({ where: { id: { in: planProductIds } }, select: { id: true, brand: { select: { direction: { select: { hasSizes: true } } } } } })` → clothing если hasSizes. Per product: план = clothing ? planBuyoutsRub : planOrdersRub. Totals (planWeek/planMonth) — Σ выбранного базиса по ВСЕМ товарам версии (семантика сохранена).
- Факт: nmIds разделить по universeByNmId на два списка; для appliances — WbCardFunnelDaily.ordersSumRub (как было, week + MTD); для clothing — `prisma.wbSalesDaily.groupBy(... _sum: { buyoutsRub: true })` week [weekStart..weekEnd] + MTD [monthStart..weekEnd]. Слить в единые factWeekByNmId / factMonthByNmId (каждый nmId ровно в одном базисе).
- Распределение план→nmId: без изменений (веса — слитый factWeekByNmId, т.е. «пропорция по факту соответствующего базиса»).
- Обновить шапку-комментарий файла (семантика W2d).

**6. app/(dashboard)/finance/weekly/page.tsx:**
- Построить `universeByNmId = new Map(data.articles.map((a) => [a.nmId, a.universe]))` и передать 5-м аргументом в loadWeeklyPlanFact.

**7. lib/finance-weekly/types.ts** — ТОЛЬКО комментарии при желании (qtyOrders: «заказы (appliances) / выкупы gross (clothing) с W2d»). НИКАКИХ новых полей — universe уже несёт базис. engine.ts не открывать.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run tests/finance-weekly-engine.test.ts tests/finance-weekly-plan-fact.test.ts tests/pricing-math.test.ts tests/finance-weekly-attribution.test.ts tests/finance-weekly-credit-accrual.test.ts && git diff --quiet HEAD -- lib/finance-weekly/engine.ts</automated>
  </verify>
  <done>Clothing-строки строятся из WbSalesDaily (gross), appliances — из funnel; комиссии из loadCommissionsForDate(weekEnd) с fallback на WbCard; реклама = updTotal × fullstats-доли (знаменатель по всем nmId); кредитный пул = weeklyAccruedInterest по кредитам ЗОЙТЕН; план/факт clothing = planBuyoutsRub/buyoutsRub. Все 5 тест-файлов зелёные, tsc чист, git-diff engine.ts пуст. Коммит: `feat(260710-hkj): W2d — базис одежды выкупы + комиссии из истории + реклама upd + кредит accrual`</done>
</task>

<task type="auto">
  <name>Task 3: UI-пометки базиса (таблица, KPI, модалка) + финальные гейты</name>
  <files>components/finance/WeeklyFinReportTable.tsx, components/finance/WeeklyFinArticleDialog.tsx</files>
  <action>
**1. WeeklyFinReportTable.tsx:**
- Заголовки universe-групп получают бейдж базиса. Добавить константу `const UNIVERSE_BASIS: Record<Universe, string> = { appliances: "по заказам", clothing: "по выкупам" }` и в buildRows для строки kind="universe" label = `${UNIVERSE_LABEL[universe]} · ${UNIVERSE_BASIS[universe]}` («Бытовая техника · по заказам», «Одежда · по выкупам»). Строки «Итого — {вселенная}» не трогать (не перегружать).
- KPI-блок (PlanFactKpiBlock): под сеткой карточек добавить подпись мелким текстом: `<p className="text-xs text-muted-foreground">база: бытовая — заказы, одежда — выкупы</p>` (в обёртке-div с gap, чтобы grid не ломать).
- Колонка «Выручка» остаётся без переименования (базис ясен из заголовка группы).

**2. WeeklyFinArticleDialog.tsx** — article.universe уже доступен (ArticleResult):
- DialogDescription: «Заказов: {qtyOrders}» → «Кол-во, шт: {qtyOrders} ({базис})», где базис = article.universe === "clothing" ? "выкупы" : "заказы".
- Подпись под таблицей разбивки: «× {qtyOrders} заказов = валовая сумма за неделю» → «× {qtyOrders} шт ({базис}) = валовая сумма за неделю».
- Вынести локальный хелпер `basisLabel(universe)` чтобы не дублировать тернарник.

**3. Финальные гейты (весь plan):**
- `npx tsc --noEmit` — чисто.
- `npx vitest run tests/finance-weekly-engine.test.ts tests/finance-weekly-plan-fact.test.ts tests/pricing-math.test.ts tests/finance-weekly-attribution.test.ts tests/finance-weekly-credit-accrual.test.ts` — зелёные. Полный suite НЕ гонять (~42 известных чужих падения — не чинить).
- `git diff --quiet HEAD -- lib/finance-weekly/engine.ts` — движок не тронут за весь план.
- Коммит (`git add -A` — есть новые файлы!) + `git push origin main`. НЕ деплоить — оркестратор задеплоит, миграцию применит deploy.sh.

**4. В SUMMARY задокументировать** (для пользователя):
- SQL-корректировка validFrom будущих снапшотов на дату реального роста: `UPDATE "WbCommissionSnapshot" SET "validFrom" = DATE '2026-07-07' WHERE "validFrom" = DATE '<дата синка>';`
- Разрыв кредита с Excel (~24%: 393 624 vs ≈299 091) — предмет сверки реестра кредитов с экономистом.
- Нераспределённая доля updTotal (unlinked nmIds) в водопад не входит (v1).
- WbSalesDaily settled ~2 дня — текущая неделя по одежде частичная (ожидаемо).
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run tests/finance-weekly-engine.test.ts tests/finance-weekly-plan-fact.test.ts tests/pricing-math.test.ts tests/finance-weekly-attribution.test.ts tests/finance-weekly-credit-accrual.test.ts && git diff --quiet HEAD -- lib/finance-weekly/engine.ts</automated>
  </verify>
  <done>Заголовки групп с бейджем базиса; KPI с подписью «база: бытовая — заказы, одежда — выкупы»; модалка показывает «Кол-во, шт» с базисом вместо «Заказов»; все гейты зелёные; всё закоммичено и запушено в origin/main (без деплоя). Коммит: `feat(260710-hkj): UI-пометки базиса вселенных в /finance/weekly`</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` — чисто на каждом коммите (tsc-green порядок задач: T1 инфраструктура самодостаточна, T2 использует её, T3 независимая UI-надстройка).
- `npx vitest run tests/finance-weekly-engine.test.ts tests/finance-weekly-plan-fact.test.ts tests/pricing-math.test.ts tests/finance-weekly-attribution.test.ts tests/finance-weekly-credit-accrual.test.ts` — все зелёные.
- `git diff --quiet HEAD -- lib/finance-weekly/engine.ts` — пустой diff (движок неприкосновенен).
- `npx prisma generate` выполнен после правки схемы; migration.sql применится на проде через deploy.sh (`prisma migrate deploy`) — деплой делает оркестратор, НЕ этот план.
- Grep-проверки ключевых связей: `wbSalesDaily.groupBy` и `loadCommissionsForDate` и `weeklyAccruedInterest` и `attributeSpendByShares` присутствуют в lib/finance-weekly/data.ts; `snapshotCommissionChanges` — в обоих routes; `planBuyoutsRub` — в plan-fact.ts.
</verification>

<success_criteria>
- Все 4 фикса сверки реализованы: базис одежды = gross выкупы (данные + план-факт + UI-пометки), комиссии недели из WbCommissionSnapshot по validFrom<=weekEnd с backfill 2026-06-01, реклама = Σ updSum × fullstats-доли, кредитный пул = accrual остаток×ставка×7/365 по ЗОЙТЕН.
- engine.ts байт-в-байт не изменён; distributePlanAcrossNmIds не изменена (её тесты пинят контракт).
- 2 новых pure-модуля покрыты unit-тестами (пропорция/zero-guard; баланс/погашенные/7-365).
- Атомарные коммиты запушены в origin/main; деплой НЕ выполнялся.
</success_criteria>

<output>
После завершения создать `.planning/quick/260710-hkj-w2d-upd-accrual/260710-hkj-SUMMARY.md` (по templates/summary.md), обязательно включив: SQL-корректировку validFrom на 2026-07-07, примечание о разрыве кредита ~24% (сверка реестра, не баг), примечание о нераспределённой доле updTotal и частичности текущей недели по WbSalesDaily.
</output>
