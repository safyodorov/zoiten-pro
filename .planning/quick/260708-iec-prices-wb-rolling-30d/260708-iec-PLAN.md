---
phase: quick/260708-iec
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/(dashboard)/prices/wb/page.tsx
autonomous: true
requirements: [QUICK-260708-iec]
must_haves:
  truths:
    - "Колонка «Процент выкупа» в /prices/wb показывает реальные per-nmId значения (а не 100% у всех карточек)"
    - "Л_эфф (эфф. логистика в std-фин-резе) отличается от Л_туда для карточек с выкупом < 100%"
    - "npx tsc --noEmit зелёный; npm run test зелёный (golden pricing-math + sales-plan не тронуты)"
    - "Прод задеплоен: curl https://zoiten.pro → 200"
  artifacts:
    - path: "app/(dashboard)/prices/wb/page.tsx"
      provides: "Загрузка buyoutResolver ОДИН раз + резолвинг выкупа в resolvedBuyout и globalValues.buyoutPct"
      contains: "loadBuyoutPctRolling30dMap"
  key_links:
    - from: "app/(dashboard)/prices/wb/page.tsx"
      to: "lib/wb-advert-spend-data.ts:loadBuyoutPctRolling30dMap"
      via: "await + buyoutResolver.resolve(card.nmId, todayBuyoutKey)"
      pattern: "buyoutResolver\\.resolve\\(card\\.nmId"
---

<objective>
На `/prices/wb` заменить пустой `WbCard.buyoutPercent` (в БД он 0/256 → повсеместный фолбэк на 100%) реальным rolling-30d процентом выкупа per nmId, взятым из уже существующего резолвера `loadBuyoutPctRolling30dMap` (тот же, что питает /ads/wb и легенду expand-панели). После этого:
- колонка «Процент выкупа» показывает реальные значения per карточка;
- `Л_эфф` в стандартном фин-резе (`calculatePricingStandard`) оживает и начинает отличаться от `Л_туда` для карточек с выкупом < 100%.

Purpose: сейчас std-фин-рез считает эффективную логистику при ПВ=100% (возвраты «бесплатны»), что систематически занижает Л_эфф и завышает прибыль стандартного сценария.
Output: правки в одном RSC-файле `app/(dashboard)/prices/wb/page.tsx` + деплой на прод.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@app/(dashboard)/prices/wb/page.tsx
@lib/wb-advert-spend-data.ts

<interfaces>
<!-- Контракт резолвера — использовать напрямую, без изучения кодовой базы. -->

Из lib/wb-advert-spend-data.ts:
```typescript
export interface BuyoutResolver {
  // Возвращает % выкупа (число) с гарантированным hard-fallback внутри
  // (finalGlobal ?? 90). dateKey формат = d.toISOString().slice(0,10) (YYYY-MM-DD).
  resolve(nmId: number, dateKey: string): number
}

// from/to — UTC-midnight Date; функция сама расширяет lookback на -30д внутри.
// nmIdsFilter влияет ТОЛЬКО на byDate-global fallback (level 5); per-nmId и
// per-subcat уровни scope-независимы.
// ⚠ КЛЮЧЕВОЕ: output-строки per-nmId фильтруются `WHERE date >= from`.
//   Значит from ДОЛЖЕН уходить назад к закрытым funnel-дням, иначе per-nmId
//   output пуст и resolve() схлопывается в один глобальный fallback.
export async function loadBuyoutPctRolling30dMap(
  from: Date,
  to: Date,
  nmIdsFilter?: number[],
): Promise<BuyoutResolver>
```

Существующий образец вызова (тот же резолвер) — lib/wb-legend-metrics.ts:
```typescript
const buyoutResolver = await loadBuyoutPctRolling30dMap(sevenDaysAgo, todayMsk, scopeNmIds)
// ...
const pct = buyoutResolver.resolve(r.nmId, r.date.toISOString().slice(0, 10))
```

