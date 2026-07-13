# Phase 30 — Plan 04 Summary (Wave 2: парсер detail-JSON + топ-30)

**Status:** ✅ executed + verified (12/12 тестов зелёные; 0 новых tsc-ошибок в analytics/*).
**Executed:** 2026-07-13 (branch `gsd/phase-30-analytics`, local — no push/deploy).

## Файлы
- `lib/analytics/data.ts` — парсер/валидатор detail-JSON + извлечение топ-30 (PURE + zod, без prisma/сети).
- `tests/analytics-data.test.ts` — 12 тестов (реальная фикстура + синтетика для порогов/периода).

## Экспортируемые контракты (импортируют 30-07 коллектор, 30-08 upload-route)
- **`parseDetailFile(raw): ParsedDetail`** — валидирует один файл, извлекает `byDay: FunnelDayRaw[]`, `monthByNmId: Map<nmId, FunnelMonthTotals>`, нормализованный `commonParams`, период `dateFrom/dateTo`.
- **`mergeDetailFiles(files: ParsedDetail[]): number[]`** — кросс-файловая дедупликация nmID (throw на повторе).
- **`extractTop30(rawFiles: unknown[]): Top30Result`** — ГЛАВНЫЙ вход. `Top30Result = { skus: number[30], byDayByNmId, monthlyTotalsByNmId, commonParamsByNmId, dateFrom, dateTo }`.
- Типы: `ParsedDetail`, `CommonParamNormalized`, `Top30Result`; константы `REQUIRED_FILE_COUNT=6`, `REQUIRED_SKU_COUNT=30`.

## Ключевые решения (сверено с фикстурой Wave 0)
- **byDay/byMonth используют `nmID` (капс `ID`)**, commonParams — `nmId`. Учтено в схемах/маппинге.
- **Месячные тоталы = сумма ВСЕХ byMonth-строк per nmID.** В реальном файле окно 11.06–10.07 пересекает 2 календарных месяца → `byMonth` = [июнь-часть, июль-часть]. Подтверждено численно: **Σ(byMonth) === Σ(byDay)** (nmId 899301731 → viewCount 3051279, orders 1676). Значит суммирование byMonth устойчиво и к однумесячному, и к мультимесячному окну; движок 30-03 делит результат на константу 30.
- **commonParams нормализуются:** поля-объекты `{current, dynamics}` (feedbacksCount) схлопываются в число через `pickNumber`; строки — через `pickString`.
- **Единый период — строгое равенство окон** (Open Q#2, строгий вариант): любое расхождение dateFrom/dateTo между файлами → throw.
- **Явные throw вместо «тихой» деградации** (Pitfall #7/#8): нет byDay → «структура файла не распознана»; <6 файлов; <30 SKU (с фактическим числом); дубликат nmID (с номером); несовпадение периодов.

## Verification
- `npx vitest run tests/analytics-data.test.ts` → **12 passed**: фикстура→5 SKU; byMonth=Σ(byDay); commonParams норм.; нет byDay→throw; битая byDay-строка→throw; дедуп; 6 файлов→30 SKU + 30 monthly; 5 файлов→throw; период-mismatch→throw; 29 SKU→throw; кросс-дубликат→throw.
- `npx vitest run tests/analytics-engine.test.ts tests/analytics-data.test.ts` → 26 passed (engine 14 + data 12).
- `npx tsc --noEmit`: 0 ошибок в `lib/analytics/*` и `tests/analytics/*` (507 пред-существующих в старом коде — не связаны).

## Threat mitigations (из плана)
- **T-30-02** (nmID→URL SSRF-исток): `byDayRowSchema.nmID = z.number().int().positive()` — единственный доверенный источник nmID для 30-06.
- **T-30-09** (структура detail-JSON): zod + явный guard отклоняют неизвестную структуру читаемым сообщением.

## Downstream unblocked
- **30-07** (collector): `extractTop30` даёт состав ниши + byDay + monthlyTotals + commonParams → `aggregateFunnel(byDay, monthly)` (30-03) → `SkuPayload`.
- **30-08** (upload-route): валидирует 6 файлов через `extractTop30`, ошибки → 4xx с сообщением.
- Полный прогон требует все 6 реальных «Сравнение карточек» файлов (сейчас 1 — достаточно для этого теста; синтетика покрывает 6-файловые пороги).
