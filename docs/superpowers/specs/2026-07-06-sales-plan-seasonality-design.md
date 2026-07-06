# Индекс сезонности в Плане продаж → Товары

**Дата:** 2026-07-06 · **Статус:** одобрено пользователем, готово к реализации.

## Цель

Дать возможность масштабировать план продаж (и, как следствие, виртуальные закупки) по месяцам горизонта помесячными **индексами сезонности**. Индекс можно задать глобально, на направление, категорию или подкатегорию. Индексы — часть конкретной версии плана (не глобальные настройки).

## Зафиксированные решения

1. **Что множит:** `ставка(день) = (dayOverride ?? ручной_уровень_месяца ?? базовая) × индекс(месяц)`. Индекс — независимый слой, масштабирует и ручные помесячные уровни.
2. **Часть версии:** индексы черновика вмораживаются в версию при фиксации; у каждой версии свой набор.
3. **Пере-якорение «текущий = 100%»** через нормировку на чтении (без крона, без мутации).
4. **Разрешение:** один самый специфичный scope с заданным индексом (подкатегория → категория → направление → глобально), вся его помесячная кривая.

## Модель данных

Новый enum и таблица (Prisma):

```prisma
enum SeasonalityScope { GLOBAL DIRECTION CATEGORY SUBCATEGORY }

model SalesPlanSeasonality {
  id        String            @id @default(cuid())
  versionId String?           // null = черновик (редактируемый); set = снапшот версии (read-only)
  version   SalesPlanVersion? @relation(fields: [versionId], references: [id], onDelete: Cascade)
  scope     SeasonalityScope
  scopeId   String?           // id направления/категории/подкатегории; null для GLOBAL
  month     DateTime          @db.Date  // первый день месяца, "YYYY-MM-01"
  indexPct  Float             // хранимое значение кривой (см. нормировку)
  @@unique([versionId, scope, scopeId, month])
  @@index([versionId])
}
```

Миграция пишется вручную (нет локальной PG), применяется на VPS через `prisma migrate deploy`. `SalesPlanVersion` получает обратную связь `seasonality SalesPlanSeasonality[]`.

## Разрешение индекса (per товар, per месяц)

1. Собрать для товара кандидатов-scope по убыванию специфичности: `SUBCATEGORY(subcategoryId)` → `CATEGORY(categoryId)` → `DIRECTION(directionId)` → `GLOBAL`.
2. Взять **первый** scope, у которого есть **хотя бы одна** строка индекса (в наборе черновика/версии). Используется вся его помесячная кривая.
3. Месяцы без явной строки в выбранном scope = 100%. Если ни один scope не задан = 100% везде.
4. Fallback между scope НЕ помесячный: выбран один scope целиком (решение №4).

`directionId` товара = `product.brand.direction.id` (nullable). Резолвинг делается в `lib/sales-plan/data.ts` и отдаётся движку как `indexByMonth: Record<monthISO, number>` в `ProductPlanInput`.

## Пере-якорение (нормировка на чтении)

Хранимая кривая фиксирована. Эффективный индекс нормируется на текущий месяц:

```
effective(m) = stored(m) / stored(currentMonth) × 100
```

- `stored(currentMonth)` по умолчанию 100 → на старте `effective === stored`.
- Текущий месяц всегда `effective = 100` (делитель = сам себя) — якорь.
- Прошедшие месяцы индекс не несут (факт).
- «Месяц закончится → пересчёт» происходит автоматически: сдвигается `currentMonth` (МСК) → делитель другой. Крон не нужен.

**Численный пример.** Кривая июль 100, авг 120, сен 150.
- Текущий июль: авг ×1.20, сен ×1.50.
- Текущий август: авг ×1.00, сен = 150/120 = ×1.25 (абсолютный план будущих месяцев снижается — прямое следствие инварианта, одобрено).

**Сохранение (обратная нормировка):** введённое пользователем значение `entered` для месяца `m` пишется как `stored(m) = entered × stored(currentMonth) / 100`, чтобы `effective(m) === entered` в момент ввода. При вводе в текущий-месяц-редактирования (`stored(currentMonth)=100`) это тождество `stored = entered`.

