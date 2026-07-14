# Phase 30 — Plan 12 Summary (Wave 4: PDF-выгрузка)

**Status:** ✅ executed + verified (3/3 vitest; tsc чист; `next build` зелёный).

## Файлы
- `lib/analytics/pdf.ts` → `renderNicheRunPdf(payload, sortMode): Promise<Buffer>`, `orderSkusForPdf`.
- `app/api/analytics/runs/[id]/pdf/route.ts` → GET (VIEW), `?sort=revenue|clickToOrder`, `application/pdf` attachment.
- `tests/analytics-pdf.test.ts` — 3 теста (magic bytes %PDF, порядок=sortSkus, <2 точек не падает).

## Решения
- pdfkit + sharp (оба в проекте, новых пакетов нет). Графики — примитивы moveTo/lineTo/stroke (без чарт-либ/headless).
- Кириллица: системный DejaVuSans (`/usr/share/fonts/truetype/dejavu/`, есть на VPS) + fallback Helvetica (локально глифы неверные, но без падения — тест проходит по magic-bytes; прод рендерит корректно).
- Порядок = `sortSkus(payload.skus, sortMode)`; PDF-кнопка (30-11) передаёт активный `?sort=` → порядок PDF = экран (req.6/req.11).
- Секция (a) сводная таблица 30 строк (#, артикул, бренд, выручка/мес, клик→заказ); (b) по-SKU блок: заголовок+продавец+рейтинг, ≤5 фото (fetch+compressToBudget), график цены + 2 графика конверсий.
- Фото best-effort: сетевой сбой/декод → пропуск (T-30-14 compressToBudget ограничивает байт-бюджет).
