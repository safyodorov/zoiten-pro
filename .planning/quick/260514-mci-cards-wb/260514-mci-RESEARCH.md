# Quick 260514-mci — Рейтинг и оценки карточек WB в /cards/wb

**Исследование:** 2026-05-14
**Домен:** WB Seller API (только токены — НЕ public card.wb.ru)
**Confidence:** MEDIUM-HIGH (ключевая находка HIGH — отсутствие dedicated endpoint подтверждено официальным forum thread WB)

---

## Summary

**Главный вывод:** В WB Seller API **нет dedicated endpoint** для получения рейтинга карточки или количества оценок per nmId. Это подтверждено [официальным forum thread WB](https://dev.wildberries.ru/forum/1375) («Рейтинг товара»), где продавец задаёт ровно этот вопрос и не получает endpoint от WB. Все попытки найти `/feedbacks/products/rating/{nmId}`, `nm-report` с полем `rating`, или Sales Funnel с rating дают пустоту.

**Единственный seller-API путь:** агрегировать через `GET /api/v1/feedbacks?nmId={nm}` — список отзывов с `productValuation` (1-5) per отзыв → суммировать на нашей стороне. Rate limit Feedbacks API: **1 req/sec** (новый кап после 11.12.2025 — `valuation` поле из `count-unanswered` deprecated, средний рейтинг надо считать самим).

**Имт-рейтинг («склейка»)** через seller API недоступен совсем. По умолчанию WB объединяет отзывы всех nmId одной imt в кабинете продавца, но API возвращает per-feedback с `productDetails.imtId` — агрегацию делает наш код.

**Primary recommendation:** Добавить новый endpoint `fetchProductRatings(nmIds[])` в `lib/wb-api.ts`, который для каждого nmId делает `GET /api/v1/feedbacks?nmId={nm}&take=5000&skip=0` (Feedbacks API даёт макс 5000 за вызов), считает avg(productValuation) + count, и одновременно агрегирует по imtId. Запускать **отдельной кнопкой** "Загрузить рейтинги" — НЕ в `/api/wb-sync`. Reason: 267 карточек × 1 req/sec = 267 секунд ≈ 4.5 минуты. И каждый запрос может вернуть 100-500 отзывов = десятки тысяч записей trip per sync.

**Альтернатива (CANONICAL):** WB-кабинет имеет [отчёт «Оценка товара»](https://seller.wildberries.ru/instructions/ru/ru/material/item-ratings) с готовыми числами рейтинга/оценок per nmId — но он доступен **только через UI**, не через API. Можно попросить менеджера ежедневно экспортировать CSV и загружать через UI (паттерн ИУ комиссий и auto-акций).

---

## 1. Where rating lives — WB API endpoints с rating data

### 1.1. Что задокументировано (по убыванию confidence)

| Endpoint | Возвращает rating? | Per-product? | Status | Confidence |
|----------|--------------------|--------------|--------|------------|
| `GET feedbacks-api/api/v1/feedbacks?nmId={nm}` | `productValuation` 1-5 per feedback | да (filter) | **WORKING** — единственный path | HIGH |
| `GET feedbacks-api/api/v1/feedbacks/archive?nmId={nm}` | то же, для архивных | да | WORKING — обработанные отзывы | HIGH |
| `GET feedbacks-api/api/v1/feedbacks/count` | `countAnswered, countUnanswered` | нет nmId фильтра | WORKING — только общий счёт | HIGH |
| `GET feedbacks-api/api/v1/feedbacks/count-unanswered` | `countUnanswered, countUnansweredToday`; **valuation удалено 11.12.2025** | нет | WORKING без valuation | HIGH |
| `GET common-api/api/common/v1/rating` | seller rating + feedbacks count | **только seller-level** | WORKING — но не товар | HIGH |
| `GET feedbacks-api/api/v1/supplier-valuations` | dictionary жалоб (`feedbackValuations, productValuations`) | нет | **не для рейтинга** — это reasons для жалоб | HIGH |
| `POST seller-analytics-api/api/v2/nm-report/downloads` (DETAIL_HISTORY_REPORT) | orders/buyouts CSV per nmId | да | НЕТ rating field | HIGH |
| `POST seller-analytics-api/api/v3/sales-funnel/products` | openCardCount, addToCart, orders, buyouts | да | НЕТ rating field | HIGH |
| `POST content-api/content/v2/get/cards/list` | карточки товара (name, brand, sizes...) | да | НЕТ rating field | HIGH |
| `GET .../feedbacks/products/rating/{nmId}` (предполагаемый) | — | — | **НЕ СУЩЕСТВУЕТ** | HIGH — подтверждено [forum/1375](https://dev.wildberries.ru/forum/1375) |

**Источник истины по отсутствию dedicated endpoint:** [forum thread "Рейтинг товара" на dev.wildberries.ru](https://dev.wildberries.ru/forum/1375) — продавец задаёт точно тот же вопрос («запросить рейтинг конкретного товара»), официального WB-ответа с endpoint'ом не получает. Wrapper-библиотеки (Dakword/WBSeller на PHP, wildberries-api на Python) ни одна не имеют метода `getProductRating`/`getNmRating` — у всех только `count`, `list`, `archive`.

### 1.2. Что было раньше и больше нет

- Поле `valuation` (среднее по всем feedback'ам продавца) **удалено 11.12.2025** из `/api/v1/feedbacks/count-unanswered`. WB сам в release notes пишет: «получайте средний рейтинг через другой метод» — без указания этого метода. То есть единственный путь сейчас — pagination через `/api/v1/feedbacks` + ручная агрегация.

### 1.3. Что WB точно НЕ отдаёт через seller API

- Распределение оценок 1★/2★/3★/4★/5★ per nmId (поля `reviews1..reviews5` в нашем `WbCard` — можно вычислить ручной агрегацией, но **дорого**: full feedbacks dump каждый sync)
- Рейтинг imt («склейка» — общая оценка всех цветов модели) — только агрегация через `feedback.productDetails.imtId`
- «Заполненность карточки» (отдельный рейтинг качества контента) — есть отдельный отчёт в кабинете, нет API

---

## 2. Card vs imt rating — где найти оба + как маппить

### 2.1. Что эти числа значат на WB

- **Рейтинг карточки (nmId-level):** среднее `productValuation` по всем отзывам **только этого** nmId. Если у товара 3 цвета как 3 nmId, у каждого свой рейтинг + своя цифра оценок.
- **Рейтинг склейки (imt-level):** среднее по всем feedback'ам всех nmId этой imtId (обычно показывается покупателю на странице товара). По умолчанию **WB склеивает рейтинги** в кабинете (опция «Общий рейтинг по карточке»), но в API отдельного поля нет — `productDetails.imtId` приходит per feedback, агрегацию делаем сами.

### 2.2. Как получить оба числа

```typescript
// Псевдокод нового метода в lib/wb-api.ts:
async function fetchProductRatings(nmIds: number[]): Promise<{
  perNmId: Map<number, { rating: number; count: number; imtId: number }>
  perImtId: Map<number, { rating: number; count: number; nmIds: number[] }>
}> {
  // Для каждого nmId — pagination через /api/v1/feedbacks?nmId={nm}&take=5000&skip=0
  //   take max = 5000 (per WB docs)
  //   если count > 5000 — итерируем skip += 5000
  // Собираем productValuation массивы:
  //   sumPerNmId[nm]   += sum  countPerNmId[nm]   += length
  //   sumPerImtId[imt] += sum  countPerImtId[imt] += length
  // Делим sum/count → среднее
}
```

**Альтернатива (быстрее, но HEAVY):** один глобальный sweep `/api/v1/feedbacks?take=5000&skip=0&order=dateDesc` БЕЗ nmId filter — получить ВСЕ отзывы продавца за всё время, агрегировать в Map. Risk: тысячи feedback'ов = десятки МБ JSON, может быть медленно. Но это **1 запрос/секунду на сотни feedbacks'ов**, что эффективнее, чем 267 запросов per-nmId. Wave 0 проверка.

### 2.3. Что хранить в БД для imt-агрегата

`WbCard.imtId Int?` — добавить поле. Сейчас НЕТ в схеме. Источник: `WbCard.rawJson` или новый запрос — WB Content API `/content/v2/get/cards/list` возвращает `imtID` (uppercase IDs) в каждой карточке, но мы его не парсим (см. `lib/wb-api.ts:526` `parseCard()` — нет `imtId`). Так что **в новом плане:**
1. Добавить парсинг `imtID → WbCard.imtId Int?` в `parseCard()`
2. В `/api/wb-sync` обновить апи-маппинг
3. В новом `fetchProductRatings` агрегировать по imtId, который уже есть в БД (после первого sync)

---

## 3. Schema additions — рекомендуемые поля WbCard

**Заметка:** В текущей `prisma/schema.prisma` уже есть поля `rating`, `reviewsTotal`, `reviews1..reviews5` (см. `schema.prisma:273-279`) — добавлены ранее, но НЕ ПОПУЛЯРИЗИРУЮТСЯ ни одним sync-метом. То есть колонки есть в БД, но они вечно `null`.

### 3.1. Минимальный (v1)

| Поле | Тип | Назначение | Где заполняется |
|------|-----|------------|------------------|
| `rating` | `Float?` (уже есть) | Средний рейтинг карточки (nmId-level), 1.0-5.0 | новый `fetchProductRatings` |
| `reviewsTotal` | `Int?` (уже есть) | Кол-во оценок карточки (включая текстовые и без текста) | то же |
| `imtId` | `Int?` **новое** | imt группы для агрегации склейки | `parseCard` в `lib/wb-api.ts` |
| `ratingImt` | `Float?` **новое** | Средний рейтинг склейки (imt-level) | агрегация per imtId |
| `reviewsTotalImt` | `Int?` **новое** | Кол-во оценок склейки | то же |

### 3.2. Расширенный (если нужно 1★..5★ распределение)

`reviews1..reviews5 Int?` (уже в схеме) — заполняются той же агрегацией, считаем сколько раз `productValuation === 1`, `2`, etc. **Stretch goal** — не v1.

### 3.3. Расчёт imt-агрегата при отсутствии нативного API

```typescript
// после fetchProductRatings:
for (const [imtId, { sum, count }] of perImtIdRaw) {
  const avgRating = count > 0 ? sum / count : null
  // обновить ВСЕ WbCard этой imtId одинаковым значением
  await prisma.wbCard.updateMany({
    where: { imtId },
    data: { ratingImt: avgRating, reviewsTotalImt: count },
  })
}
```

---

## 4. Sync integration — endpoint(s) для добавления + rate limit

### 4.1. Где добавить вызов

**НЕ в `/api/wb-sync` (full sync).** Причины:
- Текущий `/api/wb-sync` уже занимает 1.5-2 минуты (Content + Prices + Tariffs + Stocks + Analytics + СПП + Orders).
- Feedbacks API имеет лимит **1 req/sec** (Feedbacks/Questions общий bucket — общая шина с `support-sync`!). 267 nmId × 1 sec = 4.5 минуты сверху.
- Pagination через `/feedbacks?nmId={nm}&take=5000&skip=0` — большинство товаров имеет <100 отзывов → один запрос на товар, но всё равно сериализованно из-за rate limit.

**Решение: отдельная кнопка** `"Загрузить рейтинги"` в Cards/WB тулбаре + endpoint `POST /api/wb-ratings-sync`. Паттерн `WbSyncSppButton` ([components/cards/WbSyncSppButton.tsx](C:\Users\User\zoiten-pro\components\cards\WbSyncSppButton.tsx), уже существует) — UI cooldown 5 минут, toast.loading, отдельная route.

### 4.2. Rate limits

| Endpoint | Limit | Источник |
|----------|-------|----------|
| `feedbacks-api/api/v1/feedbacks` | **1 req/sec** per seller | [WB docs](https://dev.wildberries.ru/en/docs/openapi/user-communication), MEDIUM confidence (из research 2026-05-12) |
| Превышение | 60 sec блокировка (3 req/sec → 60 sec ban) | tот же |

**КРИТИЧНО:** Эта же шина (`feedbacks` bucket) используется `support-sync` для отзывов и вопросов (см. `lib/support-sync.ts`). Если запустить `fetchProductRatings` одновременно с cron'ом support-sync — конфликт, оба провалятся в 429.

**Решение:** использовать общий cooldown bus (`lib/wb-cooldown.ts`, bucket `feedbacks`). См. quick 260513-khv — там уже реализовано per-bucket cooldown. Новый `fetchProductRatings` обязан:
1. Pre-check `getWbCooldownSecondsRemaining("feedbacks")` перед началом
2. На 429 — пишет `setWbCooldownUntil("feedbacks", retryAfterSec)` и throws
3. Между nmId-запросами — sleep 1100ms (буфер 100ms над 1 req/sec)

### 4.3. Token scope

Текущий `WB_API_TOKEN` уже имеет bit 5 «Отзывы» (используется в `lib/wb-support-api.ts`). **Достаточно** для `/api/v1/feedbacks`. Дополнительный токен не нужен. Из research 260512-jxh: token bitmask проверяется через JWT decode в `lib/wb-token.ts`. Wave 0 — проверить, что фактический токен имеет bit 5 (probe через `GET /api/v1/feedbacks/count`).

### 4.4. Производительность

| Метод | Кол-во requests | Время (1 req/sec) | Объём данных |
|-------|-----------------|-------------------|---------------|
| Per-nmId loop (267 карточек) | 267-534 (зависит от пагинации) | 4.5-9 минут | ~5-50 МБ JSON |
| Global sweep (все отзывы за период) | 5-50 (по 5000 take) | 5-50 секунд | ~25-100 МБ JSON |

**Рекомендация:** Global sweep `?take=5000&skip=N` БЕЗ nmId фильтра + клиентская агрегация. **Caveat:** WB архивирует обработанные отзывы (`/api/v1/feedbacks/archive` отдельный endpoint) — для полной картины надо два sweep'а (active + archive).

### 4.5. Альтернатива через UI-load Excel

WB-кабинет имеет [отчёт «Оценка товара»](https://seller.wildberries.ru/instructions/ru/ru/material/item-ratings) — готовый CSV с rating и count per nmId, обновляется ежедневно. Можно сделать **кнопку «Загрузить рейтинги (Excel)»** — паттерн `WbUploadIuButton` (загрузка ИУ комиссий) и `WbAutoPromoUploadButton` (auto-акции). 0 API calls, ручная синхронизация раз в день.

**Когда выбирать UI-load:**
- Если у Zoiten >500 nmId и хочется ежедневный refresh
- Если Feedbacks API часто 429'ится (наблюдается в quick 260512-gvy — был ban support-sync 720s)
- Если imt-рейтинг важнее nmId-рейтинга (отчёт UI как раз даёт imt-агрегат «по умолчанию»)

---

## 5. Open Questions — эмпирическая проверка

1. **Сколько фактически отзывов у Zoiten?** Влияет на выбор pagination стратегии. Замерить через `GET /api/v1/feedbacks/count` (active) + `GET /api/v1/feedbacks/count-unanswered`. Если <5000 → один global sweep решает. Если 5000-50000 → 10 sweep'ов, ~10 сек. Если >100000 → per-nmId loop + кэширование.

2. **Реальный rate limit Feedbacks API.** Документация говорит «1 req/sec», но в quick 260512-gvy наблюдали 429 с `X-Ratelimit-Retry=720` (12 минут). То есть «1 req/sec» — это steady-state, а burst меньше или совсем нет. **Wave 0:** замерить `X-Ratelimit-Limit` и `X-Ratelimit-Remaining` после первого запроса.

3. **Возвращает ли `/feedbacks?nmId={nm}` ВСЕ отзывы товара или только не-архивированные?** В Dakword/WBSeller есть отдельный `archive()` endpoint. Если для рейтинга нужны все отзывы (включая обработанные = архив), мы недосчитываем. **Wave 0:** для одного известного товара с >10 отзывами проверить — сходится ли count с цифрой в кабинете WB.

4. **`productDetails.imtId` всегда заполнен?** В типе `lib/wb-support-api.ts:Feedback.productDetails.imtId` — `number`, не nullable. Но если WB иногда возвращает 0 или отсутствует поле — агрегация по imtId сломается. **Wave 0:** проверить 10 произвольных feedback'ов, есть ли imtId.

5. **Совместим ли cooldown bus с пиковыми support-sync?** Cron support-sync каждые 15 минут читает feedbacks/questions. Если `wb-ratings-sync` запустить вручную через минуту после крона — оба упадут в 429 потому что bucket общий. **Wave 0:** проверить интервал; возможно нужен **scheduled** запуск ratings-sync в окне +12 мин после cron tick (gap до следующего).

---

## Sources

### Primary (HIGH confidence)
- [WB API forum thread "Рейтинг товара"](https://dev.wildberries.ru/forum/1375) — официально подтверждает отсутствие dedicated endpoint
- [WB API Updates Digest November 2025](https://dev.wildberries.ru/en/news/161) — депрекация `valuation` поля 11.12.2025
- [WB Customer Communication API](https://dev.wildberries.ru/en/docs/openapi/user-communication) — endpoint list (Cloudflare блокирует direct fetch, доступ через поисковые кеши)
- [Dakword/WBSeller Feedbacks.php](https://github.com/Dakword/WBSeller/blob/master/src/API/Endpoint/Feedbacks.php) — exhaustive PHP wrapper, отражает весь набор endpoints
- [Seller cabinet — отчёт «Оценка товара»](https://seller.wildberries.ru/instructions/ru/ru/material/item-ratings) — UI-only альтернатива
- [.planning/research/wb-api-rate-limits-2026-05-12.md](C:\Users\User\zoiten-pro\.planning\research\wb-api-rate-limits-2026-05-12.md) — внутренний research по rate limits

### Secondary (MEDIUM confidence)
- [wildberries-api PyPI](https://pypi.org/project/wildberries-api/) — Python wrapper, методы для valuations
- [WB Common Rating endpoint](https://dev.wildberries.ru/en/release-notes?id=475) — `/api/common/v1/rating` (seller-level only)

### Tertiary (LOW confidence — для контекста)
- [Склейка и рейтинг wbstat.pro](https://wbstat.pro/faq/skleyka-i-reyting-na-wildberries-korotkoe-okno-bystrye-posledstviya/) — community объяснение imt-рейтинга

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Feedbacks API уже интегрирован в `lib/wb-support-api.ts`, паттерн известен
- Architecture (отдельная кнопка vs full sync): HIGH — уже устоявшийся паттерн `WbSyncSppButton`, `WbUploadIuButton`
- Pitfalls (rate limit shared bucket, imt-агрегация): MEDIUM — нужна Wave 0 эмпирика
- imt rating через API: HIGH — подтверждено что НЕ существует, только агрегация
- Schema additions: HIGH — поля `rating/reviewsTotal` уже в БД, нужны `imtId/ratingImt/reviewsTotalImt`

**Research date:** 2026-05-14
**Valid until:** 2026-06-13 (WB Feedbacks API стабильна, но 11.12.2025 убрали `valuation` — следить за release notes)
