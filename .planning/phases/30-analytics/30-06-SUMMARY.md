# Phase 30 — Plan 06 Summary (Wave 2: скан карточек basket-CDN)

**Status:** ✅ executed + verified (9/9 тестов; 0 tsc-ошибок в analytics/*; реюз wb-api подтверждён grep; 0 нового транспорта).
**Executed:** 2026-07-13 (branch `gsd/phase-30-analytics`, local — no push/deploy).

## Файлы
- `lib/analytics/wb-card-scan.ts` — scanCardMedia (card.json фото+характеристики) + verifyPricesBatch (батч-сверка).
- `tests/analytics-wb-card-scan.test.ts` — 9 тестов на реальной фикстуре card.json + мок транспорта/wb-api.
- `tests/fixtures/analytics-card-sample.json` — реальный card.json (nmId 899301731, вытянут curl'ом в Wave 2, 9766 байт).

## Экспортируемые контракты (импортирует коллектор 30-07)
- **`scanCardMedia(nmId, mainPhoto?, fetchImpl?): Promise<{listingPhotos: string[], characteristics: Characteristic[]}>`** — вызывается PER-SKU. host первично из mainPhoto, при 404 — соседние шарды. Полный провал → throw (коллектор → incomplete).
- **`verifyPricesBatch(nmIds: number[]): Promise<Map<number, PriceVerification>>`** — вызывается ОДИН раз на все 30. `PriceVerification = {sppDiscount?, rating?, feedbacks?}`. Best-effort сверка.
- **`cardJsonUrl(nmId, host?)`**, **`basketHostForVol(vol)`**, константы `LISTING_PHOTO_LIMIT=5`.

## Ключевые решения (по Wave 0 §2 — реальный card.json)
- **card.json поля подтверждены на реальном файле:** `media.photo_count` (18), `options[{name,value,charc_type?}]` (24), `grouped_options[{group_name, options[]}]`, `selling.{brand_name,supplier_id}`, `subj_name`.
- **host первично из `mainPhoto`** (authoritative, Wave 0) — снимает дрейф vol→host карты (Pitfall #4). Карта `BASKET_RANGES` (срез 2026-07-13, vol 8993→basket-39 подтверждён) — только fallback когда mainPhoto нет.
- **404-fallback (T-30-10):** порядок кандидатов host → соседи ±1, ±2 (проверено вживую: basket-38/40 = 404, basket-39 = 200).
- **Фото листинга:** `.../images/c516x688/{1..min(5,photo_count)}.webp` (все размеры отдают 200; вживую проверено).
- **Характеристики:** плоский `options`, fallback — flatten `grouped_options`.
- **Анти-SSRF (T-30-02):** `assertValidNmId` (положит. целое < 2^31) до построения любого URL. nmID — только из провалидированного detail-JSON (30-04).
- **T-30-16 (WB Statistics-API rate-limit):** verifyPricesBatch — ОДИН `fetchWbDiscounts(nmIds, undefined, storefrontOut)` на весь массив (внутренне ≤20/запрос → 30 = 2 curl-батча). НЕ per-SKU, при сбое v4 — best-effort пустой результат БЕЗ per-SKU ретраев / Sales-API. Цена/рейтинг первичны из detail-JSON (D-04) — это лишь сверка. Нового транспорта к card.wb.ru НЕ добавлено (реюз lib/wb-api.ts).

## Verification
- `npx vitest run tests/analytics-wb-card-scan.test.ts` → **9 passed**: cardJsonUrl (+SSRF throws на -1/2^31/1.5/NaN); scanCardMedia фикстура→5 фото+характеристики; 404→сосед; все-404→throw; grouped_options fallback; verifyPricesBatch 1 вызов на 30 (spy), reject→пустая Map без ретраев.
- Grep-гейт: `wb-api` refs=2 (≥1 ✓); нет per-SKU цикла вокруг fetchWbDiscounts ✓; `execSync|child_process|curl`=0 ✓.
- Полный analytics-набор (engine+data+mpstats+card-scan) → 43 passed; tsc 0 ошибок в analytics/*.

## Downstream unblocked
- **30-07** (collector): per-SKU `scanCardMedia(nmId, commonParams.mainPhoto)` → `SkuPayload.{listingPhotos, characteristics}`; ОДИН `verifyPricesBatch(all30)` → сверка. Провал scanCardMedia на SKU → incomplete → `evaluateCompleteness`.
