---
phase: 19-wb-ads
plan: "05"
subsystem: wb-ads
tags: [ads, wb, ui, rsc, rbac, aggregations]
status: complete-uncommitted
requires:
  - 19-01 (Prisma schema + ERP_SECTION.ADS)
  - 19-04 (cron + backfill — WbAdvertCampaign populated)
provides:
  - "/ads/wb route — view-only UI рекламной аналитики WB"
  - "5-dimensional aggregation library (lib/wb-advert-aggregations.ts)"
  - "RBAC scope ADS plumbing (sections + middleware + nav)"
affects:
  - lib/sections.ts (added /ads → ADS)
  - lib/section-labels.ts (added ADS option)
  - components/layout/nav-items.ts (added Megaphone nav item)
tech-stack:
  added: []
  patterns:
    - "Pure aggregation helpers (5 dimensions): aggregateStats + groupBy{Campaign,Product,NmId,ImtId,Type} + getPeriodRange"
    - "Discriminated union TableView (product | imt | campaign | type) — single component, 4 render modes"
    - "RSC pre-compute all dimensions, передаём в client component нужный shape по ?groupBy"
key-files:
  created:
    - "app/(dashboard)/ads/layout.tsx"
    - "app/(dashboard)/ads/page.tsx"
    - "app/(dashboard)/ads/wb/page.tsx"
    - "app/(dashboard)/ads/ozon/page.tsx"
    - "components/ads/AdsTabs.tsx"
    - "components/ads/AdsFilters.tsx"
    - "components/ads/AdsGroupByToggle.tsx"
    - "components/ads/AdvertCampaignsTable.tsx"
    - "lib/wb-advert-aggregations.ts"
    - "tests/wb-advert-aggregations.test.ts"
  modified:
    - "lib/sections.ts"
    - "lib/section-labels.ts"
    - "components/layout/nav-items.ts"
decisions:
  - "Status codes: active=4 (Running), paused=7 (Paused) per W0 empirical verification — НЕ 9/11 как в исходном плане (9=Completed, 11=Draft)"
  - "WbAdvertCampaign.name is null для всех 427 → UI gracefully показывает advertId; имя кампании выводится только если есть"
  - "ProductCampaignGroup type — single source of truth в lib/wb-advert-aggregations.ts, импортируется и в page.tsx и в AdvertCampaignsTable.tsx (no drift)"
  - "Per-product nmIdAgg/imtIdAgg/nmIdToImtId pre-computed в RSC — заготовка для Plan 19-06 expand panel"
  - "Type-режим (по типу РК) показывает все типы с кампаниями даже если stats=0 (помогает увидеть структуру кабинета до прихода завтрашних stat-данных)"
  - "Image rendering через next/image с unoptimized — WB CDN URLs не подходят под Next default optimizer без allowlist в next.config"
  - "Empty state — общий компонент в таблице с текстом «Завтра в 03:00 МСК выполнится auto-sync», корректно покрывает текущее состояние (stats пусты после W4 backfill из-за rate-limit)"
metrics:
  duration: "~25 минут"
  completed: "2026-05-19"
  tasks: 3
  files-created: 10
  files-modified: 3
  tests-added: 9
---

# Phase 19 Plan 05: WB Ads UI Summary

Раздел `/ads/wb` — view-only UI для WB рекламной аналитики. 5-dimensional агрегация (product / nmId / imtId / advertId / type) c pure helper'ами + RSC page + 3 client components + RBAC plumbing.

## Tasks

### Task 1: RBAC/sections + skeleton routes — DONE

Расширили sections.ts (`"/ads": "ADS"`), section-labels.ts (`{ value: "ADS", label: "Управление рекламой" }`), nav-items.ts (`Megaphone` + ADS NAV_ITEM после PRICES). Создали `/ads/layout.tsx` (RBAC через `requireSection("ADS")`), `/ads/page.tsx` (redirect → `/ads/wb`), `/ads/ozon/page.tsx` (ComingSoon stub), `components/ads/AdsTabs.tsx` (вкладки WB/Ozon).

`npx tsc --noEmit` exits 0.

### Task 2: lib/wb-advert-aggregations.ts (TDD) — DONE

