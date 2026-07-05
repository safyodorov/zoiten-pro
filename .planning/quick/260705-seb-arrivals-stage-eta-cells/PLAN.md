---
phase: quick-260705-seb
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: [ARRIVALS-ETA-STAGE, FACT-REDEMPTION, PRO-RATA-DEV, CELL-FORMAT]
files_modified:
  - lib/sales-plan/arrivals.ts
  - lib/sales-plan/data.ts
  - tests/sales-plan-arrivals.test.ts
  - app/(dashboard)/sales-plan/products/page.tsx
  - components/sales-plan/ProductPlanTable.tsx

must_haves:
  truths:
    - "ETA неотгруженной закупки не может быть раньше (today + транзит/leadtime по текущему этапу)"
    - "plannedArrivalDate игнорирует floor (ручной приоритет)"
    - "Факт per-товар в ячейках «Товаров» — по дате реализации (НЕТТО ₽ и шт), июль УКТ-000001 ≈ 762 тыс ₽"
    - "Отклонение % = факт_прошедших / план_версии_прошедших − 1 (pro-rata), скрыт без активной версии"
    - "Ячейка показывает числа: план `407 · 61 шт`, факт `762 · 113 шт`, `+87%` — без букв П/Ф/К/М"
  artifacts:
    - path: "lib/sales-plan/arrivals.ts"
      provides: "floor по текущему этапу в resolveLeadtimeDate"
      contains: "reachedStages"
    - path: "tests/sales-plan-arrivals.test.ts"
      provides: "тесты floor по этапам + max-семантика"
      contains: "today"
    - path: "components/sales-plan/ProductPlanTable.tsx"
      provides: "числовой формат ячеек + легенда + тыс ₽ футер"
      contains: "тыс ₽"
  key_links:
    - from: "lib/sales-plan/data.ts"
      to: "resolveArrivalBatches"
      via: "PurchaseInput.reachedStages + input.today"
      pattern: "reachedStages"
    - from: "app/(dashboard)/sales-plan/products/page.tsx"
      to: "ProductPlanTable factByProduct"
      via: "factData.redemptionByProduct"
      pattern: "redemptionByProduct"
    - from: "app/(dashboard)/sales-plan/products/page.tsx"
      to: "SalesPlanVersionDay.planBuyoutsRub"
      via: "activeVersionId groupBy (productId, month) для дней ≤ today−1"
      pattern: "versionPastPlanRub"
---

<objective>
Четыре связанных правки раздела `/sales-plan/products` (решения пользователя ЗАФИКСИРОВАНЫ 2026-07-05):

- **D-1** ETA приходов с floor по текущему этапу закупки (неотгруженные не могут «прийти вчера»).
- **D-3** Факт per-товар в ячейках «Товаров» — по дате реализации (НЕТТО, WbSalesDaily) вместо когортного funnel.
- **D-4** Pro-rata отклонение факта от плана активной версии (прошедшие дни).
- **D-5** Числовой формат ячеек: план / факт · тыс ₽ · шт, без букв П/Ф/К/М, легенда сверху справа.

Purpose: устранить нереалистичные даты приходов (createdAt+45 в прошлом) и привести факт/формат к кабинетной реализации + честному pro-rata сравнению с зафиксированным планом.
Output: правки в 5 файлах, GATE-набор тестов зелёный.

НЕ трогать: `engine.ts`, `virtual-purchases.ts`, golden iu=438068120, RBAC, схему БД (миграций НЕТ), модалку «Дни» (`ProductPlanDialog`).

**D-2 (пост-деплой, НЕ код):** оркестратор после деплоя выставляет на проде AppSetting `salesPlan.transitDays` 20→40 (SQL/UI). В коде НЕ реализуется — только отметить в SUMMARY как post-deploy шаг.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md

<interfaces>
<!-- Проверено чтением реальных файлов 2026-07-05. Executor использует напрямую, БЕЗ исследования кодовой базы. -->

