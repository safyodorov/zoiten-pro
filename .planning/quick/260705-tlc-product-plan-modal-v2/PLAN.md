---
phase: quick-260705-tlc
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: [TLC-01]
files_modified:
  - app/actions/sales-plan.ts
  - components/sales-plan/ProductPlanDialog.tsx
  - components/sales-plan/ProductPlanTable.tsx

must_haves:
  truths:
    - "Клик по строке товара в /sales-plan/products открывает большую модалку (95vw / xl:max-w-7xl) без табов, одной прокруткой"
    - "В модалке виден график всего горизонта H2 (01.07–31.12) по дням: bar план шт/день, bar факт шт/день (прошедшие дни), line Сток(расч) на правой оси"
    - "На графике: ReferenceLine «сегодня» (пунктир) + вертикальные линии на даты приходов (реальные сплошные, виртуальные пунктир) с label qty"
    - "Сетка помесячных уровней (6 месяцев) с input заказов/день и цена ₽; любое изменение realtime пересчитывает график и мини-итоги через computeSalesPlan на клиенте"
    - "Кнопка «Сохранить» шлёт изменённые месяцы в saveMonthLevels с корректной null-семантикой сброса уровня, затем toast + router.refresh + закрытие"
    - "Секция «Приходы партий» показывает компактный список приходов + строку стокаута с потерянными шт/₽ если есть"
    - "Секция «Правка по дням» — <details>, содержит перенесённую таблицу дней (native select месяца + инпуты + Сток(расч) + Сохранить через saveDayOverrides)"
    - "В read-only режиме инпуты disabled, кнопки Сохранить скрыты; тёмная тема читается (токены + dark-пары)"
  artifacts:
    - path: "app/actions/sales-plan.ts"
      provides: "getProductPlanHorizon(productId) — весь горизонт days + сериализуемый productInput + factUnitsDaily"
      contains: "export async function getProductPlanHorizon"
    - path: "components/sales-plan/ProductPlanDialog.tsx"
      provides: "Полностью переписанная модалка товара: header + главный график + уровни по месяцам + приходы + details Правка по дням"
      contains: "getProductPlanHorizon"
    - path: "components/sales-plan/ProductPlanTable.tsx"
      provides: "Проброс abcStatus в ProductPlanDialog (точка входа openDialog не меняется)"
  key_links:
    - from: "components/sales-plan/ProductPlanDialog.tsx"
      to: "getProductPlanHorizon"
      via: "useEffect/loadHorizon при открытии диалога"
      pattern: "getProductPlanHorizon\\("
    - from: "components/sales-plan/ProductPlanDialog.tsx"
      to: "computeSalesPlan"
      via: "realtime пересчёт merged ProductPlanInput при правке уровней/дней"
      pattern: "computeSalesPlan\\("
    - from: "app/actions/sales-plan.ts (getProductPlanHorizon)"
      to: "prisma.wbCardOrdersDaily"
      via: "factUnitsDaily по nmIds товара"
      pattern: "wbCardOrdersDaily\\.findMany"
---

<objective>
Полная переделка модалки товара в разделе «План продаж → Товары» (`/sales-plan/products`).
Текущий `ProductPlanDialog` (3 таба: Дни / Параметры / График, помесячно) заменяется одной
большой наглядной модалкой без табов: главный график всего горизонта H2 (план шт + факт шт +
сток), сетка помесячных уровней с realtime-пересчётом, список приходов со стокаутом и
свёрнутая секция «Правка по дням» (перенос текущей таблицы дней).

Purpose: дать пользователю единый экран для планирования товара — видеть весь H2 сразу,
править уровни по месяцам с мгновенным откликом графика, видеть факт vs план и риск стокаута.
Output:
  - Task 1: новый read-action `getProductPlanHorizon(productId)` (весь горизонт + факт по дням).
  - Task 2: переписанный `ProductPlanDialog` + проброс `abcStatus` из `ProductPlanTable`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md

<read_first>
ПРОЧИТАЙ эти файлы целиком/по указанным диапазонам ПЕРЕД правками — не догадывайся:

1. app/actions/sales-plan.ts — образец getProductPlanDays (строки 593–748): сборка модели из
   AppSetting → loadSalesPlanInputs → computeSalesPlan → фильтр по месяцу. RBAC requireSection("SALES").
   Хелперы getLeadTimeDays / getSettingNumber / чтение salesPlan.horizon. Схема saveMonthLevels
   (строки 107–226) и null-семантика (все три поля null → deleteMany уровня).
2. components/sales-plan/ProductPlanDialog.tsx — ТЕКУЩАЯ модалка (полная замена). Секция «Дни»
   (строки 252–364): таблица дней + realtime getMergedDays() + handleSaveDays через saveDayOverrides —
   переносится в <details>. ParamsTab (строки 424–523): показывает как priceRub уровня выводится
   из productInput.monthLevels + avgPriceRub placeholder + buyoutPct/buyoutSource. Форматтеры
   fmtNum/fmtRub/formatDateFull/formatDateShort (строки 28–46) — переиспользовать.
3. components/sales-plan/ProductPlanTable.tsx — interface ProductRow (70–89), props диалога
   (93–100), точка входа openDialog (351) и рендер <ProductPlanDialog> (797–813). ProductRow имеет
   abcStatus/baselineOrdersPerDay/avgPriceRub/stockNow, НО НЕ buyoutPct (он приходит из action).
4. lib/sales-plan/types.ts — ProductPlanInput (45–76: monthLevels, dayOverrides, arrivals, stockNow,
   baselineOrdersPerDay, buyoutPct 0..1, buyoutSource, avgPriceRub, abcStatus), PlanDayRow (92–100:
   ordersUnits, buyoutsRub, stockEnd), ArrivalBatch (25–31: source "purchase"|"virtual"|"incoming-legacy",
   date, qty, refId, dateSource), ProductPlanResult (102–114: firstStockoutDate, lostUnitsToStockout,
   lostRubToStockout, monthTotals).
5. components/sales-plan/PlanFactChart.tsx — образец recharts ComposedChart: XAxis/YAxis
   tick fill "var(--muted-foreground)" fontSize 11, CustomTooltip, Legend, ReferenceLine «сегодня»
   (строки 184–197). Токены var(--chart-1)/var(--chart-2)/var(--chart-iu).
6. components/sales-plan/IncomingBadges.tsx — семантика источников: purchase/incoming-legacy = реальный
   (📦 blue), virtual = виртуальный (◇ violet=ACCEPTED / amber=SUGGESTED). Форматирование даты
   formatDateShort. (В новой модалке приходы — простой список, статусы виртуальных различать НЕ нужно,
   достаточно source; но текст «виртуальная»/«предложение» приветствуется если статус доступен.)
7. lib/sales-plan/data.ts — nmIds товара (строки 84–127): marketplace slug="wb" → articles where
   marketplaceId → parseInt(article) → nmIds. Скопировать этот join в action (data.ts НЕ трогать).
8. prisma/schema.prisma — WbCardOrdersDaily (1079–1100): nmId Int, date DateTime @db.Date,
   qty Int (кол-во ЗАКАЗОВ). WbSalesDaily (1142–1155): buyoutsCount Int, returnsCount Int (fallback).
   WbCardFunnelDaily (1111–1133): ordersCount Int (альтернатива, business orders).
9. app/globals.css — chart-токены (строки 96–140): --chart-1 grey-cyan (факт bars),
   --chart-2 orange (план), --chart-iu violet (сток/ИУ line), у всех есть dark-пара.
</read_first>

<interfaces>
<!-- Контракты, которые исполнитель использует напрямую — без блужданий по коду. -->

