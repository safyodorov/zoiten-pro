---
phase: 07-prices-wb
plan: 04
subsystem: api
tags:
  - api
  - wb
  - promotions
  - excel
  - rbac
requirements:
  - PRICES-10
  - PRICES-11
dependency_graph:
  requires:
    - 07-03 (fetchAllPromotions, fetchPromotionDetails, fetchPromotionNomenclatures в lib/wb-api.ts)
    - 07-01 (Prisma модели WbPromotion, WbPromotionNomenclature)
    - 07-00 (vitest infrastructure, fixture tests/fixtures/auto-promo-sample.xlsx)
  provides:
    - "POST /api/wb-promotions-sync — синхронизация акций WB (60-дневное окно)"
    - "POST /api/wb-promotions-upload-excel — загрузка Excel для auto-акций"
    - "lib/parse-auto-promo-excel.ts — pure-TS парсер (unit-тестируемый)"
  affects:
    - 07-10 (UI кнопки «Синхронизировать акции» и «Загрузить отчёт auto-акции» вызовут эти endpoints)
tech_stack:
  added: []
  patterns:
    - "Node.js API route (runtime=\"nodejs\", maxDuration) + RBAC через requireSection"
    - "Multipart upload через req.formData() + XLSX.read(buffer)"
    - "Pure-TS парсер вынесен отдельно от route для vitest compatibility"
    - "Транзакционный upsert: prisma.$transaction([deleteMany, createMany, update])"
key_files:
  created:
    - app/api/wb-promotions-sync/route.ts
    - app/api/wb-promotions-upload-excel/route.ts
    - lib/parse-auto-promo-excel.ts
  modified:
    - tests/excel-auto-promo.test.ts
decisions:
  - "Парсер parseAutoPromoExcel вынесен в lib/parse-auto-promo-excel.ts (pure TS, без next/server импортов) — vitest transform падает на next-auth/lib/env.js если route импортируется напрямую"
  - "Колонки Excel: S=18 → planDiscount, T=19 → status (исправлен off-by-one в плане: было T=19/U=20, реальный fixture имеет 20 колонок индексы 0..19)"
  - "Cleanup устаревших акций (endDateTime < today - 7 дней) через prisma.wbPromotion.deleteMany — Cascade автоматически удаляет связанные WbPromotionNomenclature"
  - "maxDuration=300s для sync route — rate limit WB Promotions API (10 req/6sec ≈ 600ms пауза) делает синхронизацию 80+ акций медленной"
  - "Error messages на русском — показываются пользователю через toast в UI"
metrics:
  duration_sec: 518
  duration_human: "~9 минут"
  tasks_completed: 2
  files_created: 3
  files_modified: 1
  commits: 2
  completed_date: "2026-04-10"
---

# Phase 07 Plan 04: WB Promotions Sync + Excel Upload Routes — Summary

**One-liner:** Два POST endpoint'а: синхронизация акций WB (60-дневное окно через Promotions Calendar API с rate limit compliance) и загрузка Excel из кабинета WB для auto-акций (парсер по индексам колонок, вынесенный в pure-TS модуль для unit-тестирования).

## What Was Built

### 1. `POST /api/wb-promotions-sync` (`app/api/wb-promotions-sync/route.ts`)

Серверный слой для кнопки «Синхронизировать акции» на `/prices/wb` (UI в плане 07-10).

**Flow:**
1. RBAC: `requireSection("PRICES", "MANAGE")` → 403 если нет прав
2. `fetchAllPromotions(today, today+60d)` — список всех акций из WB Promotions Calendar (pagination через offset, 600ms между страницами)
3. Upsert каждой акции в `WbPromotion` с `source="API"`, `lastSyncedAt=now`
4. `fetchPromotionDetails(ids)` — батчи по 10 ID, обновляем `description`, `advantages`, `rangingJson`
5. Для каждой **regular** акции (не auto) — `fetchPromotionNomenclatures(id)` → delete старые + createMany новые
6. Cleanup: `prisma.wbPromotion.deleteMany({ endDateTime: { lt: today - 7d } })` — Cascade удалит связанные WbPromotionNomenclature

**Response:**
```json
{ "synced": 83, "nomenclatures": 214, "deleted": 5 }
```

**Параметры:**
- `runtime = "nodejs"` — Prisma не работает на Edge
- `maxDuration = 300` — 5 минут на случай 80+ акций × 600ms rate limit

**curl (с cookie session):**
```bash
curl -X POST https://zoiten.pro/api/wb-promotions-sync \
  -H "Cookie: authjs.session-token=..."
```

### 2. `POST /api/wb-promotions-upload-excel` (`app/api/wb-promotions-upload-excel/route.ts`)

