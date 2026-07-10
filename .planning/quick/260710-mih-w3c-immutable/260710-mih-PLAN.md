---
phase: quick-260710-mih
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - prisma/migrations/20260710_weekly_finreport_snapshot/migration.sql
  - lib/finance-weekly/snapshot.ts
  - lib/finance-weekly/live.ts
  - app/actions/finance-weekly.ts
  - tests/finance-weekly-snapshot.test.ts
  - app/(dashboard)/finance/weekly/page.tsx
  - components/finance/WeeklyFinReportControls.tsx
autonomous: true
requirements: [W3C-SNAPSHOT]

must_haves:
  truths:
    - "FINANCE MANAGE-пользователь фиксирует выбранную неделю кнопкой «Зафиксировать неделю» на /finance/weekly"
    - "Зафиксированная неделя рендерится ИЗ снапшота (loadWeeklyFinReportInputs/computeWeeklyFinReport НЕ вызываются) с бейджем «Зафиксирована <дата> <кем>»"
    - "«Перефиксировать» перезаписывает снапшот свежим серверным расчётом (clean-replace upsert); «Снять фиксацию» удаляет снапшот и возвращает live-режим"
    - "Незафиксированная неделя работает как раньше (live-расчёт), пулы-редактор доступен"
    - "Снапшот с чужой version → fallback на live + warning-бейдж «снапшот устарел, перефиксируйте»"
    - "lib/finance-weekly/engine.ts не изменён (diff-guard)"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "model WeeklyFinReportSnapshot (weekStart @db.Date @unique, fixedAt, fixedById FK User SetNull, payloadJson Json)"
      contains: "model WeeklyFinReportSnapshot"
    - path: "prisma/migrations/20260710_weekly_finreport_snapshot/migration.sql"
      provides: "hand-written миграция CREATE TABLE + unique index + FK"
      contains: "WeeklyFinReportSnapshot"
    - path: "lib/finance-weekly/snapshot.ts"
      provides: "WeeklyFinReportSnapshotPayload v1 + buildWeeklySnapshotPayload + parseWeeklySnapshotPayload + toIsoMonday (pure)"
      exports: ["WEEKLY_SNAPSHOT_VERSION", "buildWeeklySnapshotPayload", "parseWeeklySnapshotPayload", "toIsoMonday"]
      min_lines: 60
    - path: "lib/finance-weekly/live.ts"
      provides: "loadWeeklyLiveBundle — общая композиция live-расчёта для page.tsx и fixWeeklyReport"
      exports: ["loadWeeklyLiveBundle"]
    - path: "app/actions/finance-weekly.ts"
      provides: "server actions fixWeeklyReport / unfixWeeklyReport (FINANCE MANAGE)"
      exports: ["fixWeeklyReport", "unfixWeeklyReport"]
    - path: "tests/finance-weekly-snapshot.test.ts"
      provides: "roundtrip build→JSON→parse, version-guard, toIsoMonday"
      min_lines: 40
    - path: "app/(dashboard)/finance/weekly/page.tsx"
      provides: "ветка рендера из снапшота (findUnique → parse → payload в Table/Controls)"
      contains: "weeklyFinReportSnapshot"
    - path: "components/finance/WeeklyFinReportControls.tsx"
      provides: "кнопка «Зафиксировать неделю», бейдж «Зафиксирована …», «Перефиксировать»/«Снять фиксацию», скрытие пулов-редактора"
      contains: "fixWeeklyReport"
  key_links:
    - from: "components/finance/WeeklyFinReportControls.tsx"
      to: "app/actions/finance-weekly.ts"
      via: "import { fixWeeklyReport, unfixWeeklyReport }"
      pattern: "fixWeeklyReport"
    - from: "app/actions/finance-weekly.ts"
      to: "lib/finance-weekly/live.ts"
      via: "серверный пересбор пейлоада (не доверяет клиенту)"
      pattern: "loadWeeklyLiveBundle"
    - from: "app/actions/finance-weekly.ts"
      to: "prisma.weeklyFinReportSnapshot"
      via: "upsert clean-replace / deleteMany"
      pattern: "weeklyFinReportSnapshot\\.(upsert|deleteMany)"
    - from: "app/(dashboard)/finance/weekly/page.tsx"
      to: "lib/finance-weekly/snapshot.ts"
      via: "parseWeeklySnapshotPayload(snapshot.payloadJson) с version-guard"
      pattern: "parseWeeklySnapshotPayload"
