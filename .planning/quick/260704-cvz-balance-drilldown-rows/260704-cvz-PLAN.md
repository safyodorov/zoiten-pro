---
phase: quick-260704-cvz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/balance-data.ts
  - components/finance/BalanceSheetTable.tsx
  - tests/balance-sheet.test.ts
autonomous: true
requirements: [QUICK-260704-cvz]
user_setup: []

must_haves:
  truths:
    - "Клик по строке «Склады WB» / «WB в пути к клиенту» / «WB в пути от клиента» / «Склад Иваново» / «Товар в пути из Китая» / «Авансы поставщикам» разворачивает разбивку Категория→Подкатегория→Товар"
    - "Клик по строке «Банковские счета (₽)» разворачивает список рублёвых счетов"
    - "Клик по строке «Остаток по кредитам» разворачивает Кредитор→Кредит"
    - "На каждом уровне разбивки показаны обе колонки дат + Δ₽ + Δ%, дети отсортированы по убыванию суммы"
    - "Σ листовых сумм каждой разворачиваемой строки равна amountRub самой строки (инвариант)"
    - "Существующие подытоги групп, ИТОГО АКТИВЫ/ПАССИВЫ, КАПИТАЛ, плашка «Без оценки», CNY-строки не изменились"
  artifacts:
    - path: "lib/balance-data.ts"
      provides: "BalanceLine.children + билдеры деревьев (склады, закупки, банк, кредиты)"
      contains: "children"
    - path: "components/finance/BalanceSheetTable.tsx"
      provides: "client-компонент с expandable-строками и рекурсивным рендером детей"
      contains: "use client"
    - path: "tests/balance-sheet.test.ts"
      provides: "тесты инварианта Σ детей и сортировки desc"
  key_links:
    - from: "lib/balance-data.ts"
      to: "BalanceLine.children"
      via: "билдеры дерева внутри loadBalanceSheet"
      pattern: "children"
    - from: "components/finance/BalanceSheetTable.tsx"
      to: "line.children"
      via: "рекурсивный рендер при expandedKeys.has(fullKey)"
      pattern: "expandedKeys"
---

<objective>
Добавить раскрываемые (drill-down) строки в отчёт «Баланс» (`/finance/balance`). По клику строка разворачивается во вложенную разбивку (до 3 уровней) с обеими колонками дат + Δ₽/Δ%, сортировка детей по убыванию суммы на каждом уровне.

Purpose: пользователь видит, из чего складывается каждая крупная статья баланса (какие товары/счета/кредиты), без ухода в другие разделы.

Output:
- `lib/balance-data.ts` — тип `BalanceLine.children?` + билдеры деревьев для 6 товарных строк, банка, кредитов (внутри `loadBalanceSheet`, инвариант Σдетей=amountRub родителя).
- `components/finance/BalanceSheetTable.tsx` — `"use client"`, состояние `expandedKeys`, chevron-кнопки, рекурсивный рендер детей с отступом по глубине, compare-matching по полному пути.
- `tests/balance-sheet.test.ts` — тесты инварианта и сортировки; golden-суммы не сломаны.

Scope: ТОЛЬКО эти три файла. `page.tsx` не трогаем (props компонента не меняются). Не меняем subtotalRub/totalRub/capitalRub — children это чистая детализация.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@lib/balance-data.ts
@components/finance/BalanceSheetTable.tsx
@lib/loan-math.ts
@lib/purchase-stages.ts
@tests/balance-sheet.test.ts

<interfaces>
<!-- Ключевые контракты. Использовать напрямую — исследование кодовой базы не требуется. -->

Из lib/balance-data.ts (текущий тип, РАСШИРЯЕТСЯ полем children в задаче 1):
```typescript
export interface BalanceLine {
  key: string
  label: string
  amountRub: number
  currency?: "RUB" | "CNY"
  approximate?: boolean
  note?: string
  // ДОБАВИТЬ: children?: BalanceLine[]  // детализация; Σдетей(листья) === amountRub
}
export interface BalanceGroup { key: string; label: string; lines: BalanceLine[]; subtotalRub: number }
export interface BalanceSection { key: "assets" | "liabilities"; label: string; groups: BalanceGroup[]; totalRub: number }
```

Локальные хелперы уже есть в lib/balance-data.ts:
```typescript
function round2(n: number): number
const STOCK_LOCATION_KEYS: Record<string,string> // WB_WAREHOUSE→"stock-wb-warehouse", ... IVANOVO→"stock-ivanovo"
```

