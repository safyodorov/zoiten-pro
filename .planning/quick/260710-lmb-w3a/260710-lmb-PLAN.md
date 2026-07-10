---
phase: quick-260710-lmb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - prisma/migrations/20260710_weekly_cost_tag/migration.sql
  - lib/bank-labels.ts
  - app/actions/bank.ts
  - components/bank/BankTransactionsTable.tsx
  - app/(dashboard)/bank/page.tsx
  - lib/finance-weekly/bank-pools.ts
  - tests/finance-weekly-bank-pools.test.ts
  - lib/finance-weekly/data.ts
  - app/actions/finance-weekly.ts
  - components/finance/WeeklyFinReportControls.tsx
  - app/(dashboard)/finance/weekly/page.tsx
autonomous: true
requirements: [QUICK-260710-LMB]

must_haves:
  truths:
    - "MANAGE-пользователь раздела BANK может пометить РАСХОДНУЮ (DEBIT) операцию тегом ОПЕКС / КАПЕКС / Доставка до МП (и снять тег) инлайн в таблице /bank; приходные строки и не-MANAGE — read-only"
    - "Пул «Общие расходы (бытовая)» /finance/weekly = Σ|amount| DEBIT-операций с тегом OPEX за [Пн..Вс], если ручное значение недели не задано (0); ручное >0 — приоритетно"
    - "Пул «Доставка до МП» = Σ|amount| DEBIT-операций с тегом DELIVERY_MP за неделю по той же гибрид-логике (manual >0 → manual, иначе банк >0 → банк, иначе 0)"
    - "КАПЕКС-операции НЕ попадают ни в один пул (тег только для исключения/аналитики)"
    - "Пул «Общие расходы (одежда)» = глобальная фикс-константа (AppSetting financeWeekly.clothingOverheadFixedRub) + недельная переменная (manualPools.overheadCloth) — НЕ из банка"
    - "Редактор пулов показывает авто-сумму из банка (подпись «банк: N ₽») и источник per пул (вручную / из банка / —); для одежды — состав фикс + переменная"
    - "tsc чисто, vitest finance-weekly/pricing зелёные, lib/finance-weekly/engine.ts не тронут, закоммичено и запушено в origin/main, БЕЗ деплоя"
  artifacts:
    - path: "prisma/migrations/20260710_weekly_cost_tag/migration.sql"
      provides: "CREATE TYPE WeeklyCostTag + ALTER TABLE BankTransaction ADD COLUMN weeklyCostTag + индекс (weeklyCostTag, date)"
      contains: "CREATE TYPE \"WeeklyCostTag\""
    - path: "lib/finance-weekly/bank-pools.ts"
      provides: "pure-хелперы: sumBankPoolAutos (DEBIT-суммы по тегам) + resolveHybridPool (manual > банк > 0 с source)"
      exports: ["sumBankPoolAutos", "resolveHybridPool"]
    - path: "tests/finance-weekly-bank-pools.test.ts"
      provides: "unit-тесты pure-части: фильтр DEBIT, CAPEX игнор, |amount|, приоритет manual, 0=не задано"
    - path: "app/actions/bank.ts"
      provides: "setWeeklyCostTag — BANK MANAGE, ''→null, revalidatePath('/bank')"
      exports: ["setWeeklyCostTag"]
    - path: "components/bank/BankTransactionsTable.tsx"
      provides: "колонка «Тег фин-отчёта» + WeeklyTagCell (native select, только DEBIT+canManage)"
    - path: "lib/finance-weekly/data.ts"
      provides: "запрос тегированных операций недели + гибрид-резолюция delivery/overheadAppl + clothing overhead = fixed + variable"
    - path: "app/actions/finance-weekly.ts"
      provides: "saveWeeklyPools расширен opts.clothingOverheadFixedRub → отдельный AppSetting (недельный ключ не меняется)"
    - path: "components/finance/WeeklyFinReportControls.tsx"
      provides: "подписи «банк: N ₽» + бейджи источника + поле «Общие расходы (фикс.)» одежды"
  key_links:
    - from: "components/bank/BankTransactionsTable.tsx"
      to: "app/actions/bank.ts"
      via: "WeeklyTagCell → server action setWeeklyCostTag"
      pattern: "setWeeklyCostTag"
    - from: "lib/finance-weekly/data.ts"
      to: "lib/finance-weekly/bank-pools.ts"
      via: "prisma.bankTransaction.findMany (DEBIT, тег, неделя) → sumBankPoolAutos → resolveHybridPool"
      pattern: "sumBankPoolAutos|resolveHybridPool"
    - from: "lib/finance-weekly/data.ts"
      to: "AppSetting financeWeekly.clothingOverheadFixedRub"
      via: "clothing overhead total = fixed + manualPools.overheadCloth"
      pattern: "clothingOverheadFixedRub"
    - from: "components/finance/WeeklyFinReportControls.tsx"
      to: "app/actions/finance-weekly.ts"
      via: "handleSave → saveWeeklyPools(week, pools, { clothingOverheadFixedRub })"
      pattern: "clothingOverheadFixedRub"
    - from: "app/(dashboard)/finance/weekly/page.tsx"
      to: "components/finance/WeeklyFinReportControls.tsx"
      via: "props bankAutos / bankPoolSources / clothingOverheadFixedRub"
      pattern: "bankAutos=\\{data\\.bankAutos\\}"