---

<objective>
W3c — фиксация недели Понедельного фин-отчёта (/finance/weekly): immutable-снапшот рассчитанного результата, чтобы прошлые недели не «плыли» при изменении справочников (себестоимость, комиссии, курсы, план продаж). Паттерн — SalesPlanVersion (спека §4.2.C), но ОДНА строка на неделю с целым рендер-пейлоадом в Json-колонке (~300КБ/нед приемлемо, дочерние таблицы НЕ нужны — здесь один снимок, не дни×товары).

Purpose: воспроизводимость исторических недель фин-отчёта — после фиксации неделя показывает ровно то, что видел пользователь в момент проверки.
Output: модель WeeklyFinReportSnapshot + hand-written миграция, pure-модуль snapshot.ts (payload v1 + build/parse), общий live-загрузчик, actions fix/unfix, режим «зафиксированная неделя» на странице и в Controls.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@docs/superpowers/specs/2026-07-08-weekly-finreport-design.md (§4.2.C — WeeklyFinReportVersion)
@lib/finance-weekly/types.ts
@lib/finance-weekly/data.ts
@lib/finance-weekly/plan-fact.ts
@app/(dashboard)/finance/weekly/page.tsx
@components/finance/WeeklyFinReportControls.tsx
@app/actions/finance-weekly.ts
@prisma/schema.prisma (model SalesPlanVersion ~строка 2079 — образец; model User ~строка 114-122 — back-relations)

<interfaces>
<!-- Ключевые контракты. Executor использует их напрямую — без исследования кодабазы. -->

From lib/finance-weekly/data.ts (всё уже экспортировано):
```typescript
export interface ManualPools { delivery; overheadAppl; acceptanceAppl; storageAppl; overheadCloth; acceptanceCloth; storageCloth: number }
export interface WeeklyArticleMeta { brandName: string|null; productName: string; productId: string; directionName: string|null; categoryName: string|null; subcategoryName: string|null }
export interface WeeklyFinReportPageData {
  weekStart: string; weekEnd: string
  articles: WeeklyArticleInput[]
  meta: Record<number, WeeklyArticleMeta>
  pools: { appliances: UniversePools; clothing: UniversePools }
  constants: WeeklyConstants
  manualPools: ManualPools
  hasRealization: boolean
  poolSources: Record<"storageAppl"|"storageCloth"|"acceptanceAppl"|"acceptanceCloth", "realization"|"manual">
  bankAutos: { opexRub: number; deliveryMpRub: number }
  clothingOverheadFixedRub: number
  bankPoolSources: { delivery: "manual"|"bank"|"none"; overheadAppl: "manual"|"bank"|"none" }
}
export async function loadWeeklyFinReportInputs(weekStart: Date): Promise<WeeklyFinReportPageData>
```

From lib/finance-weekly/engine.ts (НЕ МЕНЯТЬ — diff-guard):
```typescript
export function computeWeeklyFinReport(inputs: WeeklyFinReportInputs): WeeklyFinReportOutput
// WeeklyFinReportOutput = { articles: ArticleResult[]; rollup: WeeklyRollup; waterfall: WeeklyWaterfall }
// Все поля — plain numbers/strings, JSON-безопасны (без Date/Map/Decimal).
```