Уже загружаемые данные внутри loadBalanceSheet (ПЕРЕИСПОЛЬЗОВАТЬ, не дублировать запросы):
- `stockRows` = prisma.financeStockSnapshot.findMany({ where: { date: asOf } })
  Поля строки: { productId, sku, name, location, qty, costPriceAtDate, valueRub }. Строки с costPriceAtDate==null уже уходят в unvaluedMap — их в разбивку НЕ включать.
- `bankAccounts` = prisma.bankAccount.findMany(...)  // СЕЙЧАС select {id, currency}
- `bankBalances` = await Promise.all(bankAccounts.map → { currency, balance: getBankBalanceAsOf(acc.id, asOf) })  // здесь уже есть остатки per-счёт
- `loans` = prisma.loan.findMany({ include: { payments: true } })  // point-in-time фильтры: issued>asOf skip, deletedAt<=asOf skip
- `purchases` = prisma.purchase.findMany({ include: { items: { include: { stages } }, payments } })
  В цикле уже считаются paidRub (в ₽ на asOf) и stage = stageAsOf(...). Классификация: WAREHOUSE→skip, SHIPMENT|TRANSIT→inTransitTotal, иначе→advancesTotal.

Из lib/loan-math.ts:
```typescript
export function computeLoanAggregates(amount: number, payments: PaymentInput[], asOf?: Date): LoanAggregates
// .currentBalance = amount − Σprincipal(date<=asOf)
```

Prisma-модели (для новых select/include):
- BankAccount { id, currency, number, bank: Bank { name } }  → добавить в select: number, bank:{select:{name}}
- Loan { lenderId, contractNumber, lender: Lender { name } } → добавить include lender:{select:{name}} (или select)
- PurchaseItem { productId, quantity, unitPrice(Decimal), stages }
- Product { id, category: Category{id,name}?, subcategory: Subcategory{id,name}? }
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Задача 1: BalanceLine.children + билдеры деревьев в lib/balance-data.ts</name>
  <files>lib/balance-data.ts</files>
  <action>
Расширить `interface BalanceLine` полем `children?: BalanceLine[]` (детализация; Σ листовых amountRub === amountRub родителя). Построить деревья ВНУТРИ `loadBalanceSheet` (для одной asOf; page.tsx вызывает loadBalanceSheet дважды — дерево строится независимо для каждой даты).

**Общий product-lookup (ОДИН запрос).** Собрать `allProductIds` = union productId из (valued stockRows) + (позиций закупок, попавших в inTransit/advances). Затем ОДИН вызов:
```typescript
const productMeta = await prisma.product.findMany({
  where: { id: { in: [...allProductIds] } },
  select: { id: true, category: { select: { id: true, name: true } }, subcategory: { select: { id: true, name: true } } },
})
```
Построить `Map<productId, {catId, catName, subId, subName}>`. Для productId, которого нет в Map (удалённый товар / null relation) → узел «Без категории» (catId="none") / «Без подкатегории» (subId="none").

**Обобщённый билдер дерева Категория→Подкатегория→Товар** (pure helper внутри модуля), принимает `parentKey` и массив `{ productId, productLabel, amountRub }` листовых вкладов, и `productMeta`-Map. Строит 3 уровня:
- уровень категории: key = `${parentKey}/cat:${catId}` (или `/cat:none`), label = catName ?? "Без категории"
- уровень подкатегории: key = `.../sub:${subId}` (или `/sub:none`), label = subName ?? "Без подкатегории"
- уровень товара: key = `.../prod:${productId}`, label = productLabel (sku+name товара; для складов бери row.name; для закупок — из того же source либо productId-fallback)
amountRub товара = Σ вкладов этого productId; выше — сумма детей (round2). На КАЖДОМ уровне сортировать children по amountRub **desc**. Пустые ветки не создавать.

**4 складские строки.** Для каждой локации STOCK_LOCATION_KEYS: собрать valued stockRows этой локации (costPriceAtDate!=null), вклад = { productId: row.productId, productLabel: `${row.sku} ${row.name}`, amountRub: Number(row.valueRub ?? 0) }. `children` = билдер(parentKey=stockLineKey). ⚠ Складывать вклады В МОМЕНТ прохода по stockRows (тот же цикл, что заполняет stockByLocation) — не добавлять второй проход по БД. Инвариант: Σ листьев === stockByLocation[loc] (уже равно amountRub строки после round2). Присвоить `stockLines[i].children`.