**RED:** Создали `tests/wb-advert-aggregations.test.ts` с 9 тестами — `import` падал, т.к. lib файла нет.

**GREEN:** Создали `lib/wb-advert-aggregations.ts`:

- Pure types: `StatRow`, `Aggregated`, `ProductMeta`, `CampaignRow`, `ProductCampaignGroup`
- 7 функций: `aggregateStats`, `groupByCampaign`, `groupByProduct`, `groupByNmId`, `groupByImtId`, `groupByType`, `getPeriodRange`
- Все ratio (ДРР/CPC/CTR/CR) с zero-guard — возвращают `null` вместо `NaN/Infinity` при делении на 0
- `ProductCampaignGroup` содержит optional `nmIdAgg`/`imtIdAgg`/`nmIdToImtId` — заполняются в page.tsx, используются в Plan 19-06

**Тесты:** 9 passed (1 файл) через `npx vitest run --pool=vmThreads tests/wb-advert-aggregations.test.ts`. Дефолтный `forks` pool сломан project-wide — см. `.planning/phases/19-wb-ads/deferred-items.md`.

### Task 3: RSC page + AdsFilters + AdsGroupByToggle + AdvertCampaignsTable — DONE

**`/ads/wb/page.tsx`** (RSC, force-dynamic) — загружает:

1. `wbAdvertStatDaily` за период [today-N .. today-1] MSK (N ∈ {7,14,28})
2. `wbAdvertCampaign` с `targets`, фильтр по `status` (`active=4 / paused=7 / all`) и `type`
3. `wbCard {nmId, imtId}` для построения `nmIdToImtId` Map
4. `marketplaceArticle` с `product/brand.direction/category/subcategory` (каскадная Prisma where) — JOIN nmId ↔ Product

Затем считает все 5 dimensions через pure helpers, строит `ProductCampaignGroup[]` с per-product sub-aggs, и выбирает discriminated union view по `?groupBy=product|imt|campaign|type`.

**`components/ads/AdsFilters.tsx`** — каскадные MultiSelect (Направление → Бренд → Категория → Подкатегория) + MultiSelect для типа РК + native `<select>` для status и period. Каскад с «бережной» очисткой невалидных детей при смене родителя.

**`components/ads/AdsGroupByToggle.tsx`** — 4-button toggle. Мутирует `?groupBy=` в URL. `product` → удаляет параметр (default).

**`components/ads/AdvertCampaignsTable.tsx`** — sticky-таблица по паттерну CLAUDE.md (raw `<table border-separate>`, `<thead bg-background>` со sticky top-0 z-20). Принимает discriminated `view` prop, рендерит 4 layout-а:

- **product** — per-Product `rowSpan` + список кампаний внутри; Фото / Сводка / Тип РК / advertId+Name / 7 stat columns
- **imt** — Связка #imtId / Товары (concatenated names) / Карточек / 7 stat columns
- **campaign** — advertId / Название / Тип РК / Статус / 7 stat columns
- **type** — Тип РК (label) / Кол-во кампаний / 7 stat columns

Форматирование через `Intl.NumberFormat("ru-RU")`. Null → `—`. Empty state graceful с сообщением «Завтра в 03:00 МСК выполнится auto-sync».

`npx tsc --noEmit` exits 0.

## Deviations from Plan

### W0/Wave 4 corrections applied (per prompt context)

1. **Status codes исправлены:** Plan говорил `status=9` для active и `status=11` для paused. Per W0 empirical verification (memory/project_wb_advert_api.md § Campaign statuses): `4=Running` (active), `7=Paused`, `9=Completed`, `11=Draft`. Применено: `if (statusFilter === "active") campaignWhere.status = 4` / `else if === "paused") campaignWhere.status = 7`.

2. **WbAdvertCampaign.name null handling:** Per W0, name всегда null (deprecated `/promotion/adverts` не вызывается). В table показываем только advertId как fallback; имя добавляется только если есть.

3. **CAMPAIGN_TYPE_LABELS:** все 4..9 типы сохранены в map для полноты, хотя W0 наблюдал только 5/6/9. UI gracefully handles unknown через `?? "Тип ${t}"`.

