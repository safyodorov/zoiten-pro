---
phase: 07-prices-wb
plan: 06
subsystem: ui
tags: [shadcn, base-ui, tooltip, nextjs-app-router, rbac, tabs]

# Dependency graph
requires:
  - phase: 07-prices-wb-01
    provides: Prisma модели WbPromotion/CalculatedPrice/AppSetting и миграции
  - phase: 05-ui-module-stubs
    provides: ComingSoon компонент для заглушек разделов
provides:
  - shadcn tooltip компонент (@base-ui/react/tooltip)
  - Layout раздела /prices с RBAC guard и табами WB/Ozon
  - Redirect /prices → /prices/wb
  - Ozon stub (ComingSoon)
  - Временная заглушка /prices/wb (будет заменена в 07-08)
  - PricesTabs client component
affects: [07-07, 07-08, 07-09]

# Tech tracking
tech-stack:
  added:
    - "@base-ui/react/tooltip (через вручную созданный shadcn wrapper)"
  patterns:
    - "shadcn v4 wrapper над @base-ui/react — паттерн dialog.tsx"
    - "Table-tabs навигация — копия CardsTabs (pathname.startsWith, border-primary)"
    - "Redirect-index + defence-in-depth RBAC в layout и page.tsx"

key-files:
  created:
    - "components/ui/tooltip.tsx"
    - "components/prices/PricesTabs.tsx"
    - "app/(dashboard)/prices/layout.tsx"
    - "app/(dashboard)/prices/ozon/page.tsx"
    - "app/(dashboard)/prices/wb/page.tsx"
  modified:
    - "app/(dashboard)/prices/page.tsx"

key-decisions:
  - "shadcn CLI не использовался — tooltip создан вручную как wrapper над @base-ui/react/tooltip (следует паттерну existing dialog.tsx, select.tsx)"
  - "TooltipProvider встроен в Tooltip root — минимизирует boilerplate на стороне потребителя (не нужен глобальный Provider в layout)"
  - "PricesTabs визуально идентичен CardsTabs — единый паттерн табов для всех разделов с подсекциями маркетплейсов"
  - "Временная заглушка /prices/wb имеет own requireSection('PRICES') — defence in depth, даже если layout guard упадёт"

patterns-established:
  - "Tooltip wrapper над @base-ui: data-[open]/data-[closed] animate-in/animate-out, sideOffset=6 default"
  - "PricesTabs паттерн: pathname.startsWith() вместо строгого равенства — устойчиво к query params"
  - "Подразделы маркетплейсов: layout + redirect-index + per-marketplace page.tsx (WB основной, Ozon stub)"

requirements-completed: [PRICES-13, PRICES-14, PRICES-15]

# Metrics
duration: 3min
completed: 2026-04-10
---

# Phase 07-06: UI инфраструктура раздела «Управление ценами» Summary

**shadcn tooltip wrapper над @base-ui/react + layout с табами WB/Ozon, redirect-index и временная заглушка /prices/wb (готов фундамент для 07-07..07-09)**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-10T08:51:14Z
- **Completed:** 2026-04-10T08:54:00Z
- **Tasks:** 2
- **Files modified:** 6 (5 created, 1 updated)

## Accomplishments

- Создан `components/ui/tooltip.tsx` — shadcn wrapper над `@base-ui/react/tooltip` с TooltipProvider/Tooltip/TooltipTrigger/TooltipContent экспортами
- Создан `app/(dashboard)/prices/layout.tsx` с `requireSection("PRICES")`, h1 «Управление ценами» (Display 24px) и PricesTabs
- `/prices/page.tsx` переведён с ComingSoon на `redirect("/prices/wb")` — пользователь попадает сразу на основной подраздел
- `/prices/ozon/page.tsx` создан как ComingSoon stub («Управление ценами Ozon»)
- `/prices/wb/page.tsx` создан как временная заглушка с собственным RBAC guard (будет заменена в плане 07-08)
- `components/prices/PricesTabs.tsx` создан как client component с `usePathname`, два таба (WB/Ozon), активный подсвечен `border-primary text-primary`
- `npx tsc --noEmit` — clean, без ошибок

## Task Commits

Each task was committed atomically:

1. **Task 1: shadcn tooltip + layout/redirect/ozon/wb-stub pages** — `328953e` (feat)
2. **Task 2: components/prices/PricesTabs.tsx** — `8028c3f` (feat)

**Plan metadata:** (финальный docs коммит с SUMMARY/STATE/ROADMAP)