**«Товар в пути из Китая» + «Авансы поставщикам».** В существующем цикле по purchases, для закупок с paidRub>0 и stage∈{SHIPMENT,TRANSIT} (inTransit) либо else-ветка (advances): аллокация paidRub по позициям purchase.items. Вес позиции: `weight_i = item.quantity * Number(item.unitPrice)`. `Σweight` по позициям закупки. Если Σweight>0: вклад позиции = `paidRub * weight_i / Σweight`, productId=item.productId, productLabel из productMeta/productId (можно `productId` как запасной label — реального sku/name у закупки в этом цикле нет; использовать productId-fallback помечен TODO-комментом, ок для v1). Если Σweight===0 (нет позиций/цен): весь paidRub → узел «Без распределения» (специальный лист key=`${parentKey}/prod:none`, label="Без распределения"). Копить вклады в два массива: `inTransitContribs[]`, `advancesContribs[]`. После цикла: `children` строки stock-in-transit-china = билдер(inTransitContribs), children строки advances-suppliers = билдер(advancesContribs). Инвариант: Σ листьев === inTransitTotal / advancesTotal.
ВАЖНО: узел «Без распределения» и узлы «Без категории/подкатегории» должны попадать в дерево — билдер должен уметь принять лист с productId="none" (метаданных нет → «Без категории»/«Без подкатегории»/label="Без распределения").

**«Банковские счета (₽)».** Изменить select bankAccounts → добавить `number: true, bank: { select: { name: true } }`. В цикле `bankBalances` захватить per-счёт RUR-остатки (не только сумму): собрать массив `{ key: 'bank-rub/acct:'+acc.id, label: '{bank.name} · {number}', amountRub: round2(balance) }` для RUR-счетов с balance!=null. Отсортировать desc по amountRub, присвоить строке `bank-rub` как `children`. Инвариант: Σ === bankRurTotal.

**«Остаток по кредитам».** Изменить loans-запрос → `include: { payments: true, lender: { select: { name: true } } }`. В цикле loans (после point-in-time фильтров issued>asOf / deletedAt<=asOf) копить per-lender: Map<lenderId, {name, loans: {loanId, contractNumber, balance}[]}>. balance = computeLoanAggregates(amount, payments, asOf).currentBalance. Построить дерево 2 уровня: кредитор `${'loans-balance'}/lender:${lenderId}` (label=lender.name) → кредит `.../loan:${loanId}` (label=contractNumber, amountRub=balance). Сортировать оба уровня desc по amountRub. Присвоить строке `loans-balance` как `children`. Инвариант: Σ листьев === loansTotal.

Все суммы через round2. НЕ менять sumRubLines/subtotalRub/totalRub/capitalRub. НЕ добавлять children к: bank-cny, cash, taxes-deferred, receivables-*, manual-*.
Комментарии на русском (конвенция проекта).
  </action>
  <verify>
    <automated>npx vitest run tests/balance-sheet.test.ts</automated>
  </verify>
  <done>BalanceLine имеет children?; 6 товарных строк + bank-rub + loans-balance получают children; Σ листьев каждой = amountRub строки; select bankAccounts включает number+bank.name, loans include lender; существующие golden-тесты (капитал/подытоги/налоги/unvalued) зелёные. Локально vitest может не запуститься (нет node_modules) — тогда верификация переносится на деплой/ревью (см. задачу 3).</done>
</task>

<task type="auto">
  <name>Задача 2: client-рефактор BalanceSheetTable + вложенный рендер + compare-matching</name>
  <files>components/finance/BalanceSheetTable.tsx</files>
  <action>
Добавить `"use client"` в начало файла (сейчас server component; интерактивности не было кроме `<details>` в плашке «Без оценки» — она client-safe). Импортировать `useState` из react и `ChevronRight`, `ChevronDown` из `lucide-react`.

**Состояние.** В корневом `BalanceSheetTable` завести `const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())` + `toggle(key)` (иммутабельно: копия Set, add/delete, setState). Прокинуть `expandedKeys` и `toggle` вниз через props до `LineRow` (через SectionBlock → GroupBlock → LineRow).

**Compare-matching по полному пути.** Расширить `buildLineMap(section)`: сейчас кладёт только `${group.key}:${line.key}`. Добавить рекурсивный обход `line.children` — для каждого узла (на любой глубине) класть в Map ключ `${group.key}:${fullChildKey}` → amountRub, где fullChildKey это `line.children[].key` (полный path-ключ, уже уникальный, вида `bank-rub/acct:...`). Т.к. дочерние key уже полные пути — достаточно рекурсивно пройти дерево и для каждого положить `${group.key}:${node.key}`. Compare-значение узла ищется по `${groupKey}:${node.key}`; если нет (узел появился/исчез между датами) → 0 (как и для верхнеуровневых строк).