Из lib/purchase-stages.ts (STAGE_ORDER = PRODUCTION → INSPECTION → SHIPMENT → TRANSIT → WAREHOUSE):
```typescript
export function currentStageOf(reachedStages: readonly string[]): StageKey | null
// null если reachedStages пуст (= состояние «Заказано»). Иначе — самый дальний по STAGE_ORDER.
```

Из lib/sales-plan/arrivals.ts (текущий контракт):
```typescript
interface PurchaseInput {
  id: string
  plannedArrivalDate: string | null
  createdAt: string | null
  qtyRemaining: number
  transitQty: number
  transitDate: string | null
  leadTimeDays: number | null
  // ↓ ДОБАВИТЬ в D-1:
  // reachedStages: string[]   // ключи достигнутых этапов item'а (PurchaseItemStageProgress.stage)
}
export interface ArrivalBatchesInput {
  productId: string
  purchases: PurchaseInput[]
  virtualPurchases: VirtualPurchaseInput[]
  legacyIncoming: LegacyIncoming | null
  wbInboundLagDays: number
  transitDays: number
  defaultLeadTimeDays: number
  // ↓ ДОБАВИТЬ в D-1:
  // today: string            // ISO "2026-07-05" — для floor неотгруженных
}
// resolveLeadtimeDate(pur, defaultLeadTimeDays, wbInboundLagDays) — уровень 3, ~стр.211
import { addDays } from "./dates"  // addDays(iso, n): string, UTC
```

Из lib/sales-plan/data.ts:
- `loadSalesPlanInputs` уже принимает `params.today` (стр.73). Запрос закупок ~стр.239-257 селектит `items.stages { stage, quantity, date }` — ВСЕ достигнутые этапы уже доступны (PurchaseItemStageProgress @@unique([itemId, stage]) → строка есть только для достигнутого этапа).
- Сборка `PurchaseInputForProduct` ~стр.283-311 — тут добавить `reachedStages: item.stages.map(s => s.stage)`.
- `arrivalInput` ~стр.424-440 — тут добавить `today`.
- `loadFactDaily` возвращает (уже реализовано, стр.484-505): `byProduct` (funnel-когорта), `redemptionByProduct` (Map<productId, Map<date, FactDailyRow>>, buyoutsRub = НЕТТО = buyouts+returnsRub, returnsRub хранится ОТРИЦАТЕЛЬНЫМ; buyoutsUnits = buyoutsCount). НЕ трогать loadFactDaily — только использовать redemptionByProduct в page.tsx.

Из prisma/schema.prisma (НЕ менять):
```
model SalesPlanVersionDay { versionId, productId, date @db.Date, planBuyoutsRub Float, ... @@unique([versionId, productId, date]) }
```
Активная версия: AppSetting key "salesPlan.activeVersionId" → value = versionId.

Из ProductPlanTable.tsx (текущие форматтеры):
- `fmtNum(n, digits=0)` — ru-RU локаль. `fmtRub(n)` — К/М-компакт (заменяется в D-5 на тыс).
- Ячейка просмотра ~стр.664-706: `П {fmtRub(planRub)}` / `Ф {fmtRub(factRow.buyoutsRub)}` / pct / `≈ N шт`.
- Футер ~стр.732-751, «Итог ₽» th ~стр.469.
- `getMonthFact` ~стр.110-127 агрегирует factByProduct по месяцу (buyoutsRub + buyoutsUnits).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Задача 1 (D-1): ETA приходов с floor по текущему этапу + тесты</name>
  <read_first>
    lib/sales-plan/arrivals.ts (весь), lib/purchase-stages.ts (currentStageOf, STAGE_ORDER),
    lib/sales-plan/data.ts (стр.239-311 сборка purchases, стр.424-440 arrivalInput),
    tests/sales-plan-arrivals.test.ts (весь — фикстура makeInput, существующие 8 кейсов).
  </read_first>
  <behavior>
    - SHIPMENT-этап + createdAt+45 < today+transitDays → ETA = today + transitDays (+ lag).
    - PRODUCTION/INSPECTION/нет этапов («Заказано») + createdAt+45 < today+defaultLeadTimeDays → ETA = today + defaultLeadTimeDays (+ lag).
    - createdAt+leadTime > floor → берётся createdAt+leadTime (max сохраняет позднейшую дату).
    - plannedArrivalDate → floor НЕ применяется (остаётся manual, как было).
    - Существующие TRANSIT-кейсы (transit-eta, сплит, qty=0, date=null) НЕ меняются — зелёные.
    - Остаток частичного TRANSIT (leadtime-eta ветка) — floor-ится так же, как обычный leadtime-eta.
  </behavior>
  <action>