---

<objective>
W3a недельного фин-отчёта (спека §2.1/§2.2, решение пользователя «ГИБРИД» §7-1):
разметка банковских операций тегами WeeklyCostTag (OPEX / CAPEX / DELIVERY_MP) в
таблице /bank + авто-наполнение пулов «Общие расходы (бытовая)» и «Доставка до МП»
в /finance/weekly из помеченных DEBIT-операций недели, с приоритетом ручной правки
(0 = не задано → берётся банк-авто — существующая семантика manualPools сохраняется).
Плюс отдельная модель общих расходов ОДЕЖДЫ: пул = глобальная фикс-константа
(AppSetting) + переменная per неделя (вручную) — деньги одежды НЕ из банка (§2.2).

Бизнес-правила:
- ОПЕКС бытовой из выписки (Excel W331 ≈ 584 400/нед); КАПЕКС метится, но в пул НЕ идёт.
- Доставка до МП (Excel P149 ≈ 262 300/нед) — отдельный тег DELIVERY_MP.
- Одежда (Excel W332 ≈ 41 451/нед) = фикс + переменная; кредиты на одежду не распределяются (уже реализовано).
- Массовой разметки истории НЕ делаем — пользователь метит операции по мере надобности.

Purpose: пулы недели наполняются фактом из банка вместо ручного ввода с нуля; гибрид сохраняет контроль.
Output: миграция + тег в банке + pure bank-pools + гибрид-резолюция + UI редактора; push в origin/main. БЕЗ деплоя (миграция применится deploy.sh оркестратора).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@prisma/schema.prisma (строки 45-60 — enum TxDirection/TxCategory; 1825-1856 — model BankTransaction)
@prisma/migrations/20260710_wb_commission_snapshot/migration.sql (образец hand-written миграции)
@lib/bank-labels.ts
@app/actions/bank.ts (categorizeTx — образец action)
@components/bank/BankTransactionsTable.tsx (CategoryCell — образец inline-select ячейки)
@app/(dashboard)/bank/page.tsx (строки 302-321 — маппинг BankTxRow)
@lib/finance-weekly/bank-pools.ts (создаётся в Задаче 2)
@lib/finance-weekly/data.ts (строки 57-89 — ManualPools/ключ; 133-153 — WeeklyFinReportPageData; 285-352 — Promise.all; 563-650 — базы/пулы/результат)
@lib/finance-weekly/realization.ts (resolvePoolTotals — прецедент per-бакет источника, НЕ трогать)
@app/actions/finance-weekly.ts (saveWeeklyPools)
@components/finance/WeeklyFinReportControls.tsx (POOL_FIELDS, бейдж «из реализации» — образец)
@app/(dashboard)/finance/weekly/page.tsx (строки 95-115 — wiring props)

<interfaces>
<!-- Актуальные контракты из кодовой базы — исполнителю НЕ нужно исследовать код. -->

From prisma/schema.prisma:
```prisma
enum TxDirection { DEBIT CREDIT }   // DEBIT = расход, CREDIT = приход
model BankTransaction {
  id        String   @id @default(cuid())
  date      DateTime @db.Date
  direction TxDirection
  amount    Decimal  @db.Decimal(18, 2)  // всегда положительная, знак = direction
  category  TxCategory? @default(UNCATEGORIZED)
  comment   String?  @db.Text
  ...
  @@index([accountId, date])
  @@index([category])
}
```

