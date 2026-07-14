---
phase: quick-260714-kuh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/finance-weekly/data.ts
autonomous: true
requirements: [QUICK-260714-KUH]

must_haves:
  truths:
    - "loadWeeklyFinReportInputs загружает rolling-30d buyout resolver параллельно с остальными запросами (тот же Promise.all)"
    - "pricingInputs.buyoutPct для N_std = реальный rolling-30d weighted % выкупа per nmId на weekEnd (не хардкод 100%)"
    - "Одежда (низкий выкуп 15-35%) → невыкупная надбавка Л_эфф восстанавливается → std-логистика одежды растёт ~7×"
    - "Бытовая техника (выкуп ~90-100%) → std-логистика меняется незначительно"
    - "pricing-math.ts и engine.ts НЕ изменены (diff-guard)"
    - "tsc чист, все существующие тесты (finance-weekly-* + pricing-math) зелёные"
  artifacts:
    - path: "lib/finance-weekly/data.ts"
      provides: "N_std buyoutPct из loadBuyoutPctRolling30dMap вместо card?.buyoutPercent ?? 100"
      contains: "loadBuyoutPctRolling30dMap"
  key_links:
    - from: "lib/finance-weekly/data.ts"
      to: "lib/wb-advert-spend-data.ts (loadBuyoutPctRolling30dMap)"
      via: "import + вызов в Promise.all с окном [weekEnd−30d, weekEndExclusive], nmIdsFilter=linkedNmIds"
      pattern: "loadBuyoutPctRolling30dMap\\("
    - from: "lib/finance-weekly/data.ts (цикл сборки articles)"
      to: "calculatePricingStandard.logisticsEffAmount"
      via: "buyoutResolver.resolve(nmId, weekEndISO) → pricingInputs.buyoutPct"
      pattern: "buyoutResolver\\.resolve\\(nmId, weekEndISO\\)"
---

<objective>
Починить офертную std-логистику (N_std, модель Л_эфф из юнит-экономики) в понедельном
фин-отчёте `/finance/weekly`: сейчас она считается со 100% выкупом у ВСЕХ артикулов,
потому что `WbCard.buyoutPercent` = NULL по всей базе (Analytics API с daily-cap не
заполнил), а фолбэк в `data.ts` — `card?.buyoutPercent ?? 100`.

При 100% выкупе (ПВ=1) невыкупная надбавка `(1−ПВ)×Л_обратно / ПВ` в
`calculatePricingStandard` обнуляется. Итог сверки недели 06.07–12.07:
- бытовая почти сходится (наши 472 123 vs экономист 461 003 — реальный выкуп ~90-100%),
- одежда занижена в ~7 раз (наши 127 264 vs ~900 599 — реальный выкуп одежды 15-35%,
  вся невыкупная надбавка Л_эфф теряется).

Указание пользователя 2026-07-14: брать РЕАЛЬНЫЙ процент выкупа per nmId.

Purpose: восстановить невыкупную составляющую эфф-логистики для сценария «Оферта»,
чтобы std-логистика одежды соответствовала расчёту экономиста.
Output: минимальный аддитивный дифф в `lib/finance-weekly/data.ts` (импорт + вызов
резолвера в существующем Promise.all + подстановка в pricingInputs.buyoutPct + комментарии).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@lib/finance-weekly/data.ts
@lib/wb-advert-spend-data.ts

<interfaces>
<!-- Контракты извлечены из кодовой базы. Исполнителю НЕ нужно исследовать код. -->

Из lib/wb-advert-spend-data.ts (канонический rolling-30d выкуп, ОБЩИЙ с /prices/wb и /ads/wb — НЕ МЕНЯТЬ этот файл):

```typescript
export interface BuyoutResolver {
  resolve(nmId: number, dateKey: string): number
}

// from — начало отчётного окна (включительно, UTC midnight)
// to   — конец отчётного окна (EXCLUSIVE, UTC midnight)
// nmIdsFilter — ограничить выборку; влияет ТОЛЬКО на per-date global (level 5)
export async function loadBuyoutPctRolling30dMap(
  from: Date,
  to: Date,
  nmIdsFilter?: number[],
): Promise<BuyoutResolver>
```

ВАЖНЫЕ СВОЙСТВА (проверено по коду):
1. resolve() — ТОТАЛЬНАЯ функция: ВСЕГДА возвращает число, НИКОГДА null/undefined.
   Fallback-цепочка: per-(nmId,date) → latest per-nmId ≤ date → per-(subcat,date) →
   latest per-subcat ≤ date → per-date global → finalGlobal (по умолчанию 90) → 90.
   Значит `resolve(...) ?? card?.buyoutPercent ?? 100` на практике == resolve(...);
   хвост `?? card ?? 100` оставляем как ЗАЩИТНЫЙ (на случай будущего изменения контракта).