1. **lib/sales-plan/arrivals.ts** — расширить контракт и floor:
   - В `interface PurchaseInput` добавить поле `reachedStages: string[]` (после `leadTimeDays`). Ключи достигнутых этапов item'а.
   - В `interface ArrivalBatchesInput` добавить поле `today: string` (ISO "YYYY-MM-DD", после `defaultLeadTimeDays`).
   - В `resolveArrivalBatches` деструктуризации (стр.69-76) добавить `today` в список из `input`.
   - Импортировать `currentStageOf` из `@/lib/purchase-stages` (рядом с `import { addDays } from "./dates"`).
   - Переписать `resolveLeadtimeDate` — добавить floor по текущему этапу. Новая сигнатура:
     ```typescript
     function resolveLeadtimeDate(
       pur: PurchaseInput,
       defaultLeadTimeDays: number,
       wbInboundLagDays: number,
       today: string,
       transitDays: number,
     ): string | null {
       if (pur.createdAt == null) return null
       const lt = pur.leadTimeDays ?? defaultLeadTimeDays
       const rawLeadtime = addDays(pur.createdAt, lt) // createdAt + leadTime
       // floor по ТЕКУЩЕМУ этапу (currentStageOf по достигнутым этапам item'а):
       //   SHIPMENT → today + transitDays
       //   PRODUCTION / INSPECTION / нет этапов («Заказано») → today + defaultLeadTimeDays
       const stage = currentStageOf(pur.reachedStages)
       const floor = stage === "SHIPMENT"
         ? addDays(today, transitDays)
         : addDays(today, defaultLeadTimeDays)
       // max(createdAt+leadTime, floor) — берём позднейшую (строковое сравнение ISO валидно)
       const chosen = rawLeadtime > floor ? rawLeadtime : floor
       return applyLag(chosen, wbInboundLagDays)
     }
     ```
     ПРИМЕЧАНИЕ: TRANSIT/WAREHOUSE в floor-ветку не попадают на практике (TRANSIT обрабатывается уровнем 2 до leadtime; WAREHOUSE вычитается из qtyRemaining). Для TRANSIT/WAREHOUSE floor = today + defaultLeadTimeDays (безопасный fallback ветки else). Оставить именно `stage === "SHIPMENT"` спец-кейсом, всё остальное → defaultLeadTimeDays.
   - Обновить ОБА вызова `resolveLeadtimeDate`:
     - в ветке частичного TRANSIT (было `resolveLeadtimeDate(pur, defaultLeadTimeDays, wbInboundLagDays)`) → добавить `, today, transitDays`.
     - в уровне 3 (было то же) → добавить `, today, transitDays`.

2. **lib/sales-plan/data.ts** — прокинуть reachedStages и today:
   - В `type PurchaseInputForProduct` (~стр.274-282) добавить `reachedStages: string[]`.
   - В сборке `arr.push({...})` (~стр.300-308) добавить `reachedStages: item.stages.map((s) => s.stage)`. (Селект стр.251 уже тянет `stage` для всех достигнутых этапов — менять select НЕ нужно.)
   - В `arrivalInput` (~стр.424-440) добавить `today` (переменная `today` уже деструктурирована из params на стр.73-82). Добавить строку `today,` рядом с `wbInboundLagDays, transitDays, defaultLeadTimeDays`.