Серверный слой для кнопки «Загрузить отчёт auto-акции». Необходимо т.к. WB API возвращает 422 для `nomenclatures` на auto-акциях, и данные приходится брать из Excel-экспорта кабинета.

**Flow:**
1. RBAC: `requireSection("PRICES", "MANAGE")` → 403
2. Парс multipart: `file` (File) + `promotionId` (string)
3. Валидация: promotion существует и `type === "auto"` (иначе 404/400)
4. `parseAutoPromoExcel(buffer)` — pure-TS парсер (см. §3)
5. Транзакционный upsert:
   ```ts
   prisma.$transaction([
     wbPromotionNomenclature.deleteMany({ promotionId }),
     wbPromotionNomenclature.createMany({ data: [...] }),
     wbPromotion.update({ data: { lastSyncedAt, source: "EXCEL" } }),
   ])
   ```

**Response:**
```json
{ "imported": 4, "promotionName": "Весенняя распродажа: бустинг продаж" }
```

**curl:**
```bash
curl -X POST https://zoiten.pro/api/wb-promotions-upload-excel \
  -H "Cookie: authjs.session-token=..." \
  -F "file=@Товары_для_исключения_из_акции.xlsx" \
  -F "promotionId=2287"
```

### 3. `lib/parse-auto-promo-excel.ts` — pure-TS парсер

Вынесен отдельно от route, чтобы:
- Не тянуть `next/server` в unit-тесты (vitest падает на `next-auth/lib/env.js`)
- Переиспользоваться в будущих местах (CLI импорт, batch-операции)

**Контракт:**
```ts
export interface ParsedAutoPromoRow {
  nmId: number
  inAction: boolean
  planPrice: number | null
  currentPrice: number | null
  planDiscount: number | null
  status: string | null
}

export function parseAutoPromoExcel(buf: Buffer): ParsedAutoPromoRow[]
```

**Индексы колонок** (фиксировано по fixture):
| Letter | Index | Field | Пример |
|--------|-------|-------|--------|
| A | 0 | inAction | "Да"/"Нет" → boolean |
| F | 5 | nmId | 45360117 |
| L | 11 | planPrice | 3708 |
| M | 12 | currentPrice | 14263 |
| S | 18 | planDiscount | 74 |
| T | 19 | status | "Не участвует: ..." |

Строки без валидного nmId (NaN, <=0, пустая ячейка) пропускаются.

## Verification

**Typecheck:**
```bash
npx tsc --noEmit
```
→ Чисто для наших файлов. Пре-существующая ошибка `tests/pricing-settings.test.ts` — чужой план (07-02 артефакт), out of scope.

**Тесты:**
```bash
npx vitest run tests/excel-auto-promo.test.ts
```
→ **7/7 GREEN** (5 структурных тестов fixture + 2 теста интеграции `parseAutoPromoExcel`).

**Manual verification** (после деплоя):
1. Залогиниться как MANAGER с правами PRICES:MANAGE
2. `curl -X POST https://zoiten.pro/api/wb-promotions-sync` → ждать до 90 сек → `{synced, nomenclatures, deleted}`
3. Проверить БД: `SELECT count(*) FROM "WbPromotion"` → ожидаем 80+
4. Выбрать auto-акцию ID из БД → `curl -F file=@sample.xlsx -F promotionId=X /api/wb-promotions-upload-excel` → `{imported, promotionName}`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Парсер вынесен в отдельный модуль `lib/parse-auto-promo-excel.ts`**

- **Найдено во время:** Task 2 (запуск vitest после добавления импорта `parseAutoPromoExcel` из route)
- **Проблема:** План предписывал `export function parseAutoPromoExcel` внутри `app/api/wb-promotions-upload-excel/route.ts` и импорт `@/app/api/wb-promotions-upload-excel/route` из теста. Vitest падал:
  ```
  Cannot find module 'C:\Claude\zoiten-pro\node_modules\next\server'
  imported from C:\Claude\zoiten-pro\node_modules\next-auth\lib\env.js
  ```
  Route.ts тянет `next/server`, который через next-auth пытается загрузить `next/server` в CommonJS-контекст vitest и падает.
- **Fix:** Создан `lib/parse-auto-promo-excel.ts` (pure TS, только `xlsx` import). Route теперь импортирует `parseAutoPromoExcel` оттуда. Тест тоже импортирует из `@/lib/parse-auto-promo-excel`. Парсер полностью отделён от HTTP-слоя.
- **Файлы:** `lib/parse-auto-promo-excel.ts` (новый), `app/api/wb-promotions-upload-excel/route.ts` (упрощён), `tests/excel-auto-promo.test.ts` (импорт обновлён)
- **Коммит:** f899355

