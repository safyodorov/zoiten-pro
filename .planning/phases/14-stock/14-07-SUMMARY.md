---
phase: 14-stock
plan: "07"
subsystem: stock
tags: [rsc, prisma, sticky-table, cluster-expand, url-state, deploy, vps, systemd, seed]

dependency_graph:
  requires:
    - phase: 14-01
      provides: WbWarehouse + WbCardWarehouseStock schema, CLUSTER_ORDER + CLUSTER_FULL_NAMES, next.config.ts /inventory redirect
    - phase: 14-02
      provides: seed-wb-warehouses.ts (75 складов), WbWarehouse seed data
    - phase: 14-03
      provides: fetchStocksPerWarehouse, WbCardWarehouseStock per-warehouse данные
    - phase: 14-06
      provides: StockProductTable, stock-data.ts паттерны, /stock/layout.tsx (placeholder для StockTabs)
  provides:
    - components/stock/StockTabs.tsx — 3 таба Остатки/WB склады/Ozon, паттерн CardsTabs
    - components/stock/ClusterTooltip.tsx — base-ui render-prop tooltip для кластеров
    - components/stock/StockWbTable.tsx — 7 кластерных колонок + expand через URL state + DeficitCell
    - lib/stock-wb-data.ts — getStockWbData() per-nmId с per-warehouse разбивкой по кластерам
    - app/(dashboard)/stock/layout.tsx — обновлён со StockTabs
    - app/(dashboard)/stock/wb/page.tsx — RSC /stock/wb
    - app/(dashboard)/stock/ozon/page.tsx — ComingSoon заглушка
    - deploy.sh + DEPLOY.md — Phase 14 deploy runbook
    - VPS: миграция применена, seed 75 складов, сервис активен
  affects:
    - Phase 14 UAT: все 9 пунктов STOCK-29 готовы к верификации пользователем

tech-stack:
  added: []
  patterns:
    - StockTabs: usePathname + exact-match для /stock + startsWith для /stock/wb, /stock/ozon
    - ClusterTooltip: base-ui render-prop (render={<span />}), не asChild (как в PromoTooltip)
    - StockWbTable: expandedSet из useSearchParams, router.replace({scroll:false}) для URL state
    - Cluster expand: colSpan динамический (4 collapsed, warehouseCount expanded), CLUSTER_ORDER flatMap
    - needsClusterReview: ⚠️ Unicode prefix + text-yellow-600 в заголовке per-warehouse колонки

key-files:
  created:
    - components/stock/StockTabs.tsx
    - components/stock/ClusterTooltip.tsx
    - components/stock/StockWbTable.tsx
    - lib/stock-wb-data.ts
    - app/(dashboard)/stock/wb/page.tsx
    - app/(dashboard)/stock/ozon/page.tsx
  modified:
    - app/(dashboard)/stock/layout.tsx
    - deploy.sh
    - DEPLOY.md

key-decisions:
  - "ClusterTooltip: render-prop (render={<span />}) вместо asChild — base-ui паттерн из PromoTooltip.tsx"
  - "StockWbTable Сводная строка: placeholder null cells для кластеров — агрегация per-nmId достаточна для drill-down"
  - "Seed VPS: npx tsx (не npm run seed:wb-warehouses) — tsx не в PATH в production, npx загрузил автоматически"
  - "seed:wb-warehouses первый запуск на production: 75 складов успешно"
  - "nginx redirect: Next.js 308 через next.config.ts достаточен — nginx 301 не требуется"

requirements-completed: [STOCK-21, STOCK-22, STOCK-24, STOCK-25, STOCK-29]

duration: "~10 минут"
completed: "2026-04-22"
---

# Phase 14 Plan 07: StockTabs + /stock/wb кластеры + deploy + UAT — Summary

**StockTabs (3 таба) + /stock/wb с 7 кластерными колонками + expand через URL state + deploy на VPS (миграция Phase 14, seed 75 WB складов, сервис активен) — финальный план Phase 14.**

## Performance

- **Duration:** ~10 минут
- **Started:** 2026-04-22T07:02:46Z
- **Completed:** 2026-04-22T07:12:05Z
- **Tasks:** 3 выполнено (Task 4 — checkpoint UAT)
- **Files modified:** 8 (6 создано + 2 изменено)

## Accomplishments

- `StockTabs.tsx`: 3 таба с exact-match для /stock, startsWith для /stock/wb и /stock/ozon — паттерн CardsTabs, border-b-2 active state
- `ClusterTooltip.tsx`: base-ui render-prop (как PromoTooltip), CLUSTER_FULL_NAMES lookup, опциональное количество складов
- `StockWbTable.tsx`: 7 кластерных колонок, expand/collapse через ?expandedClusters=ЦФО,ПФО в URL, toolbar «Развернуть все / Свернуть все», ⚠️ для needsClusterReview складов
- `lib/stock-wb-data.ts`: getStockWbData() — per-nmId с per-cluster aggregate + per-warehouse slots + clusterWarehouses для expanded headers
- Deploy: `npx prisma migrate deploy` применил `20260421_phase14_stock`, seed 75 WB складов выполнен, zoiten-erp.service активен
- /inventory → 308 Permanent Redirect → /stock (Next.js next.config.ts)

## Task Commits

1. **Task 1: StockTabs + ClusterTooltip + layout + ozon** — `ee7a910` (feat)
2. **Task 2: /stock/wb RSC + StockWbTable + lib/stock-wb-data** — `563f13b` (feat)
3. **Task 3: deploy.sh + DEPLOY.md обновлены** — `7370afa` (chore)