3. **tests/sales-plan-arrivals.test.ts** — обновить фикстуру + добавить кейсы:
   - В `makeInput` добавить дефолты: `today: "2026-07-05"` в возвращаемый объект. НЕ добавлять `reachedStages` в корень (это per-purchase поле) — но каждый `purchases[]` объект в существующих кейсах НЕ имеет reachedStages → TypeScript упадёт. Поэтому: в КАЖДОМ объекте `purchases[]` во всех существующих кейсах добавить `reachedStages: []` (пустой = «Заказано», floor = today+45). Проверить, что существующие leadtime-кейсы (pur-6 createdAt "2026-06-01"+45="2026-07-16") остаются зелёными: 2026-07-16 > floor(2026-07-05+45=2026-08-19)? НЕТ, 07-16 < 08-19 → floor победит → ожидание изменится. **ВАЖНО:** пересчитать существующие ожидания leadtime-кейсов под новый floor ИЛИ подобрать today так, чтобы floor не сработал. Решение: в затронутых leadtime-кейсах (pur-3, pur-4, pur-6) выставить `reachedStages` и/или ожидания под floor. Конкретно:
     - pur-6 (уровень 3, createdAt "2026-06-01", lt 45, reachedStages []): floor = today+45. Чтобы тест «createdAt+45» остался осмысленным — поставить в этом кейсе `today: "2026-05-01"` через overrides (тогда floor=2026-06-15 < 2026-07-16 → max=2026-07-16, ожидание сохраняется). Добавить `today: "2026-05-01"` в makeInput overrides этого кейса.
     - pur-3, pur-4 (переход на leadtime из-за transit qty=0/date=null): аналогично добавить `today: "2026-05-01"` в overrides, чтобы floor не перебивал dateSource-проверку (они проверяют только dateSource, не дату — floor dateSource не меняет, оставить как есть + reachedStages: []).
     - pur-7 (legacy, createdAt null) — floor не участвует (resolveLeadtimeDate возвращает null при createdAt==null ДО floor). reachedStages: [].
     - pur-8 (уровень 5) — reachedStages: [].
   - ДОБАВИТЬ новый describe-блок "floor по текущему этапу":
     * Кейс A: `reachedStages: ["PRODUCTION"]`, createdAt "2026-06-01", lt 45, today "2026-07-05", transitDays 20, defaultLeadTimeDays 45 → createdAt+45=2026-07-16, floor=today+45=2026-08-19 → ETA = "2026-08-19", dateSource "leadtime-eta".
     * Кейс B: `reachedStages: ["PRODUCTION","INSPECTION","SHIPMENT"]`, createdAt "2026-06-01", lt 45, today "2026-07-05", transitDays 20 → createdAt+45=2026-07-16, floor=today+transit=2026-07-25 → ETA = "2026-07-25" (SHIPMENT floor победил).
     * Кейс C (max сохраняет позднейшую): `reachedStages: ["PRODUCTION"]`, createdAt "2026-08-01", lt 45, today "2026-07-05" → createdAt+45=2026-09-15 > floor(2026-08-19) → ETA = "2026-09-15".
     * Кейс D (manual не floor-ится): `plannedArrivalDate: "2026-07-06"`, reachedStages: ["PRODUCTION"], today "2026-07-05" → ETA = "2026-07-06", dateSource "manual" (floor НЕ применён, хотя 07-06 < today+45).
   - Использовать точные `addDays`-арифметические ожидания (UTC): проверить вручную даты выше перед записью.
  </action>
  <verify>
    <automated>cd "c:/Users/serge/zoiten-pro" && npx vitest run tests/sales-plan-arrivals.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run tests/sales-plan-arrivals.test.ts` — ВСЕ кейсы зелёные (старые + 4 новых floor-кейса).
    - `grep -n "reachedStages" lib/sales-plan/arrivals.ts` — ≥2 совпадения (interface + currentStageOf).
    - `grep -n "reachedStages" lib/sales-plan/data.ts` — ≥2 совпадения (type + item.stages.map).
    - `grep -n "currentStageOf" lib/sales-plan/arrivals.ts` — ≥1 совпадение (импорт/вызов).
    - `grep -c "today" tests/sales-plan-arrivals.test.ts` — ≥1 (фикстура/кейсы, комментарии не учитывать глазом).
    - `grep -n "input.today\|today," lib/sales-plan/arrivals.ts` — today в деструктуризации/использовании.
  </acceptance_criteria>
  <done>ETA неотгруженных floor-ится по текущему этапу; manual не floor-ится; max сохраняет позднейшую; TRANSIT-кейсы не тронуты; все arrivals-тесты зелёные.</done>
</task>

<task type="auto">
  <name>Задача 2 (D-3 + D-4): факт по реализации per-товар + pro-rata план версии в page.tsx</name>
  <read_first>
    app/(dashboard)/sales-plan/products/page.tsx (весь — стр.121-133 версии, стр.152 loadFactDaily,
    стр.213-259 сериализация factByProduct + tableProducts),
    lib/sales-plan/data.ts (стр.484-505 FactDailyResult, стр.633-646 redemptionByProduct),
    prisma/schema.prisma (model SalesPlanVersionDay стр.2002-2020).
  </read_first>
  <action>
1. **D-3 — факт per-товар по реализации.** В page.tsx блок сериализации `factByProduct` (~стр.213-229):
   - Заменить источник итерации `factData.byProduct.entries()` → `factData.redemptionByProduct.entries()`.
   - Структура сериализации не меняется (тот же `Record<productId, Record<date, {buyoutsRub, ordersRub, buyoutsUnits, ordersUnits}>>`; redemption-строки имеют ordersRub=0/ordersUnits=0, это ОК — таблица использует только buyoutsRub/buyoutsUnits).
   - `factData.byProduct` (funnel) НЕ удалять из loadFactDaily — просто не использовать здесь (может пригодиться Сводному). Комментарий над блоком обновить: «Факт per-товар — по дате реализации (redemptionByProduct, НЕТТО), не когортный funnel».

2. **D-4 — pro-rata план активной версии для прошедших дней.** В page.tsx добавить агрегацию версии по (productId, месяц) для дней ≤ today−1:
   - `activeVersionId` уже вычислен (~стр.121-124). Добавить: если `activeVersionId != null`, одним запросом собрать плановые выкупы прошедших дней:
     ```typescript
     // versionPastPlanByProduct[productId][monthIso] = Σ planBuyoutsRub по дням ≤ today−1
     const versionPastPlanByProduct: Record<string, Record<string, number>> = {}
     if (activeVersionId) {
       const yesterday = new Date(new Date(today + "T00:00:00Z").getTime() - 86_400_000)
         .toISOString().slice(0, 10)
       const rows = await prisma.salesPlanVersionDay.findMany({
         where: {
           versionId: activeVersionId,
           date: { gte: new Date(HORIZON_FROM + "T00:00:00Z"), lte: new Date(yesterday + "T00:00:00Z") },
         },
         select: { productId: true, date: true, planBuyoutsRub: true },
       })
       for (const r of rows) {
         const monthIso = r.date.toISOString().slice(0, 7) + "-01"
         const pid = r.productId
         if (!versionPastPlanByProduct[pid]) versionPastPlanByProduct[pid] = {}
         versionPastPlanByProduct[pid][monthIso] =
           (versionPastPlanByProduct[pid][monthIso] ?? 0) + r.planBuyoutsRub
       }
     }
     ```
   - В `tableProducts.map` (~стр.232-259) добавить в объект строки поле:
     `versionPastPlanRub: versionPastPlanByProduct[p.productId] ?? {},`
   - Пробросить проп в `<ProductPlanTable>` (~стр.314-322): добавить атрибут `versionPastPlanByProduct` не нужен — данные уже в tableProducts. НО т.к. типа versionPastPlanRub нет в ProductRow — добавляется в Задаче 3 (интерфейс) вместе с потреблением. Если TS ругается до Задачи 3 — это ожидаемо; обе задачи финализируются вместе перед GATE. Для изоляции: добавить поле в tableProducts здесь, потребление и тип — в Задаче 3.
   - **План-число текущего месяца** остаётся из движка (`planResult.monthTotals`) — page.tsx НЕ меняет план-число ячейки (D-4 меняет только БАЗУ для pct = план прошедших дней из версии). Формула плана ячейки (версия прошедшие + движок остаток) реализуется В ТАБЛИЦЕ (Задача 3), page отдаёт versionPastPlanRub как отдельную базу для pct и не трогает planResult.
   - Fallback: если `activeVersionId == null` → `versionPastPlanByProduct` пустой → в таблице pct скрыт (Задача 3).
  </action>
  <verify>
    <automated>cd "c:/Users/serge/zoiten-pro" && npx tsc --noEmit 2>&1 | grep -v "ProductPlanTable\|versionPastPlanRub" | grep "products/page.tsx" || echo "page.tsx clean (pending ProductRow field in Task 3)"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "redemptionByProduct" "app/(dashboard)/sales-plan/products/page.tsx"` — ≥1 совпадение (источник factByProduct).
    - `grep -c "factData.byProduct" "app/(dashboard)/sales-plan/products/page.tsx"` = 0 (funnel больше не источник ячеек товаров).
    - `grep -n "versionPastPlanRub\|versionPastPlanByProduct" "app/(dashboard)/sales-plan/products/page.tsx"` — ≥2 совпадения.
    - `grep -n "salesPlanVersionDay.findMany" "app/(dashboard)/sales-plan/products/page.tsx"` — ровно 1 запрос версии.
    - `grep -n "planBuyoutsRub" "app/(dashboard)/sales-plan/products/page.tsx"` — ≥1 (поле выбрано в select).
  </acceptance_criteria>
  <done>factByProduct питается из redemptionByProduct (НЕТТО по реализации); одна агрегация SalesPlanVersionDay по (productId, месяц) для дней ≤ today−1 проброшена в tableProducts как versionPastPlanRub; funnel byProduct не удалён из data.ts.</done>
