---
name: 260514-mci-CONTEXT
description: Locked decisions for /cards/wb — рейтинг/оценки столбцы, фильтр по Ярлыку, sort по Остатку
gathered: 2026-05-14
status: Ready for planning (NOT for execution — execute завтра)
---

# Quick Task 260514-mci: Карточки товаров /cards/wb — улучшения — Context

**Gathered:** 2026-05-14
**Status:** Ready for planning. Execution отложен на 2026-05-15.

<domain>
## Task Boundary

В разделе `/cards/wb` («Карточки товаров → WB»):
1. Добавить 2 столбца — **«Рейтинг карточки»** и **«Кол-во оценок»** (если есть «рейтинг карточки» и «рейтинг склейки» — показывать оба).
2. Добавить **фильтр по Ярлыку** рядом с фильтрами Бренд / Категория (MultiSelectDropdown — выбор какие ярлыки показывать).
3. Добавить **сортировку** по столбцу «Остаток» (как уже работают другие sort-headers).

Существующий UI: `app/(dashboard)/cards/wb/page.tsx` + `components/cards/WbCardsTable.tsx` + `components/cards/WbFilters.tsx`. RSC page принимает `searchParams`, фильтрует Prisma, передаёт в client table.

</domain>

<decisions>
## Implementation Decisions (locked)

### Источник рейтинга (НЕ через curl)
**Через WB Feedbacks API + локальная агрегация.** Per research:
- WB Seller API НЕ имеет dedicated rating endpoint per nmId (подтверждено WB forum thread 1375). `valuation` поле удалено из `/feedbacks/count-unanswered` 11.12.2025.
- Единственный seller-API путь: `GET /api/v1/feedbacks?nmId={nm}` — собрать все feedback'и (`productValuation` 1-5) + агрегировать average + count на стороне Zoiten.
- Imt-рейтинг («склейка») — агрегация по `feedback.productDetails.imtId` (нужно добавить `WbCard.imtId` парсинг).
- **Rate limit:** 1 req/sec на общий Feedbacks bucket — конфликт с support-sync возможен (тот же bucket после quick 260513-khv). Запуск как отдельная синхронизация по кнопке, НЕ в каждом /api/wb-sync. Cooldown bus per-bucket (260513-khv) защищает.

### Schema additions
**Существующие поля в `WbCard`** (НЕ заполнялись до сих пор):
- `rating Float?` (line 273)
- `reviewsTotal Int?` (line 274)
- `reviews1, reviews2, reviews3, reviews4, reviews5 Int?` (lines 275-279) — distribution по звёздам