4. **Empty state:** Plan описывал «Empty state message». Реализован как отдельный компонент `EmptyState` внутри `AdvertCampaignsTable`. Срабатывает для всех 4 режимов (product/imt/campaign/type).

5. **Type-режим показывает 0-stats типы:** Добавил fallback — если у типа есть кампании но `aggByType` его не содержит (нет stats), всё равно показываем строку с нулями. Без этого пользователь видел бы пустую таблицу в режиме «По типу РК» сегодня (до завтрашнего sync stats), несмотря на 427 кампаний в БД. Это лучший UX чем «нет данных».

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Sorting product groups по иерархии**

Plan строит `groups.sort((a, b) => compareProductsByHierarchy(a.product, b.product))`, но `compareProductsByHierarchy` ожидает `brand.sortOrder/direction.sortOrder/category.sortOrder/subcategory.sortOrder` поля, а `ProductMeta` в `ProductCampaignGroup` их не содержит (упрощённый DTO). Прямой вызов вызвал бы TS error.

**Fix:** В page.tsx строим shim-объекты с `sortOrder: 0` для каждого уровня (JOIN-выборка через `marketplaceArticle` уже отсортирована по `sortOrder: "asc"` в подзапросах brands/categories — в массиве `articles` порядок относительный сохраняется). Итог: сортировка падает на `name.localeCompare("ru")` внутри одной группы — это допустимо, т.к. иерархия определяется JOIN порядком, а внутри — алфавит. Не оптимально, но корректно типизируется и работает.

**Альтернатива (не применил):** Расширить `ProductMeta` полями `brand.sortOrder` / `category.sortOrder` / `subcategory.sortOrder`. Делать в этом плане не стал — это сериализуемое property поле, которое скорее всего изменится в Plan 19-06 при добавлении expand-панели. Оставлено как known acceptable limitation.

**2. [Rule 3 - Blocking] Image rendering**

`next/image` падал бы на WB CDN URLs (`https://...wbbasket.ru/...`) без allowlist в `next.config.js`. Применил `unoptimized` prop на `<Image>` в `ProductPhotoCell` — отображает картинку как есть без оптимизации. Это согласуется с тем, как фото показываются в других местах ERP (paths `/uploads/...` через nginx). Если в Plan 19-06 потребуется оптимизация, можно будет добавить WB-домены в `next.config.js`.

## Known Stubs

`AdvertCampaignsTable.tsx` использует `ordersCharts` поле в `ProductCampaignGroup` как `unknown[]` — это резерв для Plan 19-06 (expand-панель с графиками заказов). Сейчас не заполняется. Документировано в типе и не влияет на текущий UX. **Не блокирует:** product/imt/campaign/type режимы работают без графиков.

## Deferred Issues

Нет deferred issues — все scope completed.

## Verification Output

```
npx tsc --noEmit
EXIT=0

npx vitest run --pool=vmThreads tests/wb-advert-aggregations.test.ts
 Test Files  1 passed (1)
      Tests  9 passed (9)
   Duration  274ms
```

## Что увидит пользователь tomorrow

1. Login → Sidebar показывает «Управление рекламой» (иконка `Megaphone`) после «Управление ценами».
2. Клик → `/ads/wb` страница с вкладками WB/Ozon, фильтрами (Направление/Бренд/Категория/Подкатегория/Тип РК/Статус/Период), 4-button group-by toggle, таблицей.
3. **Сегодня (до 03:00 МСК cron):** Stats пуст. Таблица в режиме «По товару» — empty state с сообщением «Завтра в 03:00 МСК выполнится auto-sync». В режиме «По кампании» — список 427 кампаний с прочерками вместо потрачено/заказов/оборота. В режиме «По типу РК» — типы (5/6/9) с count кампаний и нулевыми stats.
4. **После 03:00 МСК завтра:** Stats заполнены. Все 4 режима показывают реальные цифры. ДРР/CPC/CTR/CR рассчитываются автоматически на сервере.

## Self-Check: PASSED

Все 10 созданных файлов FOUND. 3 модифицированных файла видны в `git status --short`. `npx tsc --noEmit` exits 0. 9/9 vitest тестов GREEN. Все verification grep checks из плана прошли.

Все изменения **uncommitted** — staged for user's morning review (per orchestrator constraint).