</task>

<task type="auto">
  <name>Задача 3 (D-4 + D-5): формат ячеек, pro-rata pct, легенда, тыс ₽ футер в ProductPlanTable</name>
  <read_first>
    components/sales-plan/ProductPlanTable.tsx (весь — форматтеры стр.18-41, ProductRow стр.53-70,
    getMonthFact стр.110-127, ячейка просмотра стр.640-707, футер стр.718-753, тулбар стр.339-414).
  </read_first>
  <action>
1. **Формат чисел — тыс ₽.** Добавить хелпер рядом с `fmtRub` (стр.29-37):
   ```typescript
   /** Число в тыс ₽ с разделителями, без буквы: 407123 → "407", 762456 → "762". Округление до целых тыс. */
   function fmtThousands(n: number): string {
     return fmtNum(Math.round(n / 1000), 0)
   }
   ```
   `fmtRub` НЕ удалять (может использоваться в модалке через импорт — оставить). Заменять её вызовы в этом файле на `fmtThousands` точечно (см. ниже).

2. **Интерфейс ProductRow** (стр.53-70): добавить поле
   `versionPastPlanRub: Record<string, number>` (month → Σ planBuyoutsRub версии за прошедшие дни; `{}` если нет активной версии).

3. **Ячейка просмотра** (стр.640-707) — переписать содержимое `<div className="flex flex-col items-end gap-0.5">`:
   - Убрать буквы «П»/«Ф», убрать `≈ N шт` строку-заменитель (штуки теперь во ВСЕХ месяцах в строке плана).
   - **Строка 1 (план):** `{fmtThousands(planRub)} · {fmtAdaptive(planUnits)} шт` (тыс ₽ · шт). Маркер `•д` (hasDayOverrides) оставить в конце строки 1.
     `planUnits` уже вычислен (`mt?.buyoutsUnits ?? 0`, стр.611).
   - **Строка 2 (факт):** показывать ТОЛЬКО если `hasFactData && factRow` — `{fmtThousands(factRow.buyoutsRub)} · {fmtAdaptive(factRow.buyoutsUnits)} шт`, класс `text-xs text-muted-foreground tabular-nums`.
   - **Строка 3 (pct):** pro-rata база. Заменить текущий `pct` (стр.616-618) на:
     ```typescript
     // База pct = план ПРОШЕДШИХ дней из активной версии (D-4). Нет версии/база 0 → скрыт.
     const versionBase = p.versionPastPlanRub[month] ?? 0
     const pct = versionBase > 0 && factRow ? factRow.buyoutsRub / versionBase - 1 : null
     ```
     Рендер строки pct — как сейчас (цветовая семантика ≥0 emerald / ≥−0.05 amber / else destructive; формат `+87%`). Использовать `{pct >= 0 ? "+" : ""}{Math.round(pct * 100)}%` (целые проценты; либо оставить fmtPct — но пользователь просит `+87%` целым: заменить на `Math.round(pct*100)`).
   - Бейджи `isEmptyMonth` (⚠ нет товара) и `isCutMonth` (срезано −N%) — ОСТАВИТЬ без изменений (стр.695-704).
   - Строку 1 план — оставить видимой всегда (в т.ч. будущие месяцы: план `407 · 61 шт`). Убрать условие `!hasFactData` для строки штук — штуки теперь в строке 1.