From lib/finance-weekly/plan-fact.ts:
```typescript
export async function loadWeeklyPlanFact(
  weekStart: Date, weekEnd: Date, articleNmIds: number[],
  nmIdToProductId: Map<number, string>, universeByNmId: ReadonlyMap<number, Universe>,
): Promise<WeeklyPlanFact>
// WeeklyPlanFact = { hasActivePlan: boolean; planWeekByNmId: Map<number,number>; factMonthByNmId: Map<...>; totals: { planWeek; factWeek; planMonth; factMonthMtd } }
```

From app/(dashboard)/finance/weekly/page.tsx — текущая композиция live (строки 60-93), она ПЕРЕЕЗЖАЕТ в lib/finance-weekly/live.ts:
```typescript
const data = await loadWeeklyFinReportInputs(weekStart)
const result = computeWeeklyFinReport({ articles: data.articles, pools: data.pools, constants: data.constants })
// planFact: Map→Record на RSC-границе; null если !hasActivePlan
// planFact = { planWeekByNmId: Object.fromEntries(...), kpi: planFactRaw.totals, weekEndISO: data.weekEnd } | null
```

From app/actions/sales-plan.ts — паттерн userId из сессии:
```typescript
import { auth } from "@/lib/auth"
const session = await auth(); const userId = session?.user?.id ?? null
```

Prisma Json write — устоявшийся паттерн проекта: `payloadJson: payload as never`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Модель WeeklyFinReportSnapshot + snapshot.ts (payload v1, pure) + live.ts + actions fix/unfix</name>
  <files>prisma/schema.prisma, prisma/migrations/20260710_weekly_finreport_snapshot/migration.sql, lib/finance-weekly/snapshot.ts, lib/finance-weekly/live.ts, app/actions/finance-weekly.ts, tests/finance-weekly-snapshot.test.ts</files>
  <behavior>
    tests/finance-weekly-snapshot.test.ts (pure, БЕЗ импорта Prisma/next; vitest pool=vmForks уже в конфиге):
    - Roundtrip: buildWeeklySnapshotPayload(fakeData, fakeResult, fakePlanFact) → JSON.parse(JSON.stringify(payload)) → parseWeeklySnapshotPayload → deepEqual исходному payload; version === 1.
    - Roundtrip с planFact: null — parse возвращает planFact: null (не undefined).
    - Version-guard: parseWeeklySnapshotPayload(null) === null; ({}) === null; ({ version: 2, articles: [] }) === null; ("строка") === null; ({ version: 1 }) без articles-массива === null.
    - toIsoMonday: "2026-07-08" (среда) → "2026-07-06"; "2026-07-06" (пн) → "2026-07-06"; "2026-07-12" (вс) → "2026-07-06".
    Фейковые data/result — минимальные объекты, удовлетворяющие типам (1 артикул appliances, пустые пулы clothing).
  </behavior>
  <action>
**1. prisma/schema.prisma** — после model WbRealizationWeekly (найти по `model WbRealizationWeekly`) добавить:

```prisma
// W3c (quick 260710-mih): immutable-снапшот недели понедельного фин-отчёта.
// ОДНА строка на неделю, весь рендер-пейлоад одним Json (~300КБ) — НЕ дробим
// на дочерние таблицы (в отличие от SalesPlanVersionDay: там дни×товары,
// здесь один снимок). Clean-replace через upsert («Перефиксировать»).
model WeeklyFinReportSnapshot {
  id          String   @id @default(cuid())
  weekStart   DateTime @db.Date @unique // ISO-понедельник UTC
  fixedAt     DateTime @default(now())
  fixedById   String?
  fixedBy     User?    @relation(fields: [fixedById], references: [id], onDelete: SetNull)
  payloadJson Json     // WeeklyFinReportSnapshotPayload v1 (lib/finance-weekly/snapshot.ts)
}
```

В model User (рядом с `salesPlanVersions SalesPlanVersion[]`, ~строка 118) добавить back-relation: `weeklyFinReportSnapshots WeeklyFinReportSnapshot[]`.