**2. [Rule 1 - Bug] Исправлены индексы колонок Excel (off-by-one в плане)**

- **Найдено во время:** Task 2 (первый запуск vitest после исправления импорта — 1 тест упал)
- **Проблема:** План и Wave 0 тест указывали колонки T=19/U=20 для planDiscount/status. Но реальный fixture (`tests/fixtures/auto-promo-sample.xlsx`) имеет ровно **20 колонок** (индексы 0..19). Колонки с заголовками:
  - index 18 = "Загружаемая скидка для участия в акции" (planDiscount)
  - index 19 = "Статус" (status)
  - index 20 не существует

  Wave 0 тест «колонки L(11)/M(12)/T(19) числовые» падал с сообщением:
  ```
  Колонка index 19 содержит не-число: "Не участвует: стоит блокировка..."
  ```
  Т.е. тест был **сломан с момента создания** (коммит 4d3edd7, Wave 0) — просто никто не замечал, пока 07-04 не потребовал GREEN.
- **Fix:** Обновлены индексы в `lib/parse-auto-promo-excel.ts` (S=18 для planDiscount, T=19 для status) + тест `tests/excel-auto-promo.test.ts` (два последних it-блока). Добавлен комментарий с пояснением deviation.
- **Файлы:** `lib/parse-auto-promo-excel.ts`, `tests/excel-auto-promo.test.ts`
- **Коммит:** f899355

**3. [Rule 1 - Bug] Prisma Json типизация для rangingJson**

- **Найдено во время:** Task 1 (tsc после записи route)
- **Проблема:** `tsc --noEmit` упал на:
  ```
  Type 'Record<string, unknown> | null' is not assignable to type
  'NullableJsonNullValueInput | InputJsonValue | undefined'.
  ```
  Prisma строго типизирует Json-поля через свои типы `InputJsonValue`.
- **Fix:** Привели к `(d.ranging ?? undefined) as never` — обходит strict типы, при `undefined` Prisma не трогает поле. Комментарий с объяснением добавлен в код.
- **Файлы:** `app/api/wb-promotions-sync/route.ts`
- **Коммит:** 1c4a858

### Architectural Changes
Нет — все правки локальные.

## Authentication Gates
Нет — оба endpoint'а используют существующий Auth.js session через `requireSection` и не требуют новых токенов.

## Known Edge Cases & Caveats

1. **422 для auto-акций в sync** — `fetchPromotionNomenclatures` silent-return `[]` (поведение lib/wb-api.ts из 07-03). Sync не падает, auto-акции обрабатываются через Excel upload.
2. **429 rate limit** — один retry с `sleep(6000ms)` в lib/wb-api.ts. Если и после retry 429 → throw → route возвращает 500 с русским сообщением.
3. **Cleanup удаляет только completely expired** — акции с `endDateTime >= today-7d` остаются, даже если уже закончились. Это буфер для восстановления.
4. **Excel upload меняет source на "EXCEL"** — после upload'а акции нельзя обновить через sync без удаления (upsert обновит source обратно на "API"). Ожидаемое поведение: последний sync/upload выигрывает.
5. **promotionId валидация строгая** — `parseInt(raw, 10)` + `NaN`/`<=0` → 400. Клиент должен передавать как число в FormData.
6. **Транзакция Excel upload НЕ атомарна с HTTP** — если connection оборвётся после транзакции, клиент не узнает про успех. Retry безопасен (идемпотентность через deleteMany + createMany).

## Known Stubs
Нет.

## Next Steps
- **07-05** (параллельно): pricing schemas + actions — независим
- **07-10** (позже): UI кнопки «Синхронизировать акции» и «Загрузить отчёт auto-акции» на `/prices/wb`, вызывающие эти routes через fetch

## Self-Check: PASSED

- [x] `app/api/wb-promotions-sync/route.ts` существует (124 строки)
- [x] `app/api/wb-promotions-upload-excel/route.ts` существует
- [x] `lib/parse-auto-promo-excel.ts` существует
- [x] `tests/excel-auto-promo.test.ts` содержит 7 тестов, все GREEN
- [x] Commit 1c4a858 существует в git log
- [x] Commit f899355 существует в git log
- [x] `npx tsc --noEmit` — чисто для наших файлов (единственная ошибка pricing-settings.test.ts из другого плана 07-02)
- [x] RBAC `requireSection("PRICES", "MANAGE")` в обоих routes
- [x] Error messages на русском
- [x] Все обязательные импорты из lib/wb-api.ts (fetchAllPromotions, fetchPromotionDetails, fetchPromotionNomenclatures) вызываются в правильном порядке