4. **Заголовок «Итог ₽» → «Итог, тыс ₽».** th ~стр.469: `Итог ₽` → `Итог, тыс ₽`. Ячейка итога строки (стр.711-713): `{fmtRub(totalRub)}` → `{fmtThousands(totalRub)}`.

5. **Футер «Итого» — тыс ₽ с разделителями.** Блок стр.732-751:
   - План месяца: `{fmtRub(t.planRub)}` → `{fmtThousands(t.planRub)}`.
   - Факт месяца: `Ф {fmtRub(t.factRub)}` → `{fmtThousands(t.factRub)}` (убрать букву «Ф», оставить muted). Условие `t.factRub > 0` оставить.
   - Итог всего: `{fmtRub(totals.totalPlanRub)}` → `{fmtThousands(totals.totalPlanRub)}`.

6. **Легенда сверху справа (тулбар).** В тулбаре (стр.339, `<div className="flex items-center gap-2 py-2 ...">`) добавить в конце (после блока Масштабировать/Сбросить, внутри тулбар-div или отдельным span с `ml-auto` если места нет) текст:
   ```tsx
   <span className="text-xs text-muted-foreground ml-auto self-center">
     Ячейка: план / факт · тыс ₽ · шт
   </span>
   ```
   Если `ml-auto` уже занят блоком Масштабировать — вынести легенду в отдельную строку над таблицей ИЛИ поставить в правый край того же ряда с `ml-2`. Простейше: добавить как первый или последний child тулбара с классом `text-xs text-muted-foreground ml-auto self-center whitespace-nowrap`. Проверить, что не ломает flex-wrap.

