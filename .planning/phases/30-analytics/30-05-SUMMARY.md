# Phase 30 — Plan 05 Summary (Wave 2: MPSTATS-клиент)

**Status:** ✅ executed + verified (8/8 тестов зелёные; 0 tsc-ошибок в analytics/*; 0 импортов prisma).
**Executed:** 2026-07-13 (branch `gsd/phase-30-analytics`, local — no push/deploy).

## Файлы
- `lib/analytics/mpstats.ts` — MPSTATS-клиент (DI-friendly, токен параметром).
- `tests/analytics-mpstats.test.ts` — 8 контрактных тестов на моках (vi.stubGlobal) в форме Wave 0.

## Экспортируемые контракты (импортирует коллектор 30-07)
- **`fetchNicheQueries(nmId, d1, d2, token, fetchImpl?): Promise<QueryPositionSeries[]>`** — список запросов ниши по SKU, фильтр `frequency > 500`. ГЛАВНЫЙ метод для вкладки «Статистика запросов».
- **`fetchPositions(nmId, d1, d2, token, fetchImpl?): Promise<PositionDay[]>`** — дневной ряд позиций по самому частотному (основному) запросу SKU; [] если запросов нет.
- **`mapWordsToSeries(raw): QueryPositionSeries[]`** — PURE-маппер words→серии (organic/ad + avgPosition), экспортирован для тестов/склейки.
- **`MpstatsRateLimitError`** — 429 → этот тип (не generic), коллектор ловит и деградирует по правилу полноты.
- Утилиты/константы: `buildByKeywordsPath`, `MPSTATS_BASE="https://mpstats.io/api/wb"`, `MIN_QUERY_FREQUENCY=500`.

## Ключевые решения (по подтверждённому Wave 0, не по догадке)
- **Один вызов `GET /get/item/{nmId}/by_keywords?d1&d2` покрывает и позиции, и запросы.** Оба метода бьют этот эндпоинт; окно = период файлов (d1/d2 в URL — тест проверяет).
- **organic:** `organic_pos[i] > 0` → значение, иначе `null` (0 = нет в органике; не штрафует avgPosition — ANL-10, через `averagePositionByQuery` из engine).
- **ad:** из `auto[i] = [cpm, ?, ad_type, position]`. `position ≤ 0` → рекламы нет (null). `AdPosition = {position, cpm, placementType=ad_type, boostPosition=position}`.
- **frequency = `wb_count`**; фильтр строгий `> 500`.
- **Токен** — только параметр (DI), НЕ читает БД, НЕ логируется (T-30-01). `fetchImpl?` default global fetch — тесты подменяют `vi.stubGlobal`.
- **429 → `MpstatsRateLimitError`** без падения (T-30-04); прочий !ok → `Error("MPSTATS {status}: {body}")`.
- **Пагинация не требуется:** Wave 0 подтвердил ≤200 запросов на вызов — достаточно для топа ниши после фильтра >500.

## Verification
- `npx vitest run tests/analytics-mpstats.test.ts` → **8 passed**: organic/ad разделение; avgPosition игнорит null; фильтр 400→убран/600→оставлен; заголовок X-Mpstats-TOKEN + d1/d2 в URL; fetchPositions headline-серия; 429→MpstatsRateLimitError; 500→generic Error; buildByKeywordsPath.
- `grep -c X-Mpstats-TOKEN lib/analytics/mpstats.ts` = 2 (≥1 ✓); `grep -c prisma` = 0 ✓.
- Полный analytics-набор (engine+data+mpstats) → 34 passed; tsc 0 ошибок в analytics/*.

## Downstream unblocked
- **30-07** (collector): по каждому SKU `fetchNicheQueries(nmId, dateFrom, dateTo, token)` → `SkuPayload.queries`; ловит `MpstatsRateLimitError` → помечает SKU incomplete → `evaluateCompleteness` (30-03) решает FAILED/PARTIAL.
- Живой прогон требует реальный токен из `AppSetting.analytics.mpstatsToken` (D-01, вводится в UI 30-09) — здесь клиент проверен на моках, без расхода лимита тарифа.