Из lib/sales-plan/types.ts:
```typescript
export interface PlanDayRow {
  date: string          // "2026-07-15"
  ordersUnits: number   // план заказов, шт/день  ← Bar «план»
  buyoutsUnits: number
  buyoutsRub: number
  ordersRub: number
  stockEnd: number      // Сток(расч) на конец дня  ← Line «Сток»
  rateRequested: number
}

export interface ArrivalBatch {
  date: string
  qty: number
  source: "purchase" | "virtual" | "incoming-legacy"
  refId: string
  dateSource: "manual" | "transit-eta" | "leadtime-eta" | "legacy-expected"
}

export interface ProductPlanInput {
  productId: string; sku: string; name: string
  nmIds: number[]
  stockNow: number
  baselineOrdersPerDay: number
  buyoutPct: number            // 0..1
  buyoutSource: "own" | "legacy" | "subcategory" | "global"
  avgPriceRub: number
  monthLevels: Array<{ month: string; targetOrdersPerDay: number | null; priceRub: number | null; buyoutPct: number | null }>
  dayOverrides: Record<string, number>   // "2026-07-15" → 20
  arrivals: ArrivalBatch[]
  seedOrders: Record<string, number>
  abcStatus?: "A" | "B" | "C" | null
  orderEnabled?: boolean
  // + иерархия brandId/categoryId/... и nmIds (сериализуемо)
}

export interface ProductPlanResult {
  productId: string
  days: PlanDayRow[]
  monthTotals: Array<{ month: string; ordersUnits: number; buyoutsUnits: number; buyoutsRub: number }>
  firstStockoutDate: string | null
  lostUnitsToStockout: number
  lostRubToStockout: number
}
```

Существующая сигнатура (образец, переиспользовать механику) — app/actions/sales-plan.ts:
```typescript
export async function getProductPlanDays(
  productId: string, month: string, versionId?: string,
): Promise<{ ok: true; days: PlanDayRow[]; productInput: ProductPlanInput } | { ok: false; error: string }>
// внутри: getLeadTimeDays("deliveryDays",3), getLeadTimeDays("returnDays",3),
//   getSettingNumber("salesPlan.wbInboundLagDays",0/…), чтение AppSetting "salesPlan.horizon",
//   loadSalesPlanInputs(prisma, {...}) → find product → computeSalesPlan({...inputs, products:[productInput]})
```

Существующие write-actions (сигнатуры НЕ менять):
```typescript
saveMonthLevels(payload: Array<{ productId; month; targetOrdersPerDay: number|null; priceRub: number|null; buyoutPct: number|null }>, opts?): Promise<ActionResult>
saveDayOverrides(payload: { productId; overrides: Record<string, number|null> }): Promise<ActionResult>
```
</interfaces>

@app/actions/sales-plan.ts
@components/sales-plan/ProductPlanDialog.tsx
@components/sales-plan/ProductPlanTable.tsx
@lib/sales-plan/types.ts
@components/sales-plan/PlanFactChart.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: getProductPlanHorizon — server action (весь горизонт + факт по дням)</name>
  <files>app/actions/sales-plan.ts</files>
  <action>
Добавь новый read-action `getProductPlanHorizon` В app/actions/sales-plan.ts, СРАЗУ ПОСЛЕ
существующего `getProductPlanDays` (после его закрывающей `}` ~строка 748). Не удаляй и не меняй
`getProductPlanDays` — он остаётся (используется в перенесённой секции «Правка по дням»).

Сигнатура и семантика (переиспользуй механику getProductPlanDays, НО без фильтра по месяцу):