**Рендер строки-родителя.** В `LineRow`: если `line.children?.length` — слева от label рендерить chevron-кнопку (`<button>` с `ChevronDown` если развёрнут иначе `ChevronRight`, `onClick={() => toggle(fullKey)}`, aria-label). CNY-строка (`line.currency==='CNY'`) и строки без children — БЕЗ chevron (плейсхолдер-отступ для выравнивания опционален). `fullKey` для верхнеуровневой строки = `line.key` (для рекурсии дети используют свой `node.key`).

**Рекурсивный рендер детей.** Ввести компонент/функцию рендера узла с параметром `depth` (0 = верхний уровень, существующий `pl-8`). Когда узел в `expandedKeys` и есть children — после его `<tr>` отрендерить children как `<tr>` c увеличенным left-padding: depth 0→`pl-8`, 1→`pl-12`, 2→`pl-16`, 3→`pl-20` (маппинг по depth, не инлайн-стиль). Каждый дочерний `<tr>` — те же 5 колонок: label (+ chevron если у него свои children) | На {currentLabel} = node.amountRub | На {compareLabel} = compareLineMap.get(`${groupKey}:${node.key}`) ?? 0 | Δ₽ | Δ% (переиспользовать `DeltaCells`). Только листья/узлы с непустым children показывают chevron. Реализовать через рекурсивную под-функцию `renderLineTree(node, depth, groupKey)` возвращающую массив `<tr>` (или React.Fragment) — вызывается из LineRow для верхнего уровня и рекурсивно для развёрнутых детей. Ключи React: `key={node.key}`.

**Sticky / фон.** Шапка таблицы уже sticky со сплошным `bg-background` — не трогать. Новые `<tr>` детей — обычные (не sticky), фон дефолтный; НЕ добавлять `bg-muted/NN` (полупрозрачный) нигде (конвенция проекта: сплошной bg на sticky; у детей sticky нет, просто не ломаем). Бордюр `border-b border-border/40` как у существующих LineRow.

**Без регресса.** Подытоги «Итого {group}», секции ИТОГО АКТИВЫ/ПАССИВЫ, строка КАПИТАЛ, плашка «Без оценки», CNY-строки (без chevron, colSpan=3 в дельте) — рендерятся как раньше. Props компонента (`current/compare/currentLabel/compareLabel`) НЕ меняются → `page.tsx` не трогаем. `computeDelta`/форматтеры переиспользуются.
Комментарии на русском.
  </action>
  <verify>
    <automated>npx vitest run tests/balance-sheet.test.ts</automated>
  </verify>
  <done>Файл начинается с "use client"; строки с children показывают chevron и по клику разворачивают детей с нарастающим отступом по глубине; compare-колонка детей заполняется по полному path-ключу; sticky-шапка и все существующие итоги/плашки без визуального регресса; page.tsx не изменён. tsc/build проверяется на деплое (локально node_modules отсутствуют).</done>
</task>

<task type="auto">
  <name>Задача 3: тесты инварианта Σ детей и сортировки desc</name>
  <files>tests/balance-sheet.test.ts</files>
  <action>
Расширить существующие фикстуры (НЕ ломая golden-суммы) и добавить тесты для children.

**Фикстуры.** В `beforeEach`:
- `bankAccount.findMany` mock → добавить в объекты счетов `number` и `bank: { name }` (напр. acc-rur → number:"40702...1", bank:{name:"Сбербанк"}). Добавить ВТОРОЙ RUR-счёт (напр. acc-rur2, balance через bankAccount.findUnique + пустые транзакции) чтобы у bank-rub было ≥2 ребёнка и можно было проверить сортировку desc. Обновить ожидаемый bankRurTotal в существующем тесте «итоги ... по фикстуре» соответственно (Σ двух RUR-счетов), либо задать второму счёту такой баланс, чтобы удобно проверялась сортировка; при изменении суммы — синхронно поправить ассерты assets.totalRub/capital, чтобы golden остался консистентным.
- `loan.findMany` mock → добавить `contractNumber` и `lender: { name }` в существующий loan-1; добавить второй кредит того же ИЛИ другого кредитора с иным currentBalance для проверки сортировки/группировки. Обновить loans subtotal-ассерт если добавлен второй кредит.
- `financeStockSnapshot.findMany` mock → у valued-строки (p1, WB_WAREHOUSE) добавить, при необходимости, вторую valued-строку другого товара той же локации, чтобы у stock-wb-warehouse было ≥2 ребёнка (проверка сортировки товаров desc). Обеспечить `product.findMany` mock (см. ниже).
- `purchase.findMany` mock → у purch-transit и purch-advance добавить `items[].productId`, `items[].quantity`, `items[].unitPrice` (сейчас items только `{stages}`), чтобы аллокация weight работала. Значения подобрать так, чтобы Σ детей === inTransitTotal / advancesTotal.
- ДОБАВИТЬ mock `prisma.product.findMany` (нового вызова из задачи 1): вернуть category/subcategory для productId из stock + закупок; часть productId оставить вне выборки для проверки узла «Без категории». Не забыть добавить `product: { findMany: vi.fn() }` в `vi.mock("@/lib/prisma", ...)` и `vi.mocked(prisma.product.findMany).mockReset()` + mock в beforeEach.

