# Phase 30 — Plan 08 Summary (Wave 4: API/оркестрация)

**Status:** ✅ executed (tsc чист по файлам; `next build` зелёный).
**Executed:** 2026-07-13 (branch `gsd/phase-30-analytics`).

## Файлы
- `app/api/analytics/upload/route.ts` — POST: 6 файлов → превью 30 SKU + wire-данные (VIEW).
- `app/actions/analytics.ts` — startNicheRun (after()), saveMpstatsToken, markNicheRunFailed (MANAGE).
- `app/api/analytics/runs/[id]/status/route.ts` — GET статус для polling (VIEW).
- (доп.) `lib/analytics/data.ts` += `NicheRunWireData` / `serializeTop30` / `deserializeWireData`.

## Контракты (потребляет UI 30-09)
- **upload-ответ:** `{ ok, preview: [{nmId,brand,mainPhoto,name}×30], dateFrom, dateTo, data: NicheRunWireData }`. Ошибка → 400 с текстом из data.ts.
- **startNicheRun(wire): {ok, runId?, error?}** — MANAGE; блокирует при активном PENDING/COLLECTING (T-30-04) и при пустом токене; создаёт NicheRun(PENDING); `after(() => collectNicheRun(...))`.
- **status-ответ:** `{status, progressNote, incompleteSkus, errorMessage, updatedAt}` (без payloadJson).

## Решения
- Поток upload→client→startNicheRun через wire-формат (Map→record). Re-валидация nmID диапазона в startNicheRun zod (T-30-02: клиентские nmID не доверяются).
- Размер файла ≤5МБ проверяется ДО JSON.parse (T-30-03).
- `after` из `next/server` (Next 15.5) — фоновый сбор не блокирует HTTP-ответ (D-02).
- Токен читается из `AppSetting.analytics.mpstatsToken`; upsert по key (D-01).