```typescript
export async function getProductPlanHorizon(
  productId: string,
): Promise<
  | { ok: true; productInput: ProductPlanInput; days: PlanDayRow[]; factUnitsDaily: Array<{ date: string; units: number }> }
  | { ok: false; error: string }
> {
  await requireSection("SALES")  // read-only, как getProductPlanDays

  // 1. Параметры модели из AppSetting — ТОЧНО как в getProductPlanDays (строки 689–727):
  //    getLeadTimeDays("deliveryDays",3), getLeadTimeDays("returnDays",3),
  //    getSettingNumber("salesPlan.wbInboundLagDays",0), ("salesPlan.transitDays",20),
  //    ("salesPlan.defaultLeadTimeDays",45), ("salesPlan.safetyStockDays",14),
  //    ("salesPlan.vpCoverDays",60). todayMsk через (Date.now()+3ч).toISOString().slice(0,10).
  //    horizonFrom/horizonTo из AppSetting "salesPlan.horizon" (JSON {from,to}), дефолт
  //    horizonFrom=todayMsk, horizonTo=<год>-12-31 — как в getProductPlanDays.

  // 2. loadSalesPlanInputs(prisma, {...}) → productInput = inputs.products.find(p=>p.productId===productId).
  //    Если !productInput → return { ok:false, error:"Товар не найден в плане продаж" }.

  // 3. computeSalesPlan({ ...inputs, products:[productInput] }) → productResult.
  //    days = productResult.days  // ВЕСЬ горизонт, БЕЗ фильтра .filter(startsWith(monthPrefix)).

  // 4. factUnitsDaily — факт заказов по дням из WbCardOrdersDaily:
  //    nmIds = productInput.nmIds  (уже собраны loadSalesPlanInputs; можно взять напрямую).
  //      Если productInput.nmIds пуст — верни factUnitsDaily: [].
  //    factFrom = new Date(horizonFrom + "T00:00:00Z")
  //    factTo   = new Date(todayMsk + "T00:00:00Z")   // включительно по today
  //    const orderRows = await prisma.wbCardOrdersDaily.findMany({
  //      where: { nmId: { in: nmIds }, date: { gte: factFrom, lte: factTo } },
  //      select: { date: true, qty: true },
  //    })
  //    Суммируй qty по date (ISO slice(0,10)) в Map<string, number> → factUnitsDaily массив
  //    { date, units }, отсортированный по date asc.
  //    FALLBACK: если orderRows.length === 0 — попробуй WbSalesDaily (нетто выкупов):
  //      const salesRows = await prisma.wbSalesDaily.findMany({
  //        where: { nmId: { in: nmIds }, date: { gte: factFrom, lte: factTo } },
  //        select: { date: true, buyoutsCount: true, returnsCount: true },
  //      })
  //      units = Math.max(0, buyoutsCount - returnsCount) агрегируй по date.
  //    (WbCardOrdersDaily.qty — заказы, основной ряд факта; WbSalesDaily нетто — резерв.)

  // 5. return { ok:true, productInput, days, factUnitsDaily }.
  // try/catch: console.error("[getProductPlanHorizon]", err); return { ok:false, error:"Не удалось загрузить данные плана" }.
}
```

ВАЖНО:
- Импорты ProductPlanInput/PlanDayRow уже есть в файле (строка 22). Ничего нового импортировать не нужно.
- НЕ трогай lib/sales-plan/data.ts. nmIds бери из productInput.nmIds (loadSalesPlanInputs их
  уже кладёт). НЕ переизобретай marketplace/articles join — он внутри loadSalesPlanInputs.
- Даты в Prisma where — объекты Date (модель @db.Date), сравнение gte/lte по UTC-полуночи.
- Точное имя модели: prisma.wbCardOrdersDaily (camelCase от WbCardOrdersDaily), поля nmId/date/qty.
  Fallback: prisma.wbSalesDaily, поля buyoutsCount/returnsCount.
  </action>
  <verify>
    <automated>cd /c/Users/serge/zoiten-pro && npx tsc --noEmit 2>&1 | grep -v '^#' | grep -c "sales-plan.ts" | grep -q '^0$' && echo TSC_OK</automated>
  </verify>
  <acceptance_criteria>
- `getProductPlanHorizon` экспортирована из app/actions/sales-plan.ts, требует requireSection("SALES").
- Возвращает { ok:true, productInput, days (весь горизонт, без фильтра месяца), factUnitsDaily } либо { ok:false, error }.
- factUnitsDaily собран из WbCardOrdersDaily.qty (fallback WbSalesDaily нетто) по nmIds товара, диапазон horizonFrom…todayMsk, агрегация по date, sort asc.
- `getProductPlanDays` не изменён и по-прежнему экспортируется.
- `npx tsc --noEmit` не даёт новых ошибок в sales-plan.ts.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Переписать ProductPlanDialog — большая модалка (график горизонта + уровни + приходы + Правка по дням) + проброс abcStatus</name>
  <files>components/sales-plan/ProductPlanDialog.tsx, components/sales-plan/ProductPlanTable.tsx</files>
  <action>