From app/actions/bank.ts (образец для setWeeklyCostTag):
```typescript
export async function categorizeTx(id: string, category: string): Promise<ActionResult> {
  await requireSection("BANK", "MANAGE")
  // валидация значения → prisma.bankTransaction.update → revalidatePath("/bank")
  // P2025 → "Операция не найдена"; handleAuthError → UNAUTHORIZED/FORBIDDEN
}
```

From components/bank/BankTransactionsTable.tsx:
```typescript
export interface BankTxRow {
  id: string; date: string; direction: string; amount: number; currency: string
  docNumber: string | null; operationType: string | null; purpose: string
  counterpartyName: string | null; counterpartyInn: string | null
  category: string; comment: string | null
  companyName: string; accountNumber: string; bankName: string
}
// CategoryCell: useState(current) + useTransition, optimistic setValue(next),
// await action → !ok → toast.error + откат setValue(prev). Native <select> h-7 text-xs.
```

From lib/finance-weekly/data.ts:
```typescript
export interface ManualPools {
  delivery: number        // Доставка до МП — общая (base = обе вселенные)
  overheadAppl: number    // Общие расходы — бытовая
  acceptanceAppl: number; storageAppl: number
  overheadCloth: number   // Общие расходы — одежда (переменная per неделя)
  acceptanceCloth: number; storageCloth: number
}
// 0 = «не задано» (DEFAULT_MANUAL_POOLS всё нули) — семантику СОХРАНИТЬ
export function financeWeeklyPoolsKey(weekStartISO: string): string // financeWeekly.pools.<ISO>
// Пулы сейчас (строки 612-637):
//   appliances.deliveryToMp = { total: manualPools.delivery, baseRevenue: combinedBase }
//   appliances.overhead     = { total: manualPools.overheadAppl, baseRevenue: applBase }
//   clothing.deliveryToMp   = { total: manualPools.delivery, baseRevenue: combinedBase } // SHARED
//   clothing.overhead       = { total: manualPools.overheadCloth, baseRevenue: clothBase }
// storage/acceptance уже резолвятся через resolvePoolTotals (реализация>0 → факт, иначе manual) — НЕ трогать
```

From app/actions/finance-weekly.ts:
```typescript
export async function saveWeeklyPools(weekStartISO: string, pools: ManualPools):
  Promise<{ ok: true } | { ok: false; error: string }>
// requireSection("FINANCE","MANAGE") → санитизация → upsert AppSetting(poolsKey) → revalidatePath("/finance/weekly")
```

From components/finance/WeeklyFinReportControls.tsx:
```typescript
interface Props {
  weekStartISO: string; weekEndISO: string; manualPools: ManualPools; canManage: boolean
  poolSources: Record<"acceptanceAppl"|"storageAppl"|"acceptanceCloth"|"storageCloth", "realization"|"manual">
}
// POOL_FIELDS: {key, label, group}[], группы "Общее"/"Бытовая техника"/"Одежда"
// Бейдж источника — <span className="ml-1 text-[10px] text-muted-foreground"> рядом с label
```

Прецедент pure-модуля (vitest-изоляция): lib/finance-weekly/attribution.ts и
realization.ts — НОЛЬ импортов Prisma/Next/React; тесты импортируют их напрямую.
bank-pools.ts делать так же: pure-функции без импортов, Prisma-запрос — в data.ts.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Задача 1: WeeklyCostTag — схема + миграция + тег в таблице банка</name>
  <files>prisma/schema.prisma, prisma/migrations/20260710_weekly_cost_tag/migration.sql, lib/bank-labels.ts, app/actions/bank.ts, components/bank/BankTransactionsTable.tsx, app/(dashboard)/bank/page.tsx</files>
  <action>
1. **prisma/schema.prisma** — рядом с TxCategory (строка ~60) добавить:
```prisma
// Quick 260710-lmb (W3a): тег недельного фин-отчёта на банковских операциях.
// OPEX → пул «Общие расходы (бытовая)»; DELIVERY_MP → пул «Доставка до МП»;
// CAPEX — только маркировка/исключение, в пулы НЕ идёт.
enum WeeklyCostTag {
  OPEX
  CAPEX
  DELIVERY_MP
}
```
В `model BankTransaction` после `comment` добавить `weeklyCostTag WeeklyCostTag?` (nullable, БЕЗ default) и индекс `@@index([weeklyCostTag, date])`.