`currentMonth` = первый день текущего месяца МСК (helper из `lib/sales-plan/dates.ts` / `getMskTodayIso`).

## Интеграция в движок

- `lib/sales-plan/types.ts`: `ProductPlanInput += indexByMonth?: Record<string, number>` (ключ — ISO месяца "YYYY-MM-01", значение — **effective** индекс в %, уже нормированный).
- `lib/sales-plan/data.ts:loadSalesPlanInputs`: загрузить набор индексов (черновик или версия), сгруппировать по scope, резолвить per товар, применить нормировку → `indexByMonth`.
- `lib/sales-plan/engine.ts:getRateRequested`: `rate = base × (indexByMonth[monthKey(d)] ?? 100) / 100`. Всё остальное (`orders = min(rate, сток)` → выкупы → план) — само.
- Виртуальные закупки: `suggestVirtualPurchases` / `regenerateVirtualPurchasesInternal` перегоняют те же `ProductPlanInput` → закупки учитывают индекс автоматически. Правка индекса дёргает регенерацию (как `saveMonthLevels`).

## Server actions (`app/actions/sales-plan.ts`)

- `saveSeasonalityIndex({ scope, scopeId, monthValues: {monthISO: enteredPct} })` — upsert строк черновика (versionId=null) с обратной нормировкой; затем `regenerateVirtualPurchasesInternal()` + `revalidatePath`. RBAC `SALES MANAGE`.
- `resetSeasonality({ scope?, scopeId? })` — deleteMany строк черновика (весь набор или один scope). Zod `.refine` от пустого where не нужен (versionId=null само по себе scoped на черновик, но при полном сбросе — только `versionId: null`).
- Хук в `fixSalesPlanVersion`: после создания версии — скопировать строки черновика (`versionId=null`) в `versionId=newVersion`.
- (опц.) `loadVersionSeasonalityToDraft(versionId)` — для правки индексов замороженной версии: копирует её строки в черновик (перезаписывая). v1: не обязательно, можно отложить.

## UI

Компонент `components/sales-plan/SeasonalityBar.tsx` над `ProductPlanTable` (вкладка `/sales-plan/products`):
- Селектор scope: Глобально / Направление / Категория / Подкатегория (+ выбор конкретного при не-Global; каскад как в фильтрах).
- Инпуты по месяцам горизонта: текущий месяц — `100%` (read-only якорь), будущие — редактируемые `%`, дефолт 100. Прошедшие — скрыты.
- Live-пересчёт: debounced save (паттерн `GlobalRatesBar` / `distribute-forward`) → `router.refresh()`.
- Чипы активных наборов (какие scope заданы) + кнопка «Сбросить индексы» (весь набор) и per-scope сброс.
- Read-only индикатор при просмотре зафиксированной версии.

## Версии

- `PlanVersionBar` — маркер «с индексами» у версий, где есть строки сезонности (опц., nice-to-have).
- Фиксация версии снапшотит индексы (см. actions). «Сбросить индексы» = черновик к 100%, затем можно фиксировать новую версию.

## Тесты

- `tests/sales-plan-seasonality.test.ts` (новый):
  - разрешение scope (подкатегория бьёт категорию; один scope целиком; дефолт 100),
  - нормировка `effective = stored/stored(current)×100` (пример июль/авг/сен),
  - обратная нормировка сохранения (`effective === entered`).
- `tests/sales-plan-engine.test.ts`: расширить — `rate = base × index/100` каскадит в orders/выкупы; index=100 не меняет golden.
- `tsc --noEmit` чисто; `npm run test` зелёный.

## Файлы

`prisma/schema.prisma` (+ миграция), `lib/sales-plan/{types,data,engine,dates}.ts`, `app/actions/sales-plan.ts` (actions + хук в fix), `components/sales-plan/SeasonalityBar.tsx` (+ wiring в `products/page.tsx`), тесты.

## Вне scope (v1)

- Правка индексов уже зафиксированной версии in-place (версии immutable; через загрузку в черновик — опц.).
- Импорт/экспорт кривых, шаблоны сезонности, авто-подбор из истории продаж.
- Индекс на отдельный товар (только иерархия + глобально).