## Files Created/Modified

- `components/ui/tooltip.tsx` — shadcn wrapper над @base-ui/react/tooltip (TooltipProvider встроен в Tooltip root, TooltipContent с анимациями data-[open]/data-[closed])
- `app/(dashboard)/prices/layout.tsx` — RSC layout с RBAC guard, h1 Display 24px, PricesTabs
- `app/(dashboard)/prices/page.tsx` — redirect на /prices/wb (replace ComingSoon)
- `app/(dashboard)/prices/ozon/page.tsx` — ComingSoon stub для Ozon подраздела
- `app/(dashboard)/prices/wb/page.tsx` — временная заглушка (план 07-08 заменит полноценной RSC с PriceCalculatorTable)
- `components/prices/PricesTabs.tsx` — client component навигации WB/Ozon (паттерн CardsTabs)

## Decisions Made

- **shadcn CLI не использовался.** Проект использует кастомные wrapper'ы над `@base-ui/react` (preset base-nova), CLI для `tooltip` мог бы создать radix-версию (несовместимую). Вместо этого tooltip создан вручную, следуя паттерну `components/ui/dialog.tsx` — импорт `import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"` + экспорт 4 компонентов.
- **TooltipProvider встроен в Tooltip root.** Потребители делают `<Tooltip><TooltipTrigger>…<TooltipContent>…` без необходимости оборачивать всё в `<TooltipProvider>` в layout — упрощает использование в планах 07-07 (PromoTooltip на названиях акций).
- **PricesTabs визуально идентичен CardsTabs.** Использован тот же паттерн (`pathname.startsWith`, `border-primary text-primary` для активного, `text-muted-foreground hover:text-foreground` для неактивного), классы `px-4 py-2 text-sm font-medium border-b-2 -mb-px` — единый визуальный язык табов через проект.
- **Defence-in-depth RBAC.** Layout вызывает `requireSection("PRICES")` + временная `/prices/wb/page.tsx` дублирует вызов — на случай если Next.js решит рендерить page без layout в каких-то edge cases (RSC streaming / error boundary).

## Deviations from Plan

None — plan executed exactly as written. Все 6 файлов созданы согласно спецификации, структура и классы соответствуют CardsTabs/dialog.tsx референсам, TypeScript компилируется clean.

Единственная mini-adjustment: существующий `app/(dashboard)/prices/page.tsx` (ComingSoon stub из Phase 5) был **заменён** на redirect через полную перезапись (не создан с нуля) — план учитывал этот сценарий.

## Issues Encountered

- **Task 1 тsc check ожидаемо падал** на отсутствующем `@/components/prices/PricesTabs` (он создавался в Task 2). Решено: зафиксирован факт, продолжено выполнение, после Task 2 — повторный tsc clean. Не deviation, а cross-task dependency внутри плана.

## User Setup Required

None — вся инфраструктура раздела работает без внешних сервисов. Tooltip не требует дополнительных зависимостей (`@base-ui/react` уже в package.json).

## Next Phase Readiness

- **План 07-07** (PriceCalculatorTable + GlobalRatesBar + PromoTooltip) может начинать работу:
  - Tooltip компонент готов для PromoTooltip
  - Таблица подключается внутрь `/prices/wb/page.tsx` (заглушка будет заменена в 07-08)
- **План 07-08** (RSC страница /prices/wb с таблицей, фильтрами, sticky-колонками) может заменять временную заглушку — структура `/prices/wb/page.tsx` уже с `requireSection("PRICES")`, достаточно расширить её.
- **План 07-09** (PricingCalculatorDialog с realtime расчётом) — tooltip готов для подсказок внутри модалки.
- **Navigation:** `/prices` → redirect → `/prices/wb` (заглушка). `/prices/ozon` → ComingSoon. Все роуты accessible (no 404), RBAC действует через layout.

## Self-Check: PASSED

- components/ui/tooltip.tsx — FOUND
- components/prices/PricesTabs.tsx — FOUND
- app/(dashboard)/prices/layout.tsx — FOUND
- app/(dashboard)/prices/page.tsx — FOUND (modified to redirect)
- app/(dashboard)/prices/ozon/page.tsx — FOUND
- app/(dashboard)/prices/wb/page.tsx — FOUND
- Commit 328953e — FOUND (Task 1)
- Commit 8028c3f — FOUND (Task 2)
- `npx tsc --noEmit` — CLEAN (no errors)

---
*Phase: 07-prices-wb*
*Completed: 2026-04-10*