2. **prisma/migrations/20260710_weekly_cost_tag/migration.sql** — hand-written (образец 20260710_wb_commission_snapshot):
```sql
-- Quick 260710-lmb (W3a): тег недельного фин-отчёта на банковских операциях
CREATE TYPE "WeeklyCostTag" AS ENUM ('OPEX', 'CAPEX', 'DELIVERY_MP');
ALTER TABLE "BankTransaction" ADD COLUMN "weeklyCostTag" "WeeklyCostTag";
CREATE INDEX "BankTransaction_weeklyCostTag_date_idx" ON "BankTransaction"("weeklyCostTag", "date");
```
Локальной PG нет — миграция применится deploy.sh на VPS (`prisma migrate deploy`). НЕ запускать migrate dev.

3. **lib/bank-labels.ts** — добавить:
```typescript
export const WEEKLY_COST_TAG_LABELS: Record<string, string> = {
  OPEX: "ОПЕКС (общие)",
  CAPEX: "КАПЕКС",
  DELIVERY_MP: "Доставка до МП",
}
export const WEEKLY_COST_TAG_OPTIONS = [
  { value: "", label: "—" },
  ...Object.entries(WEEKLY_COST_TAG_LABELS).map(([value, label]) => ({ value, label })),
]
```

4. **app/actions/bank.ts** — новый action `setWeeklyCostTag(id: string, tag: string)` по точному образцу categorizeTx: `requireSection("BANK", "MANAGE")`; валидация `tag` ∈ {"", "OPEX", "CAPEX", "DELIVERY_MP"} (иначе `{ ok: false, error: "Недопустимый тег" }`); `prisma.bankTransaction.update({ where: { id }, data: { weeklyCostTag: tag === "" ? null : tag as WeeklyCostTag } })`; `revalidatePath("/bank")`; те же handleAuthError + P2025-ветка.

5. **components/bank/BankTransactionsTable.tsx**:
   - `BankTxRow` += `weeklyCostTag: string | null`.
   - Новый `WeeklyTagCell({ txId, current, direction, canManage })` по образцу CategoryCell (useState + useTransition, optimistic + откат при !ok): если `direction !== "DEBIT"` ИЛИ `!canManage` → текст `WEEKLY_COST_TAG_LABELS[current] ?? "—"` (muted для "—"); иначе native `<select>` c WEEKLY_COST_TAG_OPTIONS (value = current ?? ""), onChange → `setWeeklyCostTag`. Те же классы, что CategoryCell (`h-7 rounded border ... text-xs`).
   - Новая колонка «Тег фин-отчёта» сразу после «Категория»: `<th sticky top-0 z-20 bg-background border-b ...>` в шапке (прямой HTML tr — sticky-паттерн CLAUDE.md) + `<TableCell>` с WeeklyTagCell в body.

6. **app/(dashboard)/bank/page.tsx** — в маппинге rows (строка ~304) добавить `weeklyCostTag: t.weeklyCostTag ?? null`.

Массовую разметку истории НЕ делать (решение пользователя — метит по мере надобности). Тонкость: тег независим от `category` (TxCategory) — это два ортогональных поля.
  </action>
  <verify>
    <automated>npx prisma generate && npx tsc --noEmit && grep -q "CREATE TYPE \"WeeklyCostTag\"" prisma/migrations/20260710_weekly_cost_tag/migration.sql</automated>
  </verify>
  <done>prisma generate без ошибок, tsc чисто; миграция содержит CREATE TYPE + ADD COLUMN + индекс; в таблице /bank у DEBIT-строк селектор тега (MANAGE), у CREDIT — «—»; setWeeklyCostTag защищён BANK MANAGE. Коммит: `git add -A && git commit -m "feat(quick-260710-lmb): тег недельного фин-отчёта (OPEX/CAPEX/DELIVERY_MP) на банковских операциях"`</done>
</task>

