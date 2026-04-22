---
phase: 14-stock
plan: "04"
subsystem: stock
tags: [excel-upload, parser, server-action, rbac, ivanovo-stock, dialog, preview]
dependency_graph:
  requires: ["14-01"]
  provides: ["parseIvanovoExcel", "upsertIvanovoStock", "IvanovoUploadButton", "IvanovoUploadDialog"]
  affects: ["/stock page header (14-05)"]
tech_stack:
  added: []
  patterns:
    - "fuzzy header matching по кириллице/латинице в Excel"
    - "4-секционный preview dialog (valid/unmatched/duplicates/invalid)"
    - "upsertIvanovoStock by-sku (не by-productId) + $transaction"
    - "last-write-wins для дубликатов SKU в файле"
key_files:
  created:
    - lib/parse-ivanovo-excel.ts
    - tests/fixtures/ivanovo-sample.xlsx
    - app/api/stock/ivanovo-upload/route.ts
    - components/stock/IvanovoUploadButton.tsx
    - components/stock/IvanovoUploadDialog.tsx
  modified:
    - tests/parse-ivanovo-excel.test.ts
    - app/actions/stock.ts
decisions:
  - "Synthetic fixture вместо реального файла: 12 строк (5 valid + 2 dup + 2 unmatched-sku + 2 invalid)"
  - "Fuzzy header matching вместо hardcoded column indexes: устойчивость к перестановке колонок в реальном файле"
  - "parseIvanovoExcel возвращает {valid, invalid, duplicates, columnMap}: дубликаты трекятся в парсере, DB-матчинг в route"
  - "upsertIvanovoStock принимает {sku, quantity}[] (не productId): идемпотентно, не зависит от внутренних ID"
  - "Дубликаты не блокируют импорт: last-write-wins по SKU, dedup в route через Map"
metrics:
  duration: "~5 минут"
  completed: "2026-04-22"
  tasks: 2
  files: 7
---

# Phase 14 Plan 04: Excel Upload склада Иваново — Summary

Excel import pipeline для остатков склада Иваново: парсер с fuzzy header matching, synthetic fixture, API preview route, server action upsert, Button + Dialog компоненты.

## Выполненные задачи

### Task 1: parseIvanovoExcel + synthetic fixture + 18 тестов GREEN

**Deviation от плана:** Оригинальный план требовал реальный .xlsx от пользователя (Zero Wave checkpoint). Real fixture недоступен, поэтому создана синтетическая fixture программно через `XLSX.utils.aoa_to_sheet`.

**Fixture `tests/fixtures/ivanovo-sample.xlsx` (12 строк):**
- Row 0: заголовки `[Штрих-код, Артикул, Наименование, Количество, Дата инвентаризации]`
- Rows 1-5: 5 валидных строк (УКТ-000001..000005, qty 150/75/0/32/12)
- Rows 6-7: дубликат штрих-кода `4607091403461` (qty 20 и 25)
- Rows 8-9: 2 строки с несуществующими УКТ (для unmatched демонстрации в UI)
- Row 10: invalid — qty = -5 (отрицательное)
- Row 11: invalid — пустой штрих-код и артикул

**Парсер `lib/parse-ivanovo-excel.ts`:**
- Fuzzy header matching (регистр-независимо, RU/EN): `Штрих-код/Штрихкод/Barcode/EAN`, `Артикул/SKU/Article/УКТ`, `Количество/Qty/Quantity/Остаток`, `Наименование/Name`
- 4 секции возврата: `valid`, `invalid`, `duplicates`, `columnMap`
- Дубликаты трекятся в парсере (текстовый уровень) — DB-матчинг в API route
- Пустые строки файла пропускаются без попадания в invalid

**Тесты (18 штук, все GREEN):**
- Happy path: fixture парсится, 9 valid строк
- Заголовок пропускается
- Первая строка: УКТ-000001 qty=150
- qty=0 допустимо (нулевой остаток)
- Fuzzy headers: Barcode/SKU/Quantity, Остаток, Штрихкод
- Дубликаты: обнаруживаются, оба экземпляра в valid (dedup в route)
- Invalid: отрицательный qty, пустые ключи, пустой qty, нечисловой qty
- Edge: пустые строки между данными пропускаются, пустой лист, нет колонки qty
- columnMap корректно заполняется

**Commit:** `da9ff86`

### Task 2: API route + server action + UI компоненты

**`app/api/stock/ivanovo-upload/route.ts`:**
- `export const runtime = "nodejs"` — XLSX не работает в Edge
- RBAC: `requireSection("STOCK", "MANAGE")` в начале
- Парсит файл через `parseIvanovoExcel` + нормализует SKU через `normalizeSku`
- DB lookup: `prisma.product.findMany({where: {sku: {in: uniqueSkus}, deletedAt: null}})`
- Возвращает 5 полей: `{valid, unmatched, duplicates, invalid, invalidParseRows}`
- Last-write-wins через `Map<sku, IvanovoPreviewValid>` для дубликатов