**Новые тесты** (describe-блок «drill-down children (260704-cvz)»):
1. Инвариант: для каждой разворачиваемой строки (stock-wb-warehouse, stock-in-transit-china, advances-suppliers, bank-rub, loans-balance — те, что есть в фикстуре) рекурсивная Σ листовых amountRub ≈ amountRub строки (toBeCloseTo, 2). Написать хелпер `sumLeaves(line): number` (если children пусто → amountRub, иначе Σ sumLeaves(child)).
2. Сортировка: для строки с ≥2 детьми проверить, что `children` на верхнем уровне идут по невозрастанию amountRub (`children[i].amountRub >= children[i+1].amountRub`). Проверить хотя бы для bank-rub и для одного товарного уровня.
3. (опц.) Узел «Без категории»/«Без распределения» присутствует, если фикстура содержит productId без метаданных / закупку без позиций.

Существующие 5 тестов должны остаться зелёными (капитал, итоги по фикстуре, налоги, unvaluedStock, отсутствие WB Finance API). Если добавление второго счёта/кредита/товара сдвигает golden-суммы — синхронно обновить соответствующие `toBeCloseTo` в тесте «итоги активов/пассивов/капитала».
  </action>
  <verify>
    <automated>npx vitest run tests/balance-sheet.test.ts</automated>
  </verify>
  <done>Тесты покрывают инвариант Σ детей = amountRub строки и сортировку desc; product.findMany замокан; все существующие golden-ассерты консистентны с обновлёнными фикстурами. Локальный прогон vitest может упасть из-за отсутствия node_modules — это ОК: команда «должна проходить» на деплое; блокировать локально нельзя (оркестратор делает деплой + прогон вручную).</done>
</task>

</tasks>

<verification>
- `npx vitest run tests/balance-sheet.test.ts` — должно проходить (на деплое; локально node_modules может отсутствовать). Существующие golden-тесты зелёные, новые тесты инварианта/сортировки зелёные.
- Ревью диффа: BalanceLine.children добавлен; 6 товарных строк + bank-rub + loans-balance имеют билдеры; select bankAccounts (number+bank.name) и loans (lender) расширены; ОДИН product.findMany; BalanceSheetTable = "use client" c expandedKeys; page.tsx не изменён.
- Инварианты в коде: Σ листьев склада === stockByLocation[loc]; Σ inTransit-детей === inTransitTotal; Σ advances-детей === advancesTotal; Σ bank-rub-детей === bankRurTotal; Σ loans-детей === loansTotal.
</verification>

<success_criteria>
- 6 товарных строк («Склады WB», «WB в пути к клиенту», «WB в пути от клиента», «Склад Иваново», «Товар в пути из Китая», «Авансы поставщикам») раскрываются в Категория→Подкатегория→Товар (3 уровня).
- «Банковские счета (₽)» раскрывается в список рублёвых счетов (1 уровень), «Остаток по кредитам» — в Кредитор→Кредит (2 уровня).
- НЕ раскрываются: bank-cny, cash, taxes-deferred, receivables, manual-*.
- На каждом уровне: обе колонки дат + Δ₽ + Δ%, дети отсортированы desc по amountRub.
- Инвариант Σ листьев = amountRub строки соблюдён для всех разворачиваемых строк; subtotal/total/capital не изменились.
- Sticky-шапка и существующие итоги/плашки без регресса; page.tsx не тронут.
</success_criteria>

<output>
После завершения создать `.planning/quick/260704-cvz-balance-drilldown-rows/260704-cvz-SUMMARY.md`
</output>