## Files Created/Modified

- `components/stock/StockTabs.tsx` — "use client", 3 таба, exact/startsWith, border-b-2 active
- `components/stock/ClusterTooltip.tsx` — base-ui Tooltip render-prop, CLUSTER_FULL_NAMES
- `components/stock/StockWbTable.tsx` — 7 кластеров, expand URL state, DeficitCell, sticky 4 cols
- `lib/stock-wb-data.ts` — RSC helper: WbCard + WbCardWarehouseStock join, per-cluster aggregate
- `app/(dashboard)/stock/wb/page.tsx` — RSC /stock/wb, empty state
- `app/(dashboard)/stock/ozon/page.tsx` — ComingSoon placeholder
- `app/(dashboard)/stock/layout.tsx` — добавлен `<StockTabs />`
- `deploy.sh` — Phase 14 заметка о seed:wb-warehouses
- `DEPLOY.md` — секция 11: Phase 14 deploy runbook

## Deploy Log

- **Миграция:** `20260421_phase14_stock` успешно применена на VPS
- **seed:wb-warehouses:** 75 складов создано (ЦФО:22, ЮГ:10, Урал:5, ПФО:11, СЗО:6, СФО:10, Прочие:11)
- **zoiten-erp.service:** active (running) после `systemctl restart`
- **nginx rewrite /inventory:** 308 через Next.js (не nginx 301) — работает корректно
- **https://zoiten.pro/stock:** 302 → /login (ожидаемо для неаутентифицированных запросов)
- **https://zoiten.pro/stock/wb:** 302 → /login (RSC маршрут существует)
- **https://zoiten.pro/stock/ozon:** 302 → /login (ComingSoon страница существует)

## Decisions Made

- **ClusterTooltip render-prop:** `render={<span />}` вместо `asChild` — база-ui паттерн (выучено из PromoTooltip.tsx). `asChild` — это radix/shadcn v3, base-ui использует render prop.
- **Сводная строка кластеров:** пустые cells (null) — агрегация per-nmId достаточна; Product-level кластерная агрегация — избыточна для задачи
- **seed на production через npx tsx:** `npm run seed:wb-warehouses` не работает в production (tsx не в PATH). `npx tsx` загрузил и выполнил корректно.
- **Nginx 301 vs Next.js 308:** redirect /inventory → /stock уже работает через Next.js (308). Nginx дополнительный redirect — избыточен.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] base-ui TooltipTrigger: render-prop вместо asChild**

- **Found during:** Task 1 (ClusterTooltip)
- **Issue:** PLAN.md использовал `<TooltipTrigger asChild>` — это radix-ui паттерн. В проекте используется base-ui (shadcn v4), где `asChild` не существует — нужен `render={<element />}` prop
- **Fix:** Переключён на `render={<span className="cursor-help" />}` по образцу PromoTooltip.tsx
- **Files modified:** components/stock/ClusterTooltip.tsx
- **Commit:** ee7a910

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug в паттерне plan)
**Impact on plan:** Минимальный — только замена API call, поведение идентично.

## Known Stubs

- **Сводная строка кластеров в StockWbTable:** null cells (—) для кластерных агрегатов на Сводной строке. Данные есть per-nmId. Агрегация Product-level кластеров — потенциальное улучшение v1.3.
- **МП О в /stock/wb:** показывает WB totalStock (без Ozon). Ozon = placeholder до реализации Ozon API.
- **WbCardWarehouseStock:** пустые данные до нажатия «Обновить из WB» в /stock — пользователь должен выполнить UAT пункт (e).

## UAT Checkpoint (Task 4)

После deploy необходимо пройти UAT на https://zoiten.pro. Детали в разделе ниже.

## Next Phase Readiness

Phase 14 выполнен полностью. Phase 14 v1.2 milestone (STOCK-01..STOCK-29):
- /stock — Product-level таблица с 6 группами + sticky cols + цветовой Д ✓
- Excel Иваново — upload + preview dialog + apply ✓
- Производство inline редактирование + debounce ✓
- TurnoverNormInput + debounce ✓
- WbRefreshButton → /api/wb-sync → WbCardWarehouseStock ✓
- /stock/wb — 7 кластерных колонок + expand URL state ✓
- /stock/ozon — ComingSoon ✓
- /inventory → /stock redirect ✓
- seed WbWarehouse 75 складов на production ✓

---

## Self-Check: PASSED

| Проверка | Результат |
|---------|-----------|
| components/stock/StockTabs.tsx | FOUND |
| components/stock/ClusterTooltip.tsx | FOUND |
| components/stock/StockWbTable.tsx | FOUND |
| lib/stock-wb-data.ts | FOUND |
| app/(dashboard)/stock/wb/page.tsx | FOUND |
| app/(dashboard)/stock/ozon/page.tsx | FOUND |
| app/(dashboard)/stock/layout.tsx содержит StockTabs | FOUND |
| deploy.sh содержит Phase 14 заметку | FOUND |
| DEPLOY.md содержит секцию Phase 14 | FOUND |
| Commit ee7a910 (Task 1) | FOUND |
| Commit 563f13b (Task 2) | FOUND |
| Commit 7370afa (Task 3) | FOUND |
| zoiten-erp.service active на VPS | PASSED |
| WbWarehouse COUNT = 75 | PASSED |
| https://zoiten.pro/stock 302→/login | PASSED |
| npx tsc --noEmit → 0 ошибок | PASSED |

---
*Phase: 14-stock*
*Completed: 2026-04-22*