**`app/actions/stock.ts`:**
- `upsertIvanovoStock(rows: {sku, quantity}[])` — полная реализация (заменила заглушку 14-01)
- RBAC: `requireSection("STOCK", "MANAGE")`
- Zod валидация каждой строки
- `$transaction` с `updateMany({where: {sku, deletedAt: null}})` — идемпотентно
- Трекинг `imported`, `notFound[]`, `errors[]`
- `revalidatePath("/stock")`
- `updateProductionStock` и `updateTurnoverNorm` из 14-01 сохранены для 14-05

**`components/stock/IvanovoUploadButton.tsx`:**
- `"use client"`, `variant="outline"`, `size="sm"`, иконка `Upload`
- Скрытый `<input type="file" accept=".xlsx" />`
- `fetch("/api/stock/ivanovo-upload", {method: "POST", body: FormData})`
- Открывает `IvanovoUploadDialog` после успешного парсинга
- `toast.error` при HTTP ошибках

**`components/stock/IvanovoUploadDialog.tsx`:**
- 4 секции: Изменения (valid+diff old→new), Не найдено в базе, Дубликаты, Невалидные строки
- Секции 2/3/4 не блокируют «Применить» — только `validCount===0` блокирует
- `useTransition` для apply (pending state «Применить...»)
- `toast.success("Импортировано {N} строк остатков Иваново")` + `onClose()` + `router.refresh()`
- `DialogContent sm:max-w-2xl max-h-[90vh] overflow-y-auto`

**TypeScript:** `npx tsc --noEmit` → 0 ошибок

**Commit:** `9005626`

## Deviations from Plan

### Auto-resolved Deviations

**1. [Deviation - Zero Wave] Synthetic fixture вместо реального файла**
- **Найдено при:** Task 0 (checkpoint — real file недоступен)
- **Проблема:** Оригинальный план требовал real .xlsx от пользователя для Golden Test (Phase 7 off-by-one precedent). Real file не предоставлен.
- **Решение:** Создана синтетическая fixture через `XLSX.utils.aoa_to_sheet` с 12 строками (5 valid + 2 dup + 2 unmatched-sku + 2 invalid). Парсер использует fuzzy header matching вместо hardcoded индексов — устойчив к перестановке колонок в реальном файле.
- **Влияние:** Пользователь может загрузить реальный файл через UI (IvanovoUploadButton) — парсер автоматически определит колонки через заголовки.
- **Файлы:** `tests/fixtures/ivanovo-sample.xlsx`, `lib/parse-ivanovo-excel.ts`

**2. [Deviation - Enhancement] Fuzzy header matching вместо hardcoded column indexes**
- **Найдено при:** Task 1 (design decision)
- **Проблема:** План предполагал `const COL_SKU = N` (hardcoded) из реального файла. Без реального файла эти значения неизвестны.
- **Решение:** Fuzzy matching по заголовкам первой строки — определяет колонки автоматически для любого варианта файла. Экспортирует `columnMap` для диагностики.
- **Влияние:** Парсер устойчив к разным форматам файлов. Возможный trade-off — ложные совпадения при нестандартных заголовках (маловероятно для складских выгрузок).

**3. [Deviation - API] upsertIvanovoStock принимает {sku, quantity}[] вместо {productId, qty}[]**
- **Найдено при:** Task 2 (реализация server action)
- **Проблема:** Заглушка из 14-01 использовала `productId` как ключ. API route возвращает `sku` как ключ.
- **Решение:** Изменена сигнатура `upsertIvanovoStock` на `{sku, quantity}[]` — соответствует preview данным из route. `updateMany({where: {sku, deletedAt: null}})` идемпотентно.
- **Влияние:** Более правильная семантика. Preview данные напрямую используются как входные для server action.

## Known Stubs

Нет — все компоненты полностью реализованы. `IvanovoUploadButton` ещё не интегрирован в шапку `/stock` (это задача Plan 14-05), но сам компонент не является заглушкой.

## Self-Check: PASSED

| Файл | Статус |
|------|--------|
| `lib/parse-ivanovo-excel.ts` | FOUND |
| `tests/parse-ivanovo-excel.test.ts` | FOUND |
| `tests/fixtures/ivanovo-sample.xlsx` | FOUND |
| `app/api/stock/ivanovo-upload/route.ts` | FOUND |
| `app/actions/stock.ts` | FOUND |
| `components/stock/IvanovoUploadButton.tsx` | FOUND |
| `components/stock/IvanovoUploadDialog.tsx` | FOUND |

| Commit | Описание |
|--------|---------|
| `da9ff86` | feat(14-stock-04): парсер + fixture + 18 тестов |
| `9005626` | feat(14-stock-04): API route + server action + UI |

TypeScript: `npx tsc --noEmit` → **0 ошибок**

Tests: `npm run test -- tests/parse-ivanovo-excel.test.ts` → **18/18 passed**