2. Резолвер ЭМИТит per-nmId строки ТОЛЬКО для дат `date >= from` (window-функция поверх
   отфильтрованной выборки). Поэтому `from` ОБЯЗАН быть сдвинут на −30д от даты резолва —
   иначе per-nmId output ПУСТОЙ. Канонический образец — app/(dashboard)/prices/wb/page.tsx:
   `buyoutFrom = todayMsk − 30d`, `to = todayMsk`, resolve(nmId, todayMsk).
3. WbCardFunnelDaily.buyoutPercent сам NULL для несозревших дней (WB) — SQL фильтрует
   `buyoutPercent IS NOT NULL`, поэтому незрелые дни исключаются автоматически. Для дат
   за верхней границей эмита `binarySearchLE` возвращает latest ≤ date (последний зрелый).
   Для ПРОШЛЫХ недель (weekEnd < сегодня−7) weekEnd уже зрелый → прямое попадание.

Из lib/finance-weekly/data.ts (текущее состояние — точки правки):
- Строка ~237: `const weekEnd = new Date(weekStart.getTime() + 6 * 86_400_000)`
- Строка ~239: `const weekEndISO = isoDate(weekEnd)`  ← ключ резолва
- Строка ~309: `const linkedNmIds = Array.from(productByNmId.keys())`  ← nmIdsFilter
- Строка ~336: `const weekEndExclusive = new Date(weekStart.getTime() + 7 * 86_400_000)`
  (= weekEnd + 1 день; уже используется как EXCLUSIVE-граница недели — переиспользуем как `to`)
- Строки ~337-349: `const [ wbCards, appSettings, funnelRows, salesRows, adRows,
  commissionsByNmId, updAgg, fullstatsAgg, loans, realizationRows, bankTxRows ] = await Promise.all([ ... ])`
- Строка ~535: `const card = cardByNmId.get(nmId)` (в цикле по candidates)
- Строка ~567 (В ПРЕДЕЛАХ pricingInputs): `buyoutPct: card?.buyoutPercent ?? 100,`  ← ЦЕЛЬ ПРАВКИ

Из lib/pricing-math.ts (calculatePricingStandard — ТОЛЬКО для понимания, НЕ МЕНЯТЬ):
```
ПВ    = buyoutPct / 100
Л_эфф = ПВ > 0 ? [Л_туда + (1−ПВ) × Л_обратно] / ПВ : Л_туда   // при ПВ=1 надбавка исчезает
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: N_std buyoutPct = реальный rolling-30d выкуп per nmId (data.ts)</name>
  <files>lib/finance-weekly/data.ts</files>
  <action>
Аддитивный дифф в `lib/finance-weekly/data.ts`. НИЧЕГО не переписывать, только добавить/заменить перечисленное. Язык комментариев — русский.

1) ИМПОРТ. Среди lib-импортов (например сразу после строки `import { loadCommissionsForDate } from "@/lib/wb-commission-history"`) добавить:
```typescript
import { loadBuyoutPctRolling30dMap } from "@/lib/wb-advert-spend-data"
```

2) ЗАГРУЗКА РЕЗОЛВЕРА В СУЩЕСТВУЮЩИЙ Promise.all (блок `const [ ... ] = await Promise.all([ ... ])` ~строки 337-413).
   a) В список деструктуризации добавить `buyoutResolver,` ПОСЛЕДНИМ элементом (после `bankTxRows,`).
   b) В массив Promise.all добавить ПОСЛЕДНИМ элементом (после prisma.bankTransaction.findMany({...}), перед закрывающей `])`):
```typescript
    // quick 260714-kuh: реальный rolling-30d weighted % выкупа per nmId для N_std
    // (модель Л_эфф сценария «Оферта»). Окно [weekEnd−30d, weekEndExclusive) — mirror
    // /prices/wb: резолвер ЭМИТит per-nmId строки только для date >= from, поэтому
    // from сдвинут на −30д (иначе per-nmId output пустой). nmIdsFilter = linkedNmIds.
    // Резолв на weekEnd; несозревшие дни (buyoutPercent NULL) резолвер сам заменяет
    // на latest mature ≤ weekEnd. Для прошлых недель (weekEnd < сегодня−7) окно зрелое.
    loadBuyoutPctRolling30dMap(
      new Date(weekEnd.getTime() - 30 * 86_400_000),
      weekEndExclusive,
      linkedNmIds,
    ),
```
   (`weekEnd`, `weekEndExclusive`, `linkedNmIds` уже в области видимости выше по функции.)

3) ПОДСТАНОВКА В pricingInputs. Заменить строку `buyoutPct: card?.buyoutPercent ?? 100,` (внутри объекта `pricingInputs`, ~строка 567) на:
```typescript
        // quick 260714-kuh: реальный rolling-30d выкуп per nmId на weekEnd вместо
        // хардкода 100%. resolve() ВСЕГДА возвращает число (внутр. fallback →
        // per-subcat / global / 90%), поэтому `?? card?.buyoutPercent ?? 100` —
        // защитный хвост (WbCard.buyoutPercent сейчас NULL по всей базе). Раньше 100%
        // → (1−ПВ)×Л_обратно обнулялось → одежда занижалась в ~7× (сверка 06.07).
        buyoutPct: buyoutResolver.resolve(nmId, weekEndISO) ?? card?.buyoutPercent ?? 100,