7. **Edit-режим** (`ProductPlanCell`, стр.648-663) — НЕ переписывать полностью. Единственная правка: если внутри ProductPlanCell есть подстрочник ₽ через `fmtRub`, заменить на тыс. Прочитать components/sales-plan/ProductPlanCell.tsx: если использует `fmtRub`/₽-подстрочник — заменить формат на тыс ₽ (аналогично fmtThousands). Если ProductPlanCell не показывает ₽ — правка не нужна, отметить в комментарии.

8. **page.tsx проп** (уже частично в Задаче 2): убедиться, что `versionPastPlanRub` присутствует в объекте tableProducts (добавлено Задачей 2). Здесь — только потребление в ProductRow. Проп `<ProductPlanTable>` не требует нового атрибута (данные внутри products[]).
  </action>
  <verify>
    <automated>cd "c:/Users/serge/zoiten-pro" && npx tsc --noEmit && npm run build 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `npx tsc --noEmit` — 0 ошибок.
    - `npm run build` — успешный (без ошибок компиляции).
    - `grep -n "fmtThousands" components/sales-plan/ProductPlanTable.tsx` — ≥5 совпадений (хелпер + план ячейки + факт ячейки + итог строки + футер×3).
    - `grep -n "тыс ₽" components/sales-plan/ProductPlanTable.tsx` — ≥2 (заголовок «Итог, тыс ₽» + легенда).
    - `grep -n "versionPastPlanRub" components/sales-plan/ProductPlanTable.tsx` — ≥2 (интерфейс + вычисление pct-базы).
    - `grep -c '"П \|П {fmt\|Ф {fmt\|Ф "' components/sales-plan/ProductPlanTable.tsx` — 0 (буквы П/Ф удалены из ячейки и футера).
    - `grep -n "план / факт · тыс ₽ · шт" components/sales-plan/ProductPlanTable.tsx` — 1 (легенда).
  </acceptance_criteria>
  <done>Ячейка показывает числа `407 · 61 шт` / `762 · 113 шт` / `+87%` без букв П/Ф/К/М; штуки во всех месяцах; pct база = план версии прошедших дней (скрыт без версии); «Итог, тыс ₽» + футер в тыс ₽ с разделителями; легенда сверху справа; edit-подстрочник в тыс ₽; бейджи среза/нет товара сохранены.</done>