**2. Hand-written миграция** prisma/migrations/20260710_weekly_finreport_snapshot/migration.sql (образец — 20260710_wb_realization_weekly; локального PG нет — применится через deploy.sh, НЕ запускать migrate локально):

```sql
-- W3c (quick 260710-mih): immutable-снапшот недели понедельного фин-отчёта.
-- Одна строка на неделю; payloadJson = весь рендер-пейлоад (v1). Без backfill.
CREATE TABLE "WeeklyFinReportSnapshot" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "fixedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fixedById" TEXT,
    "payloadJson" JSONB NOT NULL,
    CONSTRAINT "WeeklyFinReportSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WeeklyFinReportSnapshot_weekStart_key" ON "WeeklyFinReportSnapshot"("weekStart");
ALTER TABLE "WeeklyFinReportSnapshot" ADD CONSTRAINT "WeeklyFinReportSnapshot_fixedById_fkey"
  FOREIGN KEY ("fixedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

**3. lib/finance-weekly/snapshot.ts** — НОВЫЙ pure-модуль. ТОЛЬКО `import type` из data.ts/types.ts (type-only импорты стираются компилятором → vitest не тянет Prisma):

```typescript
import type { WeeklyFinReportPageData } from "@/lib/finance-weekly/data"
import type { WeeklyFinReportOutput } from "@/lib/finance-weekly/types" // + под-типы по необходимости

export const WEEKLY_SNAPSHOT_VERSION = 1

/** План-факт в снапшоте — форма PlanFactProps таблицы (Record, не Map). */
export interface WeeklySnapshotPlanFact {
  planWeekByNmId: Record<number, number>
  kpi: { planWeek: number; factWeek: number; planMonth: number; factMonthMtd: number }
  weekEndISO: string
}

/** ВСЁ, что нужно для рендера WeeklyFinReportTable + Controls + KPI без пересчёта. */
export interface WeeklyFinReportSnapshotPayload {
  version: 1
  weekStart: string
  weekEnd: string
  // Результат движка (рендер таблицы)
  articles: WeeklyFinReportOutput["articles"]
  rollup: WeeklyFinReportOutput["rollup"]
  waterfall: WeeklyFinReportOutput["waterfall"]
  meta: WeeklyFinReportPageData["meta"]
  planFact: WeeklySnapshotPlanFact | null
  // Входы (аудит + read-only отображение в Controls)
  pools: WeeklyFinReportPageData["pools"]
  constants: WeeklyFinReportPageData["constants"]
  manualPools: WeeklyFinReportPageData["manualPools"]
  hasRealization: boolean
  poolSources: WeeklyFinReportPageData["poolSources"]
  bankAutos: WeeklyFinReportPageData["bankAutos"]
  clothingOverheadFixedRub: number
  bankPoolSources: WeeklyFinReportPageData["bankPoolSources"]
}

export function buildWeeklySnapshotPayload(
  data: WeeklyFinReportPageData,
  result: WeeklyFinReportOutput,
  planFact: WeeklySnapshotPlanFact | null,
): WeeklyFinReportSnapshotPayload { /* сборка полей 1:1, version: WEEKLY_SNAPSHOT_VERSION */ }

/** Типизированный parse с version-guard: не объект / version !== 1 /
 *  articles не массив → null (страница уходит в live-fallback + warning). */
export function parseWeeklySnapshotPayload(json: unknown): WeeklyFinReportSnapshotPayload | null

/** Нормализует ISO-дату к её ISO-понедельнику (UTC). Копия логики page.tsx
 *  (jsDay===0 ? 7 : jsDay), вынесена как pure для action + тестов. */