<task type="auto" tdd="true">
  <name>Задача 2: pure bank-pools + гибрид-резолюция пулов и фикс одежды в data.ts</name>
  <files>lib/finance-weekly/bank-pools.ts, tests/finance-weekly-bank-pools.test.ts, lib/finance-weekly/data.ts</files>
  <behavior>
    Тесты sumBankPoolAutos (pure):
    - DEBIT + OPEX 1000 и 500, DEBIT + DELIVERY_MP 300 → { opexRub: 1500, deliveryMpRub: 300 }
    - CREDIT + OPEX игнорируется (только расход)
    - CAPEX и weeklyCostTag=null игнорируются полностью
    - Отрицательный amount берётся по модулю (|amount|)
    - Пустой массив → { opexRub: 0, deliveryMpRub: 0 }
    Тесты resolveHybridPool (pure):
    - manual=584400, bank=600000 → { total: 584400, source: "manual" } (ручное приоритетно)
    - manual=0, bank=262300 → { total: 262300, source: "bank" } (0 = не задано)
    - manual=0, bank=0 → { total: 0, source: "none" }
    - manual=100, bank=0 → { total: 100, source: "manual" }
  </behavior>
  <action>
1. **lib/finance-weekly/bank-pools.ts** (новый) — PURE, НОЛЬ runtime-импортов (паттерн attribution.ts/realization.ts — vitest-изоляция без Prisma/Next):
```typescript
export interface BankPoolAutos { opexRub: number; deliveryMpRub: number }
export interface BankTxForPools {
  direction: string          // "DEBIT" | "CREDIT"
  amountRub: number          // Decimal → number конвертирует вызывающий (data.ts)
  weeklyCostTag: string | null
}
/** Σ|amount| исходящих (DEBIT) операций по тегам OPEX / DELIVERY_MP. CAPEX и null — игнор. */
export function sumBankPoolAutos(rows: readonly BankTxForPools[]): BankPoolAutos

export type HybridPoolSource = "manual" | "bank" | "none"
/** Гибрид: manual > 0 → manual («вручную»); иначе bankAuto > 0 → банк; иначе 0.
 *  0 в manual = «не задано» — существующая семантика manualPools СОХРАНЯЕТСЯ. */
export function resolveHybridPool(manual: number, bankAuto: number): { total: number; source: HybridPoolSource }
```
Header-комментарий: назначение (W3a гибрид §7-1), Quick 260710-lmb.

2. **tests/finance-weekly-bank-pools.test.ts** — RED→GREEN: сначала тесты из behavior (describe sumBankPoolAutos / resolveHybridPool), убедиться что падают без реализации, затем реализовать функции.

3. **lib/finance-weekly/data.ts**:
   - Экспорт `export const CLOTHING_OVERHEAD_FIXED_KEY = "financeWeekly.clothingOverheadFixedRub"` (глобальная константа, НЕ per неделя).
   - В Promise.all (строки ~293-352) добавить запрос тегированных операций недели:
```typescript
prisma.bankTransaction.findMany({
  where: {
    direction: "DEBIT",
    weeklyCostTag: { in: ["OPEX", "DELIVERY_MP"] },
    date: { gte: weekStart, lte: weekEnd }, // @db.Date, [Пн..Вс] — как funnelRows
  },
  select: { direction: true, amount: true, weeklyCostTag: true },
})
```
   - В appSettings-запрос добавить CLOTHING_OVERHEAD_FIXED_KEY в `key: { in: [...] }`.
   - После загрузки: `const bankAutos = sumBankPoolAutos(bankTxRows.map((t) => ({ direction: t.direction, amountRub: Number(t.amount), weeklyCostTag: t.weeklyCostTag })))`.
   - `clothingOverheadFixedRub`: `parseFloat(settingsMap.get(CLOTHING_OVERHEAD_FIXED_KEY) ?? "")`, Number.isFinite && >= 0 → значение, иначе 0.
   - Гибрид-резолюция (шаг 12, пулы): 
     - `const deliveryResolved = resolveHybridPool(manualPools.delivery, bankAutos.deliveryMpRub)`
     - `const overheadApplResolved = resolveHybridPool(manualPools.overheadAppl, bankAutos.opexRub)`
     - `appliances.deliveryToMp.total = deliveryResolved.total`; `clothing.deliveryToMp.total = deliveryResolved.total` (SHARED, baseRevenue = combinedBase не меняется)
     - `appliances.overhead.total = overheadApplResolved.total`
     - `clothing.overhead.total = clothingOverheadFixedRub + manualPools.overheadCloth` (фикс + переменная; НЕ из банка — §2.2)
   - `WeeklyFinReportPageData` += 3 поля:
```typescript
bankAutos: BankPoolAutos                       // авто-суммы для подписей в редакторе
clothingOverheadFixedRub: number               // фикс-часть одежды (глобальный AppSetting)
bankPoolSources: { delivery: HybridPoolSource; overheadAppl: HybridPoolSource }
```
   - Оба early-return'а (нет marketplace / нет привязанных артикулов) — дефолты: `bankAutos: { opexRub: 0, deliveryMpRub: 0 }`, `clothingOverheadFixedRub: 0`, `bankPoolSources: { delivery: "none", overheadAppl: "none" }`.

ВАЖНО: существующий `resolvePoolTotals` (realization.ts, storage/acceptance) НЕ трогать — гибрид касается ТОЛЬКО delivery / overheadAppl / overheadCloth. `lib/finance-weekly/engine.ts` НЕ трогать вообще (движку всё равно — он получает готовые totals).
  </action>
  <verify>
    <automated>npx vitest run tests/finance-weekly-bank-pools.test.ts tests/finance-weekly-realization.test.ts tests/finance-weekly-engine.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>bank-pools.ts pure (grep -c "from \"@" = 0 runtime-импортов); новые тесты зелёные (≥9 кейсов); data.ts отдаёт bankAutos/bankPoolSources/clothingOverheadFixedRub; пулы delivery/overheadAppl гибридные, clothing.overhead = фикс+переменная; engine.ts без диффа. Коммит: `git add -A && git commit -m "feat(quick-260710-lmb): авто-пулы из банка (гибрид) + фикс-часть общих расходов одежды"`</done>
</task>

<task type="auto">
  <name>Задача 3: редактор пулов — банк-подписи, поле фикс одежды, saveWeeklyPools + гейты и push</name>
  <files>app/actions/finance-weekly.ts, components/finance/WeeklyFinReportControls.tsx, app/(dashboard)/finance/weekly/page.tsx</files>
  <action>
1. **app/actions/finance-weekly.ts** — расширить сигнатуру:
```typescript
export async function saveWeeklyPools(
  weekStartISO: string,
  pools: ManualPools,
  opts?: { clothingOverheadFixedRub?: number },
)
```
Недельный ключ (financeWeeklyPoolsKey) и форма ManualPools НЕ меняются. Если `opts?.clothingOverheadFixedRub` задан и Number.isFinite → `Math.max(0, n)` → второй upsert AppSetting c ключом `CLOTHING_OVERHEAD_FIXED_KEY` (импорт из lib/finance-weekly/data), `value: String(n)`. RBAC/валидация/санитизация как есть.

2. **components/finance/WeeklyFinReportControls.tsx**:
   - Props += `bankAutos: { opexRub: number; deliveryMpRub: number }`, `clothingOverheadFixedRub: number`, `bankPoolSources: { delivery: "manual" | "bank" | "none"; overheadAppl: "manual" | "bank" | "none" }`.
   - Состояние `const [fixedCloth, setFixedCloth] = useState(clothingOverheadFixedRub)`.
   - Поля `delivery` («Доставка до МП (общая)») и `overheadAppl` («Общие расходы», Бытовая техника): рядом с label бейдж источника по образцу бейджа «из реализации» (`<span className="ml-1 text-[10px] text-muted-foreground">`): "вручную" | "из банка" | "—"; под инпутом (или рядом) muted-подпись `банк: {N.toLocaleString("ru-RU")} ₽` (авто-сумма показывается ВСЕГДА, даже при manual-override); `title` на бейдже: «0 = не задано → берётся авто-сумма помеченных операций банка за неделю».
   - Группа «Одежда»: label поля `overheadCloth` → «Общие расходы (переменная)»; НОВЫЙ input «Общие расходы (фикс.)» над ним, bound к fixedCloth (та же вёрстка `w-28 text-right`), подпись `глобальная константа (не per неделя)`; строка состава под группой: `пул одежды = фикс {fixedCloth} + переменная {pools.overheadCloth} = {сумма} ₽` (text-[10px] muted, toLocaleString).
   - `handleSave` → `saveWeeklyPools(weekStartISO, pools, { clothingOverheadFixedRub: fixedCloth })`.
   - Тонкость: `POOL_FIELDS`/`GROUP_ORDER` — фикс-поле НЕ добавлять в ManualPools (оно не недельное), рендерить отдельным label внутри группы «Одежда» перед полями группы.