Точки правки в app/(dashboard)/prices/wb/page.tsx (текущее состояние):
```typescript
// line ~358 (уже есть):
const todayMsk = getMskTodayDate()
// line ~311 (уже есть):
const linkedNmIds = Array.from(articleToProduct.keys())

// line ~566-567 (заменить):
const resolvedBuyout =
  product.buyoutOverridePct ?? card.buyoutPercent ?? 100

// line ~667 (заменить):
buyoutPct: card.buyoutPercent ?? 100,
```

Проверка безопасности golden-теста (lib/pricing-math.ts):
- `calculatePricing` (line 326, ИУ-блок) — `inputs.buyoutPct` НЕ используется → golden nmId 800750522 (profit 567.68) не затрагивается.
- `calculatePricingStandard` (line 502) — `const pv = (inputs.buyoutPct ?? 100)/100` (line 513) → питает `logEff` (Л_эфф). Std-golden тест подаёт buyoutPct:90 явным inputs, не через resolvedBuyout → тоже не затрагивается.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: rolling-30d % выкупа в /prices/wb + деплой</name>
  <files>app/(dashboard)/prices/wb/page.tsx</files>
  <action>
Правим ТОЛЬКО `app/(dashboard)/prices/wb/page.tsx`. Не трогать /ads/wb, lib/pricing-math.ts, lib/wb-advert-spend-data.ts, модалку. Логику выкупа НЕ переписывать — только переиспользовать `loadBuyoutPctRolling30dMap`.

1) Добавить импорт (рядом с прочими импортами из lib, напр. после строки импорта `loadLegendMetrics`):
```typescript
import { loadBuyoutPctRolling30dMap } from "@/lib/wb-advert-spend-data"
```

2) Загрузить резолвер ОДИН раз ДО цикла построения строк. Вставить сразу после блока `loadLegendMetrics(...)` (после ~строки 420, где заканчивается присвоение `legendMetrics`), т.к. там `todayMsk` и `linkedNmIds` уже в scope, а цикл `for (const [, cardRefs] of productToCards)` (~строка 544) ещё впереди:
```typescript
  // ── 6.5.2. Rolling-30d % выкупа per nmId (quick 260708-iec) ──────────
  // Заменяет пустой WbCard.buyoutPercent (0/256 → фолбэк 100%) реальным
  // взвешенным выкупом. Тот же резолвер, что /ads/wb и легенда: scope-независим
  // на per-nmId/subcat уровнях, hard-fallback внутри (finalGlobal ?? 90) → всегда число.
  //
  // Окно [todayMsk-30d, todayMsk): output-строки резолвера покрывают последние
  // ЗАКРЫТЫЕ funnel-дни (сегодня всегда NULL из-за T+3 лага WB). resolve(nmId,
  // todayKey) через встроенный fallback «latest per-nmId ≤ key» отдаёт свежайшее
  // закрытое rolling-30d значение каждого nmId.
  //
  // ⚠ ВАЖНО про окно: спека предлагала from=todayMsk (to=+1д), но это дало бы
  // ПУСТОЙ per-nmId output — резолвер фильтрует output `WHERE date >= from`, а
  // сегодняшний funnel NULL → все карточки схлопнулись бы в один глобальный
  // fallback (одинаковое число у всех), цель не достигнута. Поэтому from сдвинут
  // на -30д, зеркалит рабочий образец lib/wb-legend-metrics.ts (тот же резолвер,
  // from=sevenDaysAgo/thirtyDaysAgo, to=todayMsk).
  const buyoutFrom = new Date(todayMsk.getTime() - 30 * 24 * 3600_000)
  const buyoutResolver = await loadBuyoutPctRolling30dMap(
    buyoutFrom,
    todayMsk,
    linkedNmIds,
  )
  // dateKey формат = как приватный dateKey() в wb-advert-spend-data: toISOString().slice(0,10)
  const todayBuyoutKey = todayMsk.toISOString().slice(0, 10)
```

3) Заменить `resolvedBuyout` (~строка 566-567):
```typescript
      // quick 260708-iec: реальный rolling-30d выкуп вместо пустого card.buyoutPercent.
      const resolvedBuyout =
        product.buyoutOverridePct ?? buyoutResolver.resolve(card.nmId, todayBuyoutKey)
```