Полностью перепиши `components/sales-plan/ProductPlanDialog.tsx`. Убери табы (Tab тип, activeTab,
кнопки табов) и весь ParamsTab. Сохрани форматтеры (fmtNum/fmtRub/formatDateFull/formatDateShort),
props-интерфейс ProductPlanDialogProps (добавь один опциональный проп `abcStatus?: "A"|"B"|"C"|null`).

DialogContent className="max-w-[95vw] xl:max-w-7xl max-h-[92vh] overflow-y-auto".

Данные при открытии: в handleOpenChange (nextOpen===true) вызови новый loadHorizon():
```
const r = await getProductPlanHorizon(productId)
if (r.ok) { setProductInput(r.productInput); setDaysAll(r.days); setFactUnits(r.factUnitsDaily) }
else setLoadError(r.error)
```
Состояния: productInput (ProductPlanInput|null), daysAll (PlanDayRow[]), factUnits
(Array<{date;units}>), loading, loadError. Плюс драфты уровней:
`levelDrafts: Record<string, { orders: string; price: string }>` (ключ = month ISO).

── 1. HEADER ────────────────────────────────────────────────────────────
DialogTitle: <span font-mono text-sm text-muted-foreground>{productSku}</span> + <span truncate>{productName}</span>.
Под заголовком мета-строка (text-xs text-muted-foreground, flex gap-3 flex-wrap):
  - ABC-бейдж — ТОЛЬКО если abcStatus передан (проп) не null: маленький бейдж «ABC: A/B/C». Иначе опустить.
  - «Сток: {productInput.stockNow}»
  - «Скорость: {productInput.baselineOrdersPerDay.toFixed(1)} зак/день (baseline)»
  - «% выкупа: {(productInput.buyoutPct*100).toFixed(1)}% ({productInput.buyoutSource})»
Показывать мету только когда productInput загружен.

── 2. ГЛАВНЫЙ ГРАФИК (ComposedChart, height ~340) ────────────────────────
realtime merged расчёт (мемоизируй useMemo по [productInput, daysAll, levelDrafts, today]):
  Собери mergedInput: ProductPlanInput = productInput, но с monthLevels пересобранными из драфтов:
    для каждого month в горизонте бери существующий level (productInput.monthLevels.find(month))
    и накладывай драфт levelDrafts[month]:
      orders: drafts.orders.trim()==="" ? (level?.targetOrdersPerDay ?? null) : parseNum(drafts.orders)
      price:  drafts.price.trim()==="" ? (level?.priceRub ?? null) : parseNum(drafts.price)
      buyoutPct: level?.buyoutPct ?? null  (НЕ трогаем)
    Собери итоговый monthLevels[] только из month'ов, где есть хоть level, хоть драфт (иначе не добавляй —
    fallback на baseline внутри движка). parseNum = parseFloat(txt.replace(",","."))  (NaN → null).
  dayOverrides — из productInput.dayOverrides + dayDrafts (правки в details, см. секцию 5): та же
    merge-логика что в текущем getMergedDays (строки 131–177): draft "" → delete, число≥0 → set.
  Запусти computeSalesPlan({ today, horizonFrom: daysAll[0].date, horizonTo: daysAll.at(-1).date,
    deliveryDays:3, returnDays:3, wbInboundLagDays:0, products:[mergedInput] }) → mergedResult.
    (те же deliveryDays/returnDays/wbInboundLag что в текущем диалоге, строки 156–164.)
  displayDays = mergedResult.products[0].days ?? daysAll. mergedProductResult = mergedResult.products[0].
  В catch — fallback на daysAll и productInput?.… как есть.

chartData: массив по displayDays — { date: d.date (ISO для оси/референсов), label: formatDateShort(d.date),
  plan: Math.round(d.ordersUnits), stock: Math.round(d.stockEnd) }.
factByDate: Map из factUnits (date→units). Добавь в каждую точку fact: factByDate.get(d.date) ?? 0
  ТОЛЬКО для d.date <= today (прошедшие/сегодня); для будущих fact = null (чтобы не рисовать 0-бар в будущем).

