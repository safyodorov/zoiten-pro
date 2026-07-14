# Phase 30 — Plan 11 Summary (Wave 4: сборка дашборда)

**Status:** ✅ executed (tsc чист; `next build` зелёный).

## Файлы
- `app/(dashboard)/analytics/runs/[id]/page.tsx` — RSC-контейнер: `parseNicheRunPayload` → `sortSkus` ОДИН раз → 5 вкладок; навигация tab/sort/metrics в URL; PARTIAL-пометка.
- `components/analytics/SortToggle.tsx` — переключатель сортировки (URL `sort`).
- `components/analytics/PdfExportButton.tsx` — `<a href=/api/analytics/runs/{id}/pdf?sort={активный}>` (порядок PDF = экран).
- `components/analytics/tabs/{OverviewTab,ListingTab,CharacteristicsTab}.tsx` — 3 простые вкладки (все 30 SKU, поля ТЗ §4).

## URL-параметры дашборда
- `tab` (overview[default]/listing/characteristics/card-stats/query-stats), `sort` (revenue[default]/clickToOrder), `metrics` (для CardStatsTab).

## Решения
- Единый порядок (ANL-06): `sortSkus(payload.skus, sort)` вызывается ОДИН раз в контейнере, отсортированный массив идёт во все вкладки И наследуется PDF-кнопкой (req.6/req.11).
- Не-готовый прогон (payload null) → экран статуса/ошибки. Sticky — сплошной bg-background/bg-muted.
- Фото — обычный `<img>` (basket-CDN; без next/image, чтобы не править next.config remotePatterns).