**Новые поля (миграция):**
- `imtId Int?` — id склейки (из `parseCard` + WB Content API)
- `ratingImt Float?` — рейтинг склейки (агрегация feedback'ов всех nmId с тем же imtId)
- `reviewsTotalImt Int?` — кол-во оценок склейки

`reviews1..5` distribution можно НЕ заполнять для quick task — only `rating` + `reviewsTotal` (карточка) + `ratingImt` + `reviewsTotalImt` (склейка).

### Sync endpoint
**Новый endpoint `/api/wb-ratings-sync`** + новая кнопка `WbSyncRatingsButton` в header /cards/wb. Паттерн как у `WbSyncSppButton` (отдельная sync кроме полной).
- Внутри: глобальный sweep `GET /api/v1/feedbacks?take=10000&skip=0` (с пагинацией), агрегация в memory по nmId и imtId, batch update WbCard.
- Cooldown bus bucket: `feedbacks` (тот же что support-sync) — pre-check skip если активен.
- НЕ интегрировать в /api/wb-sync — отдельная responsibility + другие limits.
- НЕ автоматический cron — пока ручной trigger через кнопку.

### Альтернатива (отвергнута)
~~Excel-загрузка отчёта «Оценка товара» из WB кабинета~~ — отвергнуто пользователем («через мои API, не curl и не вручную»). Хотя это было бы простейшее решение.

### Фильтр по Ярлыку
**Источник:** `WbCard.label` (`String? @db.VarChar(100)`, line 293 schema). Уже выводится в столбце «Ярлык» (`WbCardsTable.tsx:344`). НЕ Product.abcStatus — это другое (хоть и связанное) поле.

**Pattern:** копия `MultiSelectDropdown` для Brand/Category (WbFilters.tsx:20-87):
- `labels?: string[]` в `WbFiltersProps`
- URL query `?labels=val1,val2`
- В page.tsx добавить `labels` whitelist + `where.label = { in: [...] }`
- На сервере: `prisma.wbCard.findMany({ select: { label: true }, distinct: ["label"], where: { label: { not: null } } })` для опций

### Sort по Остатку
**Pattern:** копия sort для name/brand/category (`WbCardsTable.tsx:182-193` + `page.tsx:51-55`):
- Добавить `"stockQty"` в whitelist на `page.tsx:52`
- В WbCardsTable добавить кликабельный header «Остаток» с handleSort('stockQty')
- URL: `?sort=stockQty&dir=desc`
- Никакой иерархической сортировки (per CLAUDE.md product-hierarchy) — это таблица WbCard, не Product

</decisions>

<specifics>
## Specific Ideas / Constraints

**Pattern references (copy-from):**
- `components/cards/WbFilters.tsx:20-87` — MultiSelectDropdown
- `components/cards/WbFilters.tsx:113-122` — buildUrl с brands/categories
- `app/(dashboard)/cards/wb/page.tsx:32-41` — parse brands/categories params
- `app/(dashboard)/cards/wb/page.tsx:51-55` — sort whitelist + Prisma orderBy
- `components/cards/WbCardsTable.tsx:182-193` — handleSort toggle asc/desc
- `components/cards/WbCardsTable.tsx:295-306` — кликабельный sortable header
- `components/cards/WbCardsTable.tsx:344` — render `card.label`
- `components/cards/WbCardsTable.tsx:362-366` — render `card.stockQty`
- `components/cards/WbSyncSppButton.tsx` — паттерн отдельной sync-кнопки

**Sync timing concerns:**
- support-sync cron tick каждые 15 мин использует тот же `feedbacks` bucket
- Ratings-sync sweep может занять минуты (10000+ feedbacks с пагинацией)
- При запуске ratings-sync ставится bucket lock на 12+ мин → support-sync будет skip'ать questions/feedbacks этот период
- Compromise: запускать ratings-sync редко (раз в день / неделю)

**Display format:**
- Рейтинг: `4.7 (123)` — рейтинг + count в скобках, одна ячейка
- Альтернатива: 2 столбца «Рейтинг» (4.7 ★) + «Оценок» (123)
- Карточка vs склейка: 2 столбца («Рейтинг карточки», «Рейтинг склейки») или 4? Окончательно решит планер с учётом ширины таблицы

**Granularity questions (Wave 0 эмпирика, отложить):**
- Сколько total feedbacks у Zoiten — определит full sweep vs per-nmId loop
- Реальный rate-limit Feedbacks API — research показывает несоответствие docs ("1 req/sec") и практики (720s retry часто)
- Окно запуска ratings-sync относительно support-sync cron (15 мин tick)

</specifics>

<canonical_refs>
## Canonical References

- **Research:** `.planning/quick/260514-mci-cards-wb/260514-mci-RESEARCH.md` (this task)
- **WB rate-limits research:** `.planning/research/wb-api-rate-limits-2026-05-12.md`
- **Cooldown bus (per-endpoint):** `lib/wb-cooldown.ts` (quick 260513-khv) — `feedbacks` bucket
- **Existing rating fields in schema:** `prisma/schema.prisma:273-279` (WbCard model)
- **WB Forum thread 1375:** https://dev.wildberries.ru/forum/1375 (Rating per nmId — без dedicated endpoint)
- **CLAUDE.md «Синхронизация с Wildberries — ВАЖНАЯ СЕКЦИЯ»** — паттерн отдельных sync-кнопок
</canonical_refs>