Диаграмма (см. образец PlanFactChart):
  <ResponsiveContainer width="100%" height={340}><ComposedChart data={chartData} margin={{top:16,right:16,left:8,bottom:8}}>
    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
    <XAxis dataKey="label" tick={{fontSize:11, fill:"var(--muted-foreground)"}}
       interval={Math.max(0, Math.floor(chartData.length/14))} minTickGap={16} />
    <YAxis yAxisId="units" tick={{fontSize:11, fill:"var(--muted-foreground)"}} />
    <YAxis yAxisId="stock" orientation="right" tick={{fontSize:11, fill:"var(--muted-foreground)"}} />
    <Tooltip content={<CustomTooltip/>} />   // кастомный: дата (label) + план шт + факт шт + сток
    <Legend iconSize={10} wrapperStyle={{fontSize:11, paddingTop:4}} />
    <Bar yAxisId="units" dataKey="plan" name="План, шт/день" fill="var(--chart-2)" opacity={0.75} />
    <Bar yAxisId="units" dataKey="fact" name="Факт, шт/день" fill="var(--chart-1)" />
    <Line yAxisId="stock" dataKey="stock" name="Сток (расч)" type="monotone"
       stroke="var(--chart-iu)" strokeWidth={1.5} dot={false} />
    // ReferenceLine «сегодня»: найти точку с date===today → x={её label}, stroke var(--muted-foreground) dashed, label "сегодня".
    // Приходы: productInput.arrivals — для каждого arrival найти label по arrival.date среди chartData;
    //   ReferenceLine yAxisId="units" x={label}
    //     stroke = arrival.source==="virtual" ? "var(--chart-iu)" : "var(--chart-2)"
    //     strokeDasharray = arrival.source==="virtual" ? "4 4" : undefined  (реальный сплошной, виртуальный пунктир)
    //     label = arrivals.length > 6 ? `×${arrival.qty}` : `↓${arrival.qty}`  (при >6 — только qty, без стрелки/текста)
    //     fontSize 9, fill var(--muted-foreground), position "top".
  </ComposedChart></ResponsiveContainer>
CustomTooltip: скопируй паттерн из PlanFactChart (строки 61–80), поля — «План шт» / «Факт шт» / «Сток».

── 3. СЕКЦИЯ «Уровни продаж по месяцам» ──────────────────────────────────
Заголовок h3 text-sm font-medium. Сетка: grid grid-cols-3 xl:grid-cols-6 gap-3.
months передаются пропом (тот же массив что в таблице). Для каждого month:
  const level = productInput?.monthLevels.find(l => l.month === month)
  const draft = levelDrafts[month]
  <div space-y-1> с label монтя (используй MONTH_LABEL, как в текущем файле строки 210–214):
    input заказов/день:
      value = draft?.orders ?? (level?.targetOrdersPerDay != null ? String(round(level.targetOrdersPerDay,1)) : "")
      placeholder = `авто ${(productInput?.baselineOrdersPerDay ?? 0).toFixed(1)}`
      onChange → setLevelDrafts(prev => ({...prev,[month]:{orders:e.target.value, price: prev[month]?.price ?? ""}}))
      disabled={readOnly}, className h-8 w-full rounded-md border bg-background px-2 text-sm tabular-nums disabled:opacity-50
    input цена ₽:
      value = draft?.price ?? (level?.priceRub != null ? String(Math.round(level.priceRub)) : "")
      placeholder = `≈${Math.round(productInput?.avgPriceRub ?? 0)}`
      onChange → setLevelDrafts обновляя price (сохраняя orders).
Под сеткой — строка итогов (text-sm): «План H2: {fmtRub(Σ mergedProductResult.monthTotals.buyoutsRub)} · {Σ ordersUnits округл} шт».
  (Σ по mergedProductResult.monthTotals — берётся из realtime merged расчёта.)