3. **app/(dashboard)/finance/weekly/page.tsx** — пробросить в `<WeeklyFinReportControls>` новые props: `bankAutos={data.bankAutos}` `clothingOverheadFixedRub={data.clothingOverheadFixedRub}` `bankPoolSources={data.bankPoolSources}`.

4. **Гейты** (все обязательны):
   - `npx tsc --noEmit` → 0 ошибок.
   - `npx vitest run tests/finance-weekly-engine.test.ts tests/finance-weekly-realization.test.ts tests/finance-weekly-attribution.test.ts tests/finance-weekly-credit-accrual.test.ts tests/finance-weekly-plan-fact.test.ts tests/finance-weekly-bank-pools.test.ts tests/pricing-math.test.ts tests/pricing-fallback.test.ts tests/pricing-settings.test.ts` → все зелёные.
   - engine не тронут: `git diff origin/main --stat -- lib/finance-weekly/engine.ts` → пусто.
   - Полный `npx vitest run` → падают ТОЛЬКО известные ~42-44 чужих сьюта (support/CRM/wb-sync-route/wb-token-validate и т.п.) — НЕ чинить, новых падений нет.

5. **Коммит + push**: `git add -A && git commit -m "feat(quick-260710-lmb): редактор пулов — банк-авто подписи + фикс/переменная одежды"` затем `git push origin main`. НЕ деплоить (оркестратор; миграция через deploy.sh).
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run tests/finance-weekly-bank-pools.test.ts tests/finance-weekly-engine.test.ts tests/pricing-math.test.ts && git diff origin/main --stat -- lib/finance-weekly/engine.ts | wc -l | grep -q "^0$"</automated>
  </verify>
  <done>Редактор показывает «банк: N ₽» и источник у двух гибрид-пулов; одежда = фикс (глобальная) + переменная (недельная) с суммой состава; saveWeeklyPools пишет фикс в отдельный AppSetting; tsc чисто, гейтовые сьюты зелёные, engine.ts без диффа, всё закоммичено и запушено в origin/main; деплой НЕ выполнялся</done>
</task>

</tasks>

<verification>
1. `npx prisma generate && npx tsc --noEmit` — чисто.
2. `npx vitest run tests/finance-weekly-*.test.ts tests/pricing-math.test.ts tests/pricing-fallback.test.ts tests/pricing-settings.test.ts` — все зелёные (включая новый bank-pools).
3. `git diff origin/main --stat -- lib/finance-weekly/engine.ts` — пусто (движок не тронут).
4. Миграция 20260710_weekly_cost_tag: CREATE TYPE + ADD COLUMN + CREATE INDEX (grep).
5. Семантика: manual=0 → банк-авто; manual>0 → manual; CAPEX нигде не суммируется; clothing.overhead не зависит от банка.
6. `git log origin/main..HEAD` — пусто после push (все коммиты запушены). Деплой НЕ выполнялся.
</verification>

<success_criteria>
- Тег OPEX/CAPEX/DELIVERY_MP ставится/снимается инлайн на DEBIT-строках /bank (BANK MANAGE), сохраняется в BankTransaction.weeklyCostTag.
- /finance/weekly: пулы «Общие расходы (бытовая)» и «Доставка до МП» = ручное значение недели (>0) ИЛИ Σ|amount| тегированных DEBIT-операций [Пн..Вс] ИЛИ 0; источник виден в редакторе.
- Пул «Общие расходы (одежда)» = AppSetting-фикс + недельная переменная, редактируется в том же редакторе, фикс пишется в financeWeekly.clothingOverheadFixedRub.
- Pure-часть (sumBankPoolAutos, resolveHybridPool) покрыта unit-тестами без Prisma/Next-импортов.
- tsc чисто; гейтовые сьюты зелёные; engine.ts не изменён; 3 атомарных коммита запушены в origin/main; деплоя нет.
</success_criteria>

<output>
После завершения создать `.planning/quick/260710-lmb-w3a/260710-lmb-SUMMARY.md`
(образец: .planning/quick/260710-kvf-wb-api/260710-kvf-SUMMARY.md).
Пометить пост-деплой шаг: `prisma migrate deploy` применит 20260710_weekly_cost_tag на VPS (через deploy.sh, выполняет оркестратор).
</output>