```
   (`buyoutResolver` из п.2; `nmId`, `card`, `weekEndISO` уже в области видимости цикла.)

4) КОММЕНТАРИИ (актуализировать, требование 4).
   a) В header-блоке файла строку `//   N_std          — модель calculatePricingStandard (объёмная логистика / ед)` заменить на:
```typescript
//   N_std          — модель calculatePricingStandard (объёмная логистика / ед);
//                    % выкупа = rolling-30d weighted per nmId (loadBuyoutPctRolling30dMap),
//                    fallback card.buyoutPercent → 100 (quick 260714-kuh)
```
   b) В inline-комментарии перед вычислением N_std (~строки 554-557, начинается с `// N_std — модель объёмной логистики / ед`) добавить строку в конец абзаца:
```typescript
    // quick 260714-kuh: % выкупа модели = реальный rolling-30d weighted per nmId
    // (не хардкод 100%) — иначе (1−ПВ)×Л_обратно обнуляется и одежда занижается ~7×.
```

НЕ ТРОГАТЬ: pricing-math.ts, engine.ts, любые qty/деньги/комиссии/базисы, logisticsIuPerUnit (ИУ-факт из реализации). Резолвер lib/wb-advert-spend-data.ts НЕ менять (общий с /prices/wb и /ads/wb).
  </action>
  <verify>
    <automated>cd /c/Users/User/zoiten-pro && npx tsc --noEmit</automated>
  </verify>
  <done>
- `lib/finance-weekly/data.ts` импортирует `loadBuyoutPctRolling30dMap`.
- Вызов резолвера добавлен ПОСЛЕДНИМ элементом существующего Promise.all с окном
  `[weekEnd−30d, weekEndExclusive)` и `nmIdsFilter = linkedNmIds`; `buyoutResolver`
  в деструктуризации.
- `pricingInputs.buyoutPct` = `buyoutResolver.resolve(nmId, weekEndISO) ?? card?.buyoutPercent ?? 100`.
- Комментарии header-блока и inline N_std актуализированы (rolling-выкуп, quick 260714-kuh).
- pricing-math.ts, engine.ts, wb-advert-spend-data.ts не изменены.
- `npx tsc --noEmit` без ошибок.
  </done>
</task>

<task type="auto">
  <name>Task 2: Регрессионный прогон существующих тестов (гейт правок finance-weekly)</name>
  <files>—</files>
  <action>
Прогнать полный набор vitest (гейт правок finance-weekly per CLAUDE.md: tsc + vitest
finance-weekly-* + pricing-math + diff-guard engine.ts).

Ничего НЕ добавлять: `data.ts` юнитами не тестится (Prisma), а фолбэк-цепочка —
тривиальный `?? ` над тотальной resolve() (см. interfaces: card/100 — защитный
хвост). Выносить в pure-хелпер и покрывать тестом НЕ нужно (требование 5 «не раздувать»):
extract тестировал бы мёртвые ветки. Достаточно tsc (Task 1) + зелёные существующие тесты.

Проверить diff-guard: убедиться, что `git diff --name-only` показывает ТОЛЬКО
`lib/finance-weekly/data.ts` (engine.ts / pricing-math.ts / wb-advert-spend-data.ts
не изменены).
  </action>
  <verify>
    <automated>cd /c/Users/User/zoiten-pro && npm run test</automated>
  </verify>
  <done>
- `npm run test` (vitest run) — все существующие тесты зелёные, в т.ч. finance-weekly-engine,
  finance-weekly-* и pricing-math (golden nmId 165967746 ИУ/Оферта, golden nmId 800750522).
- `git diff --name-only` = только `lib/finance-weekly/data.ts`.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` без ошибок (типы нового импорта, аргументы окна, resolve()).
- `npm run test` — 100+ существующих тестов зелёные (finance-weekly-* + pricing-math не регрессировали).
- diff ограничен `lib/finance-weekly/data.ts`; pricing-math.ts / engine.ts / wb-advert-spend-data.ts не тронуты.

Пост-деплой (выполняет ОРКЕСТРАТОР, не входит в исполнение плана): дамп недели 06.07 →
std-логистика одежды выросла с ~127 тыс. до порядка ~900 тыс. (сопоставимо с экономистом
~900 599), бытовая — в пределах ~460-530 тыс.
</verification>

<success_criteria>
- N_std берёт реальный rolling-30d weighted % выкупа per nmId (окно [weekEnd−30d, weekEndExclusive), резолв на weekEnd), а не хардкод 100%.
- Изменён ТОЛЬКО `lib/finance-weekly/data.ts`, минимальным аддитивным диффом.
- tsc чист, существующие тесты зелёные.
- Комментарии актуализированы (rolling-выкуп, quick 260714-kuh).
</success_criteria>

<output>
После завершения создать `.planning/quick/260714-kuh-n-std-rolling-100/260714-kuh-SUMMARY.md`.
</output>
