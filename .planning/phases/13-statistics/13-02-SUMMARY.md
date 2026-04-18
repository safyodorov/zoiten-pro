---
phase: 13-statistics
plan: "02"
subsystem: support-stats-ui
tags: [rsc, client-components, zod, nextjs-15, searchparams, rbac, sup-36, sup-37, sup-38]
dependency_graph:
  requires:
    - plan-13-01 (lib/date-periods.ts + lib/support-stats.ts — 6 aggregation helpers + 3 types)
    - phase-08-support-mvp (SupportTicket/WbCard модели)
  provides:
    - support-stats-page (/support/stats RSC с requireSection SUPPORT VIEW)
    - stats-search-params-helper (parseStatsSearchParams Zod + per-field salvage)
    - 6-stats-ui-components (StatsTabs + PeriodFilter + ProductStatsTab + ManagerStatsTab + TopReturnReasonsList + AutoRepliesSummary)
    - support-nav-stats-entry (BarChart3 nav item + section title regex)
  affects:
    - plan-13-03 (cron /api/cron/support-stats-upsert будет триггерить ManagerSupportStats upsert — страница уже live на момент deploy)
tech-stack:
  added: []
  patterns:
    - zod-per-field-salvage (при невалидных полях дропаем только их, остальные сохраняем через partial parse)
    - separate-search-params-module (Next.js 15 запрещает произвольные экспорты из Page → parseStatsSearchParams в search-params.ts)
    - url-driven-tab-state (StatsTabs + PeriodFilter пушат URL без client-side state)
    - rsc-tab-composition (ProductStatsTab composes TopReturnReasonsList, ManagerStatsTab composes AutoRepliesSummary)
key-files:
  created:
    - app/(dashboard)/support/stats/page.tsx
    - app/(dashboard)/support/stats/search-params.ts
    - components/support/stats/StatsTabs.tsx
    - components/support/stats/PeriodFilter.tsx
    - components/support/stats/ProductStatsTab.tsx
    - components/support/stats/ManagerStatsTab.tsx
    - components/support/stats/TopReturnReasonsList.tsx
    - components/support/stats/AutoRepliesSummary.tsx
  modified:
    - components/layout/nav-items.ts
    - components/layout/section-titles.ts
    - tests/support-stats-page.test.ts
decisions:
  - "Next.js 15 запрещает произвольные экспорты из Page (parseStatsSearchParams is not a valid Page export field) → вынесен в отдельный модуль app/(dashboard)/support/stats/search-params.ts, из которого импортируют и page.tsx, и тесты"
  - "parseStatsSearchParams реализует per-field salvage: при невалидных значениях дропаются только проблемные поля (issues.map(i => i.path[0])), остальные сохраняются. Гарантирует что tab=invalid + period=7d → {tab: products, period: 7d}, а не fallback на все defaults"
  - "PeriodFilter label «Квартал (календарный)» закрепляет D-05 (Q1=Jan-Mar) прямо в UI — пользователь видит семантику без необходимости читать docs"
  - "StatsTabs и PeriodFilter — полностью URL-driven (useSearchParams + router.push), без локального client state для active tab/period. Upsides: переход назад/вперёд работает естественно, стат URL можно шарить, RSC сразу загружает нужные данные"
  - "RSC page.tsx делает conditional data assembly по tab (products → listProductsWithStats + getTopReturnReasons; managers → listManagersWithStats + getAutoReplyCount) через Promise.all — минимум запросов на переключение вкладки"
  - "ProductStatsTab и ManagerStatsTab остаются RSC (нет 'use client'), сортировка DESC делается inline через [...arr].sort() в render. Сortable columns отложены (MVP — DESC по primary metric: feedbacksTotal для products, totalProcessed для managers)"
  - "D-02 AutoRepliesSummary рендерится внутри ManagerStatsTab summary row (3-я карточка), не отдельно — визуально ассоциирует с менеджерами даже при D-02 глобальном счётчике"
  - "D-03 TopReturnReasonsList рендерится внутри ProductStatsTab (после summary, перед таблицей), не отдельно — логически привязан к товарам даже при D-03 глобальной агрегации"
  - "D-07 без recharts/графиков — TopReturnReasonsList использует div bars (width %), не SVG chart. Summary numbers в card'ах, progress bars в list — минимум визуальной сложности, максимум читаемости"
  - "D-10 SUPPORT VIEW (не MANAGE) — страница read-only, нет server actions или write операций. VIEWER-роль получает доступ если имеет sectionRole SUPPORT VIEW"
  - "formatDuration inline helper в ProductStatsTab и ManagerStatsTab (дублируется) — избегаем shared util файла, функция тривиальная (9 строк), shared/duplicate trade-off в пользу локальности"
  - "ManagerStatsTab approvalPct helper: returnsApproved/returnsDecided*100 rounded, decided=0 → '—'. Консистентно с plan 13-01 ManagerStatFields семантикой (returnsDecided включает approved+rejected+reconsider)"