Кнопки (flex justify-end gap-2): «Сохранить» (скрыта при readOnly) + «Закрыть».
  «Сохранить» → handleSaveLevels():
    payload: собери только ИЗМЕНЁННЫЕ месяцы (те, где levelDrafts[month] есть). Для каждого:
      const orders = draft.orders?.trim()==="" ? null : parseNum(draft.orders)
      const price  = draft.price?.trim()==="" ? null : parseNum(draft.price)
      // ВАЖНО null-семантика saveMonthLevels: пустой инпут → null → сброс поля уровня.
      push { productId, month, targetOrdersPerDay: orders, priceRub: price, buyoutPct: null }
    Если payload пуст → return. startTransition(async () => {
      const r = await saveMonthLevels(payload)
      if (!r.ok) { toast.error(r.error||"Не удалось сохранить"); return }
      toast.success("Уровни сохранены"); router.refresh(); onOpenChange(false) })
  «Закрыть» → onOpenChange(false).

── 4. СЕКЦИЯ «Приходы партий» ────────────────────────────────────────────
Заголовок h3 text-sm font-medium. Из productInput.arrivals (отсортируй по date):
  если пусто → <div text-sm text-muted-foreground>Приходов в горизонте нет</div>.
  иначе список строк text-sm tabular-nums:
    `{formatDateShort(a.date)} — {a.qty} шт — ` + бейдж по source:
      purchase / incoming-legacy → «📦 закупка»
      virtual → «◇ виртуальная»  (различать ACCEPTED/предложение НЕ обязательно — статус не приходит; текст «виртуальная»)
Стокаут (если mergedProductResult.firstStockoutDate != null):
  <div text-destructive text-sm> «Стокаут: {formatDateShort(firstStockoutDate)} · потеряно ≈
    {Math.round(lostUnitsToStockout)} шт / {fmtRub(lostRubToStockout)}» </div>.

── 5. СЕКЦИЯ «Правка по дням» — <details> ────────────────────────────────
<details className="rounded-md border"> <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">Правка по дням</summary>
  <div className="p-3 space-y-3"> … перенеси СЮДА текущую логику вкладки «Дни» из старого файла
  (селектор месяца native <select> строки 256–270, загрузка месяца через getProductPlanDays,
   таблица дней строки 279–335, realtime Сток(расч) через локальный computeSalesPlan getMergedDays,
   кнопка «Сохранить и пересчитать» через saveDayOverrides строки 344–362).
  Оставь для этой секции ОТДЕЛЬНОЕ состояние (selectedMonth, days месяца, dayDrafts) и её
  собственный вызов getProductPlanDays(productId, selectedMonth) — не смешивай с horizon-загрузкой.
  ⚠ ВАЖНО: dayDrafts из этой секции ДОЛЖНЫ учитываться в realtime-пересчёте ГЛАВНОГО графика
  (секция 2): подними dayDrafts в общий стейт диалога (не внутрь под-компонента) и вливай их в
  mergedInput.dayOverrides. Т.е. правка дня → и таблица дней, и главный график пересчитываются.
  </div>
</details>
Save через saveDayOverrides — как сейчас (handleSaveDays строки 182–207): "" → null (сброс), число≥0 → set;
  после ok → toast + router.refresh + onOpenChange(false). readOnly → инпуты disabled, кнопка скрыта.

── Импорты ──────────────────────────────────────────────────────────────
Добавь getProductPlanHorizon к импорту из "@/app/actions/sales-plan"; добавь saveMonthLevels.
Из recharts импортируй: ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, ReferenceLine,
  ResponsiveContainer, Legend, Tooltip. (BarChart больше не нужен.)

── ProductPlanTable.tsx: проброс abcStatus ────────────────────────────────
В рендере <ProductPlanDialog> (строки 797–813) добавь проп:
  abcStatus={products.find((p) => p.productId === dialogProductId)?.abcStatus ?? null}
Точку входа openDialog / setDialogProductId / клик по строке — НЕ менять.

── Общее ──────────────────────────────────────────────────────────────────
- Все цвета — токены (var(--chart-*), var(--muted-foreground), bg-background/muted/card, text-destructive,
  text-primary) с их dark-парами. НЕ хардкодь hex. НЕ используй bg-*/40 на элементах, где важна непрозрачность.