</task>

</tasks>

<verification>
GATE (обязательно перед завершением):
1. `npx tsc --noEmit` — 0 ошибок.
2. `npm run build` — успешно.
3. `npx vitest run tests/sales-plan-arrivals.test.ts tests/sales-plan-engine.test.ts tests/sales-plan-iu.test.ts tests/sales-plan-virtual.test.ts` — ВСЕ GREEN.
   - Golden iu=438068120 (в sales-plan-iu.test.ts) не изменился.
   - engine.test / virtual.test — не тронуты движок/suggester, зелёные.
</verification>

<success_criteria>
- ETA неотгруженной закупки floor-ится по текущему этапу (SHIPMENT → today+transit; иначе → today+defaultLeadTime); plannedArrivalDate игнорирует floor; max сохраняет позднейшую дату.
- Факт per-товар в «Товарах» — из redemptionByProduct (НЕТТО по дате реализации). Прод-ожидание: УКТ-000001 июль ≈ 762 тыс ₽ (проверяется визуально при UAT, не в тестах).
- Отклонение % = факт_прошедших / план_версии_прошедших − 1; скрыто без активной версии или при базе 0.
- Формат ячеек: план / факт · тыс ₽ · шт, без букв П/Ф/К/М; штуки во всех месяцах; легенда сверху справа; футер и «Итог, тыс ₽» — тыс ₽ с разделителями.
- Не тронуты: engine.ts, virtual-purchases.ts, схема БД, модалка «Дни», RBAC.
- GATE зелёный.
</success_criteria>

<post_deploy>
D-2 (шаг оркестратора, НЕ код): после деплоя выставить на проде AppSetting `salesPlan.transitDays` = 40 (было 20). Через UI ModelParamsBar или SQL:
`UPDATE "AppSetting" SET value = '40' WHERE key = 'salesPlan.transitDays';`
Отметить выполнение в SUMMARY.
</post_deploy>

<output>
После завершения создать `.planning/quick/260705-seb-arrivals-stage-eta-cells/260705-seb-SUMMARY.md`.
В SUMMARY явно указать post-deploy шаг D-2 (transitDays 20→40 на проде) как незавершённый до деплоя.
</output>