metrics:
  duration: 5min
  completed_date: 2026-04-18
  commits: 3
  task_count: 3
  files_modified: 11
  tests_added: 10
---

# Phase 13 Plan 02: UI /support/stats — RSC страница + 6 компонентов + nav integration

UI слой Phase 13: RSC страница `/support/stats` (read-only, SUPPORT VIEW) с 2 табами «По товарам» / «По менеджерам» и фильтром периода (7д/30д/квартал/кастом), 6 новых компонент в `components/support/stats/`, navigation entry с иконкой BarChart3, 10 GREEN unit-тестов для `parseStatsSearchParams`. Задействует все 6 aggregation helpers + 3 типа из Plan 13-01 без изменений.

## Objective

Построить полную UI-оболочку над Plan 13-01 helpers без добавления server actions или cron. Руководитель открывает `/support/stats`, переключает табы и периоды — видит реальные метрики из БД. D-02 AutoRepliesSummary global, D-03 TopReturnReasonsList global, D-05 календарный квартал с подписью в UI, D-07 только таблицы и числа, D-10 VIEW-level RBAC.

## Changes

### app/(dashboard)/support/stats/page.tsx (новый, ~80 строк RSC)

- `export const dynamic = "force-dynamic"` — searchParams варьируется
- `requireSection("SUPPORT")` — D-10 VIEW (не MANAGE)
- searchParams через `parseStatsSearchParams` (импорт из ./search-params)
- `getPeriod(preset, custom?)` из lib/date-periods.ts — с fallback custom без дат → 30d
- Conditional data assembly по tab:
  - products: `[products, topReasons] = Promise.all([listProductsWithStats(..., filters?), getTopReturnReasons(..., 10)])`
  - managers: `[managers, autoReplyCount] = Promise.all([listManagersWithStats(...), getAutoReplyCount(...)])`
- Render: `<PeriodFilter>` + `<StatsTabs>` + tabContent

### app/(dashboard)/support/stats/search-params.ts (новый, pure helper)

Вынесен из page.tsx потому что Next.js 15 не допускает произвольные экспорты из Page (build error: `"parseStatsSearchParams" is not a valid Page export field`).

- Zod schema: tab (enum default=products), period (enum default=30d), dateFrom/dateTo (string optional), nmId (coerce number int positive optional), userId (string optional)
- `parseStatsSearchParams(sp)` — 2-ступенчатая стратегия:
  1. `safeParse(flat)` — happy path
  2. При fail: извлекаем path[0] из `error.issues`, дропаем только невалидные поля, re-parse salvage
- Flat conversion: array values → первый элемент (Next.js searchParams может вернуть массив)

### 6 новых компонентов в components/support/stats/

**Client (2):**

- **StatsTabs.tsx** — 2 кнопки (По товарам / По менеджерам), активная по `currentTab` prop, `router.push` с preserved `URLSearchParams`
- **PeriodFilter.tsx** — native `<select>` (7д / 30д / Квартал (календарный) / Кастом) + условные `<input type="date">` для custom + кнопка «Применить» (disabled если custom без дат)

**RSC (4):**