4) Заменить `globalValues.buyoutPct` (~строка 667):
```typescript
        buyoutPct: buyoutResolver.resolve(card.nmId, todayBuyoutKey),
```

НЕ трогать: строку `buyoutPct: card.buyoutPercent ?? null` в `cardGroups.push({ card: {...} })` (~строка 931) и `buyoutPct: nmMetrics?.buyoutPct ?? null` в expand-панели (~строка 1024) — вне scope задачи.

5) Прогнать локальные гейты (см. <verify>). Убедиться, что оба зелёные.

6) Деплой (делегирован пользователем — финальный шаг, без доп. подтверждений):
```bash
# рабочая копия синхронна (проверено при планировании: main...origin/main, clean)
ssh root@85.198.97.89 "df -h /"          # минимум 5GB свободно
git add -A
git commit -m "$(cat <<'EOF'
feat(prices-wb): реальный rolling-30d % выкупа вместо пустого card.buyoutPercent

/prices/wb: resolvedBuyout и globalValues.buyoutPct берут значение из
loadBuyoutPctRolling30dMap (тот же резолвер, что /ads/wb и легенда).
Л_эфф в calculatePricingStandard оживает; ИУ-блок и golden test не тронуты.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
ssh root@85.198.97.89 "cd /opt/zoiten-pro && nohup bash deploy.sh > /var/log/zoiten-deploy.log 2>&1 &"
# следить за логом до строки '==> Done':
ssh root@85.198.97.89 "tail -n 40 /var/log/zoiten-deploy.log"
curl -s -o /dev/null -w '%{http_code}' https://zoiten.pro   # ожидаем 200
```
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
    <automated>npm run test</automated>
    <automated>curl -s -o /dev/null -w '%{http_code}' https://zoiten.pro</automated>
  </verify>
  <done>
- `npx tsc --noEmit` без ошибок; `npm run test` зелёный (golden pricing-math nmId 800750522 profit 567.68 + std-golden + sales-plan — все проходят, т.к. buyoutPct в ИУ-блоке не используется, а std-golden подаёт buyoutPct явно).
- В page.tsx `resolvedBuyout` (~566) и `globalValues.buyoutPct` (~667) вычисляются через `buyoutResolver.resolve(card.nmId, todayBuyoutKey)`; `buyoutResolver` загружается один раз до цикла построения строк.
- На проде колонка «Процент выкупа» в /prices/wb показывает разные реальные значения per карточка (не 100% у всех); для карточек с выкупом < 100% Л_эфф ≠ Л_туда.
- `curl https://zoiten.pro` → 200; в `/var/log/zoiten-deploy.log` присутствует `==> Done`.
  </done>
</task>

</tasks>

<verification>
- Тайп-чек: `npx tsc --noEmit` — 0 ошибок (buyoutResolver/todayBuyoutKey объявлены до использования в цикле).
- Юнит: `npm run test` — все vitest-сьюты зелёные; golden и std-golden не регрессируют.
- Прод: `curl https://zoiten.pro` → 200; лог деплоя содержит `==> Done`.
- Ручная сверка (визуально после деплоя): колонка «Процент выкупа» на /prices/wb варьируется per карточка; Л_эфф в std-фин-резе отличается от Л_туда там, где выкуп < 100%.
</verification>

<success_criteria>
- Один файл изменён: `app/(dashboard)/prices/wb/page.tsx`.
- Реальный rolling-30d выкуп подставляется в 2 точках (resolvedBuyout, globalValues.buyoutPct) через существующий `loadBuyoutPctRolling30dMap` — без новой логики.
- Golden pricing тест не затронут; std-фин-рез (Л_эфф) оживает.
- Прод задеплоен и отвечает 200.
</success_criteria>

<output>
После завершения создать `.planning/quick/260708-iec-prices-wb-rolling-30d/260708-iec-SUMMARY.md`.
</output>
