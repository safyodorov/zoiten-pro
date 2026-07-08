---
phase: quick/260708-iec
plan: 01
subsystem: prices-wb
tags: [wb-api, pricing, buyout-pct, resolver-reuse]
provides:
  - "/prices/wb колонка «Процент выкупа» теперь показывает реальный rolling-30d % per nmId вместо повсеместного фолбэка 100%"
  - "Л_эфф в calculatePricingStandard (std-фин-рез) оживает для карточек с выкупом < 100%"
affects: [prices-wb, ads-wb-shared-resolver]
tech-stack:
  added: []
  patterns:
    - "Переиспользование существующего резолвера loadBuyoutPctRolling30dMap (lib/wb-advert-spend-data.ts) вместо чтения пустого WbCard.buyoutPercent"
key-files:
  created: []
  modified:
    - "app/(dashboard)/prices/wb/page.tsx"
key-decisions:
  - "Окно резолвера from=todayMsk-30d (не from=todayMsk) — иначе per-nmId output пуст из-за WB T+3 lag и все карточки схлопываются в один global fallback"
  - "Резолвер грузится один раз до цикла построения строк (после loadLegendMetrics, где todayMsk/linkedNmIds уже в scope) — не per-card"
duration: ~25min
completed: 2026-07-08
---

# Quick Task 260708-iec: реальный rolling-30d % выкупа в /prices/wb Summary

**Заменён повсеместный фолбэк 100% в колонке «Процент выкупа» на /prices/wb реальным взвешенным rolling-30d выкупом per nmId — через переиспользование существующего резолвера `loadBuyoutPctRolling30dMap` (тот же, что питает /ads/wb и легенду expand-панели), без новой логики.**

## Performance
- **Duration:** ~25 минут
- **Tasks:** 1 (единственная авто-таска)
- **Files modified:** 1 — `app/(dashboard)/prices/wb/page.tsx`

## Проблема

`WbCard.buyoutPercent` в БД пустой (0/256 карточек имеют значение) → и `resolvedBuyout` (строка «Текущая»/Regular/Auto), и `globalValues.buyoutPct` (fallback-значение для кнопки «↻ Применить глобальные» в модалке) везде читали `card.buyoutPercent ?? 100` → **100% у всех карточек**. Из-за этого в `calculatePricingStandard` (`lib/pricing-math.ts:513`) `pv = (buyoutPct ?? 100)/100 = 1` всегда → возвраты считались «бесплатными», Л_эфф (эффективная логистика) не отличалась от Л_туда, что систематически занижало Л_эфф и завышало прибыль стандартного сценария.

## Решение

Проект уже содержал рабочий резолвер `loadBuyoutPctRolling30dMap` (lib/wb-advert-spend-data.ts) с встроенным hard-fallback (`finalGlobal ?? 90`), используемый в `/ads/wb` и в `lib/wb-legend-metrics.ts` (легенда expand-панели). Задача — переиспользовать его в `/prices/wb` в двух местах, не трогая саму логику резолвера, pricing-math.ts или модалку.

### Изменения в `app/(dashboard)/prices/wb/page.tsx`

1. Импорт `loadBuyoutPctRolling30dMap` из `@/lib/wb-advert-spend-data`.
2. Резолвер загружается один раз сразу после блока `loadLegendMetrics(...)` (там `todayMsk` и `linkedNmIds` уже в scope, а цикл построения строк ещё впереди):
   ```typescript
   const buyoutFrom = new Date(todayMsk.getTime() - 30 * 24 * 3600_000)
   const buyoutResolver = await loadBuyoutPctRolling30dMap(buyoutFrom, todayMsk, linkedNmIds)
   const todayBuyoutKey = todayMsk.toISOString().slice(0, 10)
   ```
   **Критично про окно:** `from = todayMsk − 30д` (НЕ `from = todayMsk`). Резолвер фильтрует output-строки `WHERE date >= from`; сегодняшний funnel-день у WB всегда NULL (T+3 lag) → при `from=today` per-nmId output был бы пуст и все карточки схлопнулись бы в один одинаковый global-fallback. Окно зеркалит рабочий образец `lib/wb-legend-metrics.ts`.
3. `resolvedBuyout` (было `product.buyoutOverridePct ?? card.buyoutPercent ?? 100`) → `product.buyoutOverridePct ?? buyoutResolver.resolve(card.nmId, todayBuyoutKey)`.
4. `globalValues.buyoutPct` (было `card.buyoutPercent ?? 100`) → `buyoutResolver.resolve(card.nmId, todayBuyoutKey)`.

Не тронуты (вне scope): `buyoutPct: card.buyoutPercent ?? null` в `cardGroups.push` (карточка-уровень, строка ~957) и `buyoutPct: nmMetrics?.buyoutPct ?? null` в expand-панели (строка ~1050) — эти два места используют отдельный источник (`legendMetrics`) и не входили в задачу.

## Task Commits
1. **Task 1: rolling-30d % выкупа в /prices/wb + деплой** — `0edde49`

## Верификация

- `npx tsc --noEmit` — 0 ошибок.
- `npm run test` — golden pricing-math (nmId 800750522, profit 567.68) и все pricing-* suite зелёные (54/54). Полный прогон: 917 passed / 77 failed — **идентично baseline** (проверено через `git stash` + повторный прогон на HEAD без изменений: тот же счёт 917/77) → все 77 падений пред-существующие, не связаны с этой правкой, не чинились (вне scope).
- ИУ-блок `calculatePricing` (pricing-math.ts:326) не читает `buyoutPct` → не затронут. Std-golden тест подаёт `buyoutPct` явным inputs (не через resolvedBuyout) → не затронут.

## Деплой

- `git push origin main` → `5ac1f54..0edde49`.
- `df -h /` на VPS перед деплоем: 91GB свободно (36% used) — с запасом.
- Детached-деплой (`nohup bash deploy.sh &`) — сборка ~45с, `==> Copying static assets to standalone...` → `==> Restarting service...` → `==> Done`.
- `zoiten-erp.service` перезапущен чисто (`✓ Ready in 214ms`), `journalctl` без ошибок после рестарта.
- `curl -s -o /dev/null -w '%{http_code}' https://zoiten.pro` → **200**.
- `curl .../prices/wb` (без сессии) → 302 (редирект на /login) — ожидаемо, страница защищена RBAC.

## Deviations from Plan

None — план выполнен точно как написан. Все критические execution notes (окно резолвера, две точки правки, golden-тест изоляция) подтверждены в коде без отклонений.

## Files Created/Modified
- `app/(dashboard)/prices/wb/page.tsx` — импорт резолвера, загрузка `buyoutResolver`+`todayBuyoutKey` один раз до цикла, замена в `resolvedBuyout` и `globalValues.buyoutPct`.

## Self-Check: PASSED
- FOUND: `app/(dashboard)/prices/wb/page.tsx` содержит `loadBuyoutPctRolling30dMap`.
- FOUND: commit `0edde49` в `git log --oneline`.
- FOUND: прод отвечает 200 на `https://zoiten.pro`.