- **ProductStatsTab.tsx** — summary cards (totalFeedbacks / totalReturns / avgRatingOverall) + TopReturnReasonsList + таблица 10 колонок с фото (`<img src={photoUrl}>` fallback на muted div), сортировка DESC по feedbacksTotal, empty state «Нет данных за выбранный период»
- **ManagerStatsTab.tsx** — summary cards (totalProcessedAll / avgResponseGlobal / AutoRepliesSummary) + таблица 10 колонок с Live badge «сегодня» (green-100/green-800) при isLive=true, approvalPct helper (`returnsApproved/returnsDecided*100`), сортировка DESC по totalProcessed
- **TopReturnReasonsList.tsx** — D-03 топ-10 причин с width bars (`width: (count/max)*100%` в bg-primary/70), empty state «Нет отклонённых возвратов за выбранный период»
- **AutoRepliesSummary.tsx** — D-02 одна карточка с Bot icon + большая цифра + «Автоответов за период»

### components/layout/nav-items.ts

- Импорт `BarChart3` из lucide-react добавлен между `Bot` и `UserCheck`
- NAV_ITEMS — новый entry `{ section: "SUPPORT", href: "/support/stats", label: "Статистика", icon: "BarChart3" }` между «Автоответ» и «Сотрудники»
- ICON_MAP — `BarChart3` добавлен в соответствующей позиции

### components/layout/section-titles.ts

Regex `/^\/support\/stats/ → "Статистика службы поддержки"` добавлен ПЕРЕД `/^\/support\/templates\/new/` (до общего `/^\/support/`) — порядок важен, специфичные регексы раньше общих.

### tests/support-stats-page.test.ts (переписан — 10 GREEN, было 4 it.skip + 1 smoke)

**8 тестов `parseStatsSearchParams`:**
1. happy path — все 6 полей корректно
2. fallback — пустой объект → `{tab: "products", period: "30d"}`
3. невалидный tab → fallback products (per-field salvage)
4. невалидный period → fallback 30d (per-field salvage)
5. nmId coerce string → int
6. array values → первый элемент (Next.js behavior)
7. негативный nmId → undefined (Zod int positive)
8. period=custom без dateFrom/dateTo → сохраняет period=custom с undefined dates

**2 smoke тестa integration с Plan 13-01:**
9. `lib/support-stats` экспортирует listProductsWithStats / listManagersWithStats / getTopReturnReasons / getAutoReplyCount
10. `lib/date-periods` экспортирует getPeriod + PERIOD_PRESETS=["7d","30d","quarter","custom"]

## Verification

- `npx tsc --noEmit` — clean (0 errors)
- `npm run build` — success, `/support/stats` в route list (1.8 kB first-load 104 kB)
- Route appears correctly: `ƒ /support/stats` (dynamic)

**Known env issue:** vitest локально не запускается из-за std-env ESM conflict (Phase 7 background issue). Тесты написаны корректно по паттернам Phase 9/10/12, прогонятся на VPS в Plan 13-03 deploy CI.

## Acceptance Criteria

- [x] /support/stats RSC рендерится c 2 табами (products/managers) и фильтром периода
- [x] D-10 RBAC: VIEW (не MANAGE) — `requireSection("SUPPORT")` без второго аргумента
- [x] D-05 квартал = календарный — подпись «Квартал (календарный)» в PeriodFilter
- [x] D-07 только числа и таблицы — без recharts/SVG, div bars в TopReturnReasonsList
- [x] D-02 AutoRepliesSummary — глобальный счётчик на табе «По менеджерам»
- [x] D-03 TopReturnReasonsList — глобально на табе «По товарам»
- [x] Sidebar: пункт «Статистика» с иконкой BarChart3 между «Автоответ» и «Сотрудники»
- [x] Header title `/support/stats` = «Статистика службы поддержки»
- [x] 10 GREEN тестов (требование 5+): 8 parseStatsSearchParams + 2 smoke Plan 13-01 imports
- [x] Все 4 оригинальных it.skip заменены (0 it.skip в файле)
- [x] tsc + build success

## Deviations from Plan

### Rule 3 (блокирующий фикс): Next.js 15 запрещает экспорты из Page

