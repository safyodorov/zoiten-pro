# Phase 30 — Plan 07 Summary (Wave 3: снапшот + коллектор)

**Status:** ✅ executed + verified (snapshot 4/4 тестов; collector grep-гейт + tsc чист; весь analytics-набор 47/47).
**Executed:** 2026-07-13 (branch `gsd/phase-30-analytics`, local — no push/deploy).

## Файлы
- `lib/analytics/snapshot.ts` — buildNicheRunPayload/parseNicheRunPayload (PURE, version-guard по образцу finance-weekly).
- `lib/analytics/collector.ts` — collectNicheRun (оркестратор + статус-машина + правило полноты; импортирует prisma).
- `tests/analytics-snapshot.test.ts` — 4 теста (build/parse round-trip, version-guard, null-fallback).
- (доп.) `lib/analytics/wb-card-scan.ts` — `scanCardMedia` теперь возвращает и `seller` (supplier_id из card.json, аддитивно); тест 30-06 расширен проверкой seller="114151".

## Экспортируемые контракты (импортируют 30-08 startNicheRun, 30-11/30-12 рендер)
- **`collectNicheRun(runId, input: CollectNicheRunInput): Promise<void>`** — фоновый сбор. `CollectNicheRunInput = { skus, byDayByNmId, monthlyTotalsByNmId, commonParamsByNmId, dateFrom, dateTo, mpstatsToken }` (ровно то, что даёт `extractTop30` из 30-04 + токен из AppSetting).
- **`buildNicheRunPayload(skus, dateFrom, dateTo): NicheRunPayload`**, **`parseNicheRunPayload(json): NicheRunPayload | null`** (version-guard).

## Ключевые решения
- **Статус-машина (D-02):** COLLECTING (сразу, + skuCount) → per-SKU сбор c обновлением `progressNote` («MPSTATS Y/30, карточки Z/30») → READY | PARTIAL | FAILED.
- **verifyPricesBatch — ОДИН вызов ВНЕ цикла** на все 30 nmId (T-30-16). Проверено grep: нет `for/map(...verifyPricesBatch)`.
- **MPSTATS — 1 вызов/SKU** (`fetchNicheQueries` уже несёт days: PositionDay[] + avgPosition per запрос; `fetchPositions` НЕ дёргаем отдельно — иначе 2×лимит). `MpstatsRateLimitError`/любая ошибка SKU ловится → SKU без позиций, прогон НЕ падает (T-30-04).
- **Воронка:** `aggregateFunnel(byDay, monthlyTotals)` — объёмы месяц÷30; `revenue = monthly.ordersSum ?? Σ(byDay.ordersSum)` (ранжирование ANL-06); `priceDays = medianPrice × 0.97`.
- **Цена/рейтинг ПЕРВИЧНО из detail-JSON (D-04):** `rating = cp.nmRating ?? verify.rating`, `feedbacksCount = cp.feedbacksCount ?? verify.feedbacks`. verifyPricesBatch — сверка/fallback.
- **Правило полноты (ANL-07):** `complete = hasFunnel && hasPhotos && hasCharacteristics && hasPositions`. `evaluateCompleteness` (30-03) ранжирует по выручке: сбой в топ-10 → **FAILED** (payloadJson НЕ пишется, errorMessage = проблемные топ-10); в 11–30 → **PARTIAL** (payload + incompleteSkus [{nmId, reason}]); иначе **READY**.
- **Иммутабельность (ANL-05):** payloadJson = `NicheRunPayload` (version=1); повторный прогон = новая запись NicheRun. Обёрнутый top-level try/catch → непредвиденный сбой = FAILED без снапшота.
- Prisma-клиент регенерирован локально (`npx prisma generate`) для типизации `prisma.nicheRun` — БД/миграция НЕ применялись.

## Verification
- `npx vitest run tests/analytics-snapshot.test.ts` → **4 passed** (round-trip; version=999→null; {}/null/[]/строка/skus не массив → null).
- collector grep-гейт: collectNicheRun ✓, evaluateCompleteness ✓, verifyPricesBatch ✓ (не в цикле ✓), MpstatsRateLimitError/catch ✓, COLLECTING ✓.
- `npx tsc --noEmit` → 0 ошибок в analytics/* (включая collector).
- Полный analytics-набор (engine+data+mpstats+card-scan+snapshot) → **47 passed**.

## Downstream unblocked
- **30-08** (API): `startNicheRun` — валидирует 6 файлов через `extractTop30`, создаёт NicheRun (PENDING), читает токен из AppSetting, вызывает `collectNicheRun` через `after()`; polling читает status/progressNote; результат рендерится из `parseNicheRunPayload`.
- **30-11/30-12** (рендер/PDF): читают снапшот через `parseNicheRunPayload` → 5 вкладок + PDF.

## Осталось в фазе (нужен запущенный app + БД + все 6 detail-файлов)
30-08 (API-роуты + after()), 30-09/10/11 (UI: шапка/токен, вкладки, дашборд/сортировка), 30-12 (PDF), 30-13 (RBAC-обвязка). Эти волны требуют интеграционной проверки в рантайме — не покрываются одними vitest-юнитами.