- computeSalesPlan вызывается ТОЛЬКО на клиенте (компонент "use client") — это pure-функция, ок.
- readOnly: все инпуты disabled, «Сохранить» (уровни и дни) скрыты.
  </action>
  <verify>
    <automated>cd /c/Users/serge/zoiten-pro && npx tsc --noEmit 2>&1 | grep -v '^#' | grep -Ec "ProductPlanDialog|ProductPlanTable" | grep -q '^0$' && echo TSC_OK</automated>
  </verify>
  <acceptance_criteria>
- ProductPlanDialog не содержит табов (нет Tab/activeTab/ParamsTab); DialogContent = "max-w-[95vw] xl:max-w-7xl max-h-[92vh] overflow-y-auto".
- При открытии вызывается getProductPlanHorizon(productId); productInput/daysAll/factUnits попадают в стейт.
- Главный ComposedChart (~340px) рисует Bar plan (var(--chart-2)), Bar fact (var(--chart-1), только прошедшие дни), Line stock на правой оси (var(--chart-iu)), ReferenceLine «сегодня» и линии приходов (реальные сплошные, виртуальные пунктир, label qty).
- Сетка уровней grid-cols-3 xl:grid-cols-6: правка любого инпута заказов/цены realtime меняет график + строку «План H2».
- «Сохранить» шлёт только изменённые месяцы в saveMonthLevels с null для пустых полей; после ok toast + router.refresh + закрытие.
- Секция «Приходы партий» — список source-бейджей или «Приходов в горизонте нет»; строка стокаута при firstStockoutDate.
- Секция «Правка по дням» — <details> с перенесённой таблицей дней (getProductPlanDays + saveDayOverrides); dayDrafts влияют на главный график.
- ProductPlanTable передаёт abcStatus в диалог; точка входа не изменена.
- readOnly скрывает кнопки «Сохранить» и делает инпуты disabled.
- tsc не даёт новых ошибок в ProductPlanDialog/ProductPlanTable.
  </acceptance_criteria>
</task>

</tasks>

<verification>
После обеих задач — полный gate:

1. Типы: `npx tsc --noEmit` — без НОВЫХ ошибок.
2. Сборка: `npm run build` — успешно.
3. Тесты движка (регресс — не должны сломаться, мы движок не трогали):
   `npx vitest run tests/sales-plan-engine.test.ts tests/sales-plan-iu.test.ts` — GREEN.

Ручной чеклист (внести в SUMMARY, отметить руками на dev/prod):
- [ ] Клик по строке товара в /sales-plan/products открывает большую модалку (95vw), без табов, одной прокруткой.
- [ ] График показывает весь H2 по дням: бары план + бары факт (только прошлое) + линия сток (правая ось).
- [ ] Линия «сегодня» и вертикали приходов (реальные сплошные / виртуальные пунктир) с qty на графике.
- [ ] Правка заказов/цены в сетке месяцев мгновенно меняет график и «План H2».
- [ ] «Сохранить» пишет уровни (проверить: пустой инпут сбрасывает уровень на авто), toast, таблица обновилась.
- [ ] «Приходы партий»: список источников; если стокаут — красная строка с потерями.
- [ ] «Правка по дням» раскрывается, правка дня меняет и таблицу, и главный график; «Сохранить» пишет дни.
- [ ] Тёмная тема: график/бейджи/линии читаются (токены + dark-пары).
</verification>

<success_criteria>
- getProductPlanHorizon возвращает весь горизонт days + сериализуемый productInput + факт по дням.
- ProductPlanDialog переписан в единую наглядную модалку (график горизонта, уровни realtime, приходы, details дни).
- Realtime-пересчёт графика работает через клиентский computeSalesPlan (уровни + дневные правки).
- Сохранение уровней (saveMonthLevels, null-семантика сброса) и дней (saveDayOverrides) работает.
- abcStatus проброшен из таблицы; точка входа не тронута.
- tsc чистый, npm run build успешен, vitest движка GREEN.
</success_criteria>

<output>
После завершения создай `.planning/quick/260705-tlc-product-plan-modal-v2/SUMMARY.md`
(шаблон summary.md) с ручным чеклистом из <verification>.
</output>