**Found during:** Task 2 `npm run build` verify
**Issue:** Page.tsx экспортировал `parseStatsSearchParams` (для тестов) — `Failed to compile: "parseStatsSearchParams" is not a valid Page export field` (Next.js 15 валидирует что Page файл экспортирует только `default`, `dynamic`, `metadata` и несколько других разрешённых полей).
**Fix:** Создан отдельный модуль `app/(dashboard)/support/stats/search-params.ts` с Zod schema + parseStatsSearchParams. Page.tsx импортирует из `./search-params`, тесты импортируют из `@/app/(dashboard)/support/stats/search-params`.
**Files modified:** app/(dashboard)/support/stats/page.tsx, tests/support-stats-page.test.ts, + создан app/(dashboard)/support/stats/search-params.ts
**Commit:** b633bf0 (Task 2 feat)

**Side-effect улучшение:** parseStatsSearchParams в плане использовал простой `searchParamsSchema.parse({tab: "products", period: "30d"})` при fail — это дропало ВСЕ поля при одном невалидном. Заменил на per-field salvage (извлечение `error.issues.path[0]`, удаление только проблемных полей) — тест «невалидный tab → fallback products» при `{tab: "invalid-tab", period: "30d"}` теперь корректно возвращает period=30d (а не default products/30d). Покрыто 4-м тестом.

## Known Limitations

- Таблицы ProductStatsTab + ManagerStatsTab без сортировки по колонкам (MVP — фиксированный DESC по primary metric). User может изменить порядок только через фильтры периода, не через clickable headers. Отложено до выделенной UX итерации.
- Без pagination — MVP рассчитан на ограниченный список 50-200 SKU + ≤10 менеджеров. При росте данных потребуется добавить pagination в listProductsWithStats / listManagersWithStats (Plan 13-01) + table offset/limit.
- Custom period без dateFrom/dateTo → silently fallback на 30d в page.tsx (при custom с undefined dates `getPeriod("30d")`). Это спасает от 500 на edge-случаях, но UX-wise лучше показывать hint «Укажите даты» — отложено.
- ProductStatsTab использует `<img src={photoUrl}>` с `/* eslint-disable-next-line @next/next/no-img-element */` — не использует Next Image (WB CDN не в `next.config.ts` remotePatterns, и не хотим тащить это на stats page). На 200 SKU render hit минимален.
- formatDuration дублируется в ProductStatsTab и ManagerStatsTab (9 строк × 2). Shared util отложен — функция тривиальная, локальность важнее DRY.

## Next

**Plan 13-03 — Cron + Deploy + UAT:**
- `/api/cron/support-stats-upsert` route — вызывает `computeManagerStatsForPeriod` для каждого пользователя SUPPORT, upsert в `ManagerSupportStats` с `unique (userId, period)`
- systemd timer `zoiten-support-stats.timer` 03:00 МСК ежедневно
- Применение Prisma миграции 20260418_phase13_statistics на VPS через `deploy.sh`
- Human UAT: руководитель открывает `/support/stats`, переключает табы + периоды, верифицирует данные на фоне реальной базы за неделю
- Заключительный milestone v1.1 complete

## Self-Check: PASSED

- [x] FOUND: app/(dashboard)/support/stats/page.tsx
- [x] FOUND: app/(dashboard)/support/stats/search-params.ts
- [x] FOUND: components/support/stats/StatsTabs.tsx
- [x] FOUND: components/support/stats/PeriodFilter.tsx
- [x] FOUND: components/support/stats/ProductStatsTab.tsx
- [x] FOUND: components/support/stats/ManagerStatsTab.tsx
- [x] FOUND: components/support/stats/TopReturnReasonsList.tsx
- [x] FOUND: components/support/stats/AutoRepliesSummary.tsx
- [x] FOUND commit: a9475fe (Task 1 — RSC page + PeriodFilter + StatsTabs + nav integration)
- [x] FOUND commit: b633bf0 (Task 2 — 4 RSC tab-content компонента + search-params.ts)
- [x] FOUND commit: b022b8b (Task 3 — 10 GREEN tests)