export function toIsoMonday(iso: string): string
```

Числа — как есть (никаких округлений). Map'ов в пейлоаде нет по построению (всё уже Record на RSC-границе).

**4. lib/finance-weekly/live.ts** — НОВЫЙ server-модуль: композиция live-расчёта, выносится ИЗ page.tsx (строки 60-93) БЕЗ изменений логики:

```typescript
export interface WeeklyLiveBundle {
  data: WeeklyFinReportPageData
  result: WeeklyFinReportOutput
  planFact: WeeklySnapshotPlanFact | null
}
export async function loadWeeklyLiveBundle(weekStart: Date): Promise<WeeklyLiveBundle>
```

Внутри: loadWeeklyFinReportInputs → computeWeeklyFinReport({articles, pools, constants}) → сборка nmIdToProductId/universeByNmId → loadWeeklyPlanFact → planFact = hasActivePlan ? { planWeekByNmId: Object.fromEntries(...), kpi: totals, weekEndISO: data.weekEnd } : null. page.tsx в Task 1 НЕ трогать (переключение — Task 2; tsc остаётся зелёным, live.ts просто ещё не используется страницей).

**5. app/actions/finance-weekly.ts** — добавить два action (существующий saveWeeklyPools не трогать):

```typescript
export async function fixWeeklyReport(weekStartISO: string): Promise<{ ok: true } | { ok: false; error: string }>
```
- `await requireSection("FINANCE", "MANAGE")` (в try/catch, паттерн saveWeeklyPools);
- guard ISO_DATE_RE, затем `const mondayISO = toIsoMonday(weekStartISO)`; `const weekStart = new Date(mondayISO + "T00:00:00Z")`;
- СЕРВЕРНЫЙ пересбор (клиенту не доверяем): `const bundle = await loadWeeklyLiveBundle(weekStart)`;
- guard: `bundle.data.articles.length === 0` → `{ ok: false, error: "Нет данных за неделю — фиксировать нечего" }`;
- `const payload = buildWeeklySnapshotPayload(bundle.data, bundle.result, bundle.planFact)`;
- userId: `import { auth } from "@/lib/auth"`; `const fixedById = (await auth())?.user?.id ?? null`;
- clean-replace upsert:
```typescript
await prisma.weeklyFinReportSnapshot.upsert({
  where: { weekStart },
  create: { weekStart, fixedById, payloadJson: payload as never },
  update: { payloadJson: payload as never, fixedAt: new Date(), fixedById },
})
```
- `revalidatePath("/finance/weekly")` → `{ ok: true }`.

```typescript
export async function unfixWeeklyReport(weekStartISO: string): Promise<{ ok: true } | { ok: false; error: string }>
```
- MANAGE + ISO guard + toIsoMonday → `prisma.weeklyFinReportSnapshot.deleteMany({ where: { weekStart } })` → revalidatePath → ok.

**6. Тесты** — по <behavior>. Запуск нового: `npx vitest run tests/finance-weekly-snapshot.test.ts`.

**7. Гейты Task 1:** `npx prisma generate` (без БД), `npx tsc --noEmit` чисто, новый тест зелёный, `git status --porcelain lib/finance-weekly/engine.ts` пуст (engine не тронут). Коммит: `git add -A && git commit -m "feat(w3c): снапшот недели фин-отчёта — модель + payload v1 + actions fix/unfix"`.
  </action>
  <verify>
    <automated>npx prisma generate && npx tsc --noEmit && npx vitest run tests/finance-weekly-snapshot.test.ts && git diff HEAD --quiet -- lib/finance-weekly/engine.ts</automated>
  </verify>
  <done>Модель + миграция созданы, prisma generate и tsc чисты, snapshot-тесты зелёные (roundtrip + version-guard + toIsoMonday), fixWeeklyReport/unfixWeeklyReport экспортированы с RBAC MANAGE и серверным пересбором пейлоада, engine.ts без diff, атомарный коммит сделан.</done>
</task>

<task type="auto">
  <name>Task 2: page.tsx режим «зафиксированная неделя» + Controls (кнопка/бейдж/read-only) + гейты + push</name>
  <files>app/(dashboard)/finance/weekly/page.tsx, components/finance/WeeklyFinReportControls.tsx</files>
  <action>
**1. app/(dashboard)/finance/weekly/page.tsx:**

После резолва weekStart — запросить снапшот:
```typescript
const snapshot = await prisma.weeklyFinReportSnapshot.findUnique({
  where: { weekStart },
  include: { fixedBy: { select: { firstName: true, lastName: true, name: true } } },
})
```
(добавить `import { prisma } from "@/lib/prisma"`).

Ветвление:
- **snapshot существует** → `const payload = parseWeeklySnapshotPayload(snapshot.payloadJson)`:
  - **payload !== null** (зафиксированный режим): live-расчёт НЕ вызывается вообще. Рендер из payload: Table получает `articles={payload.articles} rollup={payload.rollup} waterfall={payload.waterfall} meta={payload.meta} planFact={payload.planFact}`; Controls получает пулы/источники из payload (manualPools, poolSources, bankAutos, clothingOverheadFixedRub, bankPoolSources) + новый prop `snapshot={{ fixedAtLabel, fixedByName }}`. На сервере: `fixedByName = [fixedBy?.firstName, fixedBy?.lastName].filter(Boolean).join(" ") || fixedBy?.name || null`; `fixedAtLabel = snapshot.fixedAt.toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })` (Moscow timezone — конвенция проекта). weekStartISO/weekEndISO для Controls — из payload.
  - **payload === null** (version mismatch / мусор): fallback live через `loadWeeklyLiveBundle(weekStart)` + prop `snapshotStale={true}` в Controls (warning-бейдж «снапшот устарел, перефиксируйте»).
- **снапшота нет** → live как сейчас, но через `const { data, result, planFact } = await loadWeeklyLiveBundle(weekStart)` (инлайн-композиция строк 60-93 удаляется — она переехала в live.ts в Task 1). Рендер идентичен текущему.

`export const dynamic = "force-dynamic"` и RBAC-гейт (`requireSection("FINANCE")` + canManage) — сохранить как есть.

**2. components/finance/WeeklyFinReportControls.tsx:**

Новые optional props:
```typescript
/** W3c: снапшот-режим — бейдж + Перефиксировать/Снять; пулы-редактор скрыт. */
snapshot?: { fixedAtLabel: string; fixedByName: string | null } | null
/** W3c: снапшот есть, но version не совпал → live-fallback + warning. */
snapshotStale?: boolean
```

Импорт actions: `import { fixWeeklyReport, unfixWeeklyReport } from "@/app/actions/finance-weekly"`. Отдельный `useTransition` для фиксации (isFixPending).

В строке выбора недели (после кнопки «Реализация WB», перед `<span>{weekStartISO} — {weekEndISO}</span>`):
- **!snapshot && !snapshotStale && canManage** → кнопка «Зафиксировать неделю»: transition → `fixWeeklyReport(weekStartISO)` → ok: `toast.success("Неделя зафиксирована")` + `router.refresh()`; error: `toast.error(res.error)`. Стиль — как соседние кнопки (`px-2 py-1 text-xs border rounded …`), disabled при isFixPending.
- **snapshot** → бейдж (span, `rounded border border-emerald-600/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400`): `Зафиксирована {fixedAtLabel}{fixedByName ? " · " + fixedByName : ""}`. Рядом при canManage: кнопки «Перефиксировать» (→ fixWeeklyReport, перезапишет clean-replace) и «Снять фиксацию» (→ unfixWeeklyReport → toast «Фиксация снята» + router.refresh()).
- **snapshotStale** → amber warning-бейдж «Снапшот устарел — перефиксируйте» (`border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-400`) + при canManage кнопка «Перефиксировать» (fixWeeklyReport — создаст пейлоад актуальной version).

Пулы-редактор: условие рендера `canManage && !snapshot` (в снапшот-режиме СКРЫТ — значения заморожены в пейлоаде, редактировать нечего; при live-fallback stale-режима редактор доступен как обычно). Кнопка «Реализация WB» остаётся видимой во всех режимах (импорт данных не влияет на отрисовку снапшота; полезна перед перефиксацией) — прокомментировать в коде.

**3. Гейты (полные, перед финальным коммитом):**
- `npx tsc --noEmit` чисто;
- гейтовые сьюты finance-weekly + pricing + новый snapshot:
  `npx vitest run tests/finance-weekly-engine.test.ts tests/finance-weekly-plan-fact.test.ts tests/finance-weekly-attribution.test.ts tests/finance-weekly-bank-pools.test.ts tests/finance-weekly-credit-accrual.test.ts tests/finance-weekly-realization.test.ts tests/finance-weekly-snapshot.test.ts tests/pricing-math.test.ts tests/pricing-fallback.test.ts tests/pricing-settings.test.ts` — все зелёные (полный suite НЕ гонять/НЕ чинить — ~44/79 известных чужих падений);
- diff-guard: `git diff HEAD --quiet -- lib/finance-weekly/engine.ts`;
- Коммит: `git add -A && git commit -m "feat(w3c): /finance/weekly — режим зафиксированной недели (рендер из снапшота)"`;
- `git push origin main`. **НЕ деплоить** (деплой — решение оркестратора; миграция применится на VPS через deploy.sh).
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run tests/finance-weekly-engine.test.ts tests/finance-weekly-plan-fact.test.ts tests/finance-weekly-attribution.test.ts tests/finance-weekly-bank-pools.test.ts tests/finance-weekly-credit-accrual.test.ts tests/finance-weekly-realization.test.ts tests/finance-weekly-snapshot.test.ts tests/pricing-math.test.ts tests/pricing-fallback.test.ts tests/pricing-settings.test.ts && git diff HEAD --quiet -- lib/finance-weekly/engine.ts</automated>
  </verify>
  <done>Зафиксированная неделя рендерится из payloadJson без live-расчёта (бейдж «Зафиксирована дата · кем», пулы-редактор скрыт, «Перефиксировать»/«Снять фиксацию» для MANAGE); незафиксированная — live с кнопкой «Зафиксировать неделю»; stale-version → live + amber-warning. tsc + все гейтовые сьюты зелёные, engine.ts без diff, коммиты атомарные, push сделан, деплой НЕ выполнялся.</done>
</task>

</tasks>

<verification>
- `npx prisma generate` без ошибок; `npx tsc --noEmit` чисто.
- `npx vitest run tests/finance-weekly-*.test.ts tests/pricing-*.test.ts` — все зелёные (новый tests/finance-weekly-snapshot.test.ts включён).
- `git diff HEAD --quiet -- lib/finance-weekly/engine.ts` — engine не изменён.
- grep-проверки ключевых связей: `fixWeeklyReport` в Controls; `loadWeeklyLiveBundle` в actions и page; `parseWeeklySnapshotPayload` в page; `weeklyFinReportSnapshot.upsert` в actions.
- Оба коммита в истории, `git push origin main` выполнен, деплоя не было.
</verification>

<success_criteria>
- Модель WeeklyFinReportSnapshot (одна строка на неделю, weekStart @db.Date @unique, payloadJson Json, fixedById FK SetNull) + hand-written миграция.
- Пейлоад v1 типизирован (snapshot.ts, pure), содержит всё для рендера Table + Controls + KPI: articles/rollup/waterfall/meta/planFact/пулы/источники/константы.
- fixWeeklyReport пересобирает пейлоад НА СЕРВЕРЕ (loadWeeklyLiveBundle) и делает clean-replace upsert; unfixWeeklyReport удаляет снапшот. Оба — FINANCE MANAGE.
- Зафиксированная неделя открывается из снапшота (без пересчёта) с бейджем «Зафиксирована <дата> <кем>»; version-guard с live-fallback + warning; незафиксированная — live как раньше.
- Крон НЕ добавлен (фиксация — ручное решение после проверки недели).
</success_criteria>

<output>
After completion, create `.planning/quick/260710-mih-w3c-immutable/260710-mih-SUMMARY.md`
</output>
