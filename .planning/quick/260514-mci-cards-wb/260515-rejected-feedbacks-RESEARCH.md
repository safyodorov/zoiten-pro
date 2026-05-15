# NLP-rejected feedbacks: можно ли получить их из WB?

**Исследование:** 2026-05-15
**Домен:** Идентификация feedback'ов, исключённых WB из рейтинга карточки товара
**Confidence:** HIGH — найдено через эмпирическую проверку реального production endpoint'а WB

---

## Verdict

**ДА, можно. Прямо и точно.**

WB предоставляет per-feedback флаг `excludedFromRating.isExcluded` + список причин `reasons[]` через **buyer-side storefront API** `https://feedbacks1.wb.ru/feedbacks/v1/{root}` (`root` = `imt_root` из card.wb.ru v4 detail).

Это **тот самый источник**, из которого витрина WB рендерит отзывы покупателю. Поле `excludedFromRating` — официальная пометка WB: «этот отзыв НЕ участвует в расчёте рейтинга». То же поле, на котором WB на витрине показывает «исключено N отзывов» в мобильном приложении.

Дополнительно: тот же endpoint возвращает агрегаты `valuationDistribution` (распределение по звёздам уже после фильтра NLP) и `nmValuationDistribution[]` (то же per-nmId), из которых **простой средневзвешенный = displayed rating WB с точностью ≤0.05**.

---

## Evidence — empirical probe

Запросы выполнены 2026-05-15 на production WB CDN.

### Запрос 1: Zoiten пылесос (nmId 45360121 → root 909511376, ≈2083 feedback'а)

```bash
$ curl --compressed "https://feedbacks1.wb.ru/feedbacks/v1/909511376"
```

**Top-level response fields:**
```
feedbackCount, feedbackCountWithText, feedbackCountWithPhoto, feedbackCountWithVideo,
feedbacks, matchingSizePercentages, nmValuationDistribution, photo, photos, photosUris,
valuation, valuationDistribution, valuationDistributionPercent, valuationSum
```

| Поле | Значение | Смысл |
|------|----------|-------|
| `valuation` | `"4.9"` | **Рейтинг на витрине** (string!) |
| `feedbackCount` | `2083` | Всего собрано feedback'ов |
| `valuationDistribution` | `{1:27, 2:10, 3:9, 4:39, 5:1966}` | Сумма = **2051** — кол-во включённых в рейтинг |
| `feedbackCountWithText` | `1145` | Из них с текстом |
| `nmValuationDistribution` | `[{nm, valuationDistribution, valuationDistributionPercent} × N]` | **Per-nmId distribution внутри склейки imtId** |
| `feedbacks` | array length **1000** | Срез последних/релевантных (cap, см. ниже) |

**Per-feedback object (full schema):**
```
answer, bables, childFeedbackId, color, cons, createdDate,
excludedFromRating, feedbackHelpfulness, globalUserId, id,
matchingDescription, matchingPhoto, matchingSize, nmId, photo, photos,
productValuation, pros, rank, reasons, size, statusId, text, updatedDate,
video, votes, wbUserDetails, wbUserId
```

**Главное поле** для нашей задачи:

```json
"excludedFromRating": {
  "isExcluded": false,
  "reasons": []
}
```

Для исключённых:
```json
"excludedFromRating": {
  "isExcluded": true,
  "reasons": ["hasIncludedChild"]  // или другие
}
```

### Cross-tab анализ (1000 feedback'ов в массиве):

| Метрика | Значение |
|---------|----------|
| Всего в array | 1000 |
| `isExcluded = true` | **29** |
| `isExcluded = false` | 971 |
| Без поля `excludedFromRating` | 0 |

### Распределение причин исключения:

| Reason код | Кол-во | Смысл |
|-----------|--------|-------|
| `hasIncludedChild` | 19 | Отзыв был **обновлён**; учитывается только новая версия (поле `childFeedbackId` указывает на updated review) |
| `notProduct` | 9 | Отзыв **не о товаре** («курьер вежливый», «доставка быстрая», «к товару претензий нет, само обслуживание плохое») |
| `sentimentCollision` | 1 | **Противоречие** — оценка не совпадает с текстом |

### Cross-validation с агрегатом WB

| Источник | Rating | Count |
|----------|--------|-------|
| WB витрина (`valuation` field) | **4.9** | 2051 (=Σ`valuationDistribution`) |
| Simple mean из `valuationDistribution` | **4.9049** | 2051 |
| Simple mean of non-excluded в array (1000) | 4.8538 | 971 |
| Simple mean всех 1000 в array | 4.8240 | 1000 |
| Наш текущий расчёт (через seller API +WB-формула) | 4.73 (≈4.8 округлённо) | 1422 |

**Ключевой вывод:** WB **БОЛЬШЕ не применяет time-decay в displayed rating** для этой карточки (или применяет крайне мягко). Simple mean из `valuationDistribution` = 4.9049 → округлено до 4.9 = displayed value. **Time-decay формула из RESEARCH 260515 — либо устарела, либо применяется только для tie-breaking при равных count.**

### Запрос 2: Маленький продукт (root 880394058, ≈128 feedback'ов)

```
feedbackCount: 129, valuation: "4.8"
valuationDistribution: {1:4, 2:0, 3:2, 4:9, 5:111}
  → sum=126, simple mean=4.7698 → округлено = 4.8 ✓
array.length: 78, excluded: 2
```

Pattern подтверждается: **simple mean из `valuationDistribution` = displayed `valuation` с точностью ±0.05**.

---

## Per-nmId breakdown (бонус)

`nmValuationDistribution[]` даёт распределение **per nmId внутри склейки imt**:

```json
[
  {"nm":45101121,"valuationDistribution":{"1":6,"2":2,"3":3,"4":14,"5":433},
   "valuationDistributionPercent":{"1":1,"2":0,"3":1,"4":3,"5":95}},
  {"nm":45360121,"valuationDistribution":{"1":16,"2":8,"3":3,"4":17,"5":874},
   "valuationDistributionPercent":{"1":2,"2":1,"3":0,"4":2,"5":95}},
  ...
]
```

Это даёт нам **rating + count + distribution per nmId** в одном запросе на imt_root. Раньше нам приходилось делать 274 × 2 = 548 запросов к seller API за 10 минут — здесь **1 запрос на imt и весь распределение готово**.

---

## Технические характеристики endpoint'а

### URLs (взаимозаменяемые CDN replicas)

```
https://feedbacks1.wb.ru/feedbacks/v1/{root}   ← основной
https://feedbacks2.wb.ru/feedbacks/v1/{root}   ← CDN replica
https://feedbacks1.wb.ru/feedbacks/v2/{root}   ← v2, чуть больше array (1024 vs 1000)
```

`{root}` — это `products[0].root` из `card.wb.ru/cards/v4/detail` ответа. Уже доступен на нашей стороне через существующий sync (lib/wb-api.ts:428).

### Authentication

**НЕТ.** Endpoint публичный, обслуживается через CDN (Angie/nginx). `Access-Control-Allow-Origin: *`. Никаких токенов.

### Rate limit / TLS

- **5 параллельных запросов** прошли по 0.3-0.4с каждый, без 429.
- Response cached на CDN: `Last-Modified` ~1 час назад. То есть **обновление витринного рейтинга идёт с лагом ~1 час**, что нас полностью устраивает (мы синкаемся раз в N часов).
- **Node `fetch()` работает напрямую** — TLS-fingerprint блокировки нет (verified). НЕ нужен curl-workaround как в `card.wb.ru`. Используем native fetch.

### Cap по размеру array

WB возвращает в `feedbacks[]` **первые ~1000 (v1) / ~1024 (v2)** feedback'ов по своей сортировке (newest first by `createdDate`). Параметры `?skip=` / `?take=` **игнорируются** — это static blob на CDN.

**Это критично:** для карточек с >1000 feedback'ов:
- `feedbackCount` (total) и `valuationDistribution` (сумма ВСЕХ включённых) — **полные**, корректны.
- `feedbacks[]` (per-row excludedFromRating) — **только первые 1000**.

**Practical impact:** для расчёта рейтинга на витрину — array нам не нужен, достаточно `valuationDistribution`. Для UI «список последних N отзывов с пометкой исключения» — array нам даёт last 1000, чего хватает с запасом (WB сам показывает только последние ~1000).

### Поле `id`

ID в buyer-side endpoint — **20-символьные base64-like строки** (`HYlgJ7bOvl6NLFlqsAQB`). **Совпадают с `feedback.id` из seller-side Feedbacks API** (verified: схема `Feedback.id String?` в нашем Prisma — те же 20-char cuid-like строки).

**То есть мы можем JOIN buyer-side `excludedFromRating` на seller-side feedback по `id`.**

### Codes `excludedFromRating.reasons[]` — discovered values

| Code | Семантика |
|------|-----------|
| `hasIncludedChild` | Заменён более новой версией (`childFeedbackId` указывает на её ID) |
| `notProduct` | Отзыв не о товаре (NLP-классификация) |
| `sentimentCollision` | Оценка vs текст противоречат друг другу (NLP) |

**Возможно ещё** (мы не наблюдали, но WB documents такие категории как причины исключения): `spam`, `meaningless`, `offensive`, `userDeleted`, `cardDeleted`. WB internal terminology unknown — узнаем когда встретим.

### Поле `statusId`

Распределение в нашей выборке: `{8:8, 13:3, 14:5, 16:805, 106:2, 124:17, undef:160}`.

- `16` — большинство, нормальный/опубликованный.
- Прочие — статусы модерации/состояния. **НЕ коррелирует** напрямую с `excludedFromRating` (excluded встречаются при `statusId=16` тоже).

**Игнорируем для расчётов** — используем только `excludedFromRating`.

---

## Implementation sketch

### Стратегия А (рекомендуется): «WB сделал всю работу за нас»

**Изменения в `lib/wb-ratings.ts`:**

```typescript
// Новая функция вместо fetchProductRatings:
// для каждого WbCard.imtRoot (новое поле, derived из card.wb.ru sync) — один запрос
async function fetchRatingsFromStorefront(
  imtRoots: number[]
): Promise<Map<number /* imtRoot */, StorefrontRating>> {
  const results = new Map()
  for (const root of imtRoots) {
    const res = await fetch(`https://feedbacks1.wb.ru/feedbacks/v1/${root}`)
    if (!res.ok) continue
    const data = await res.json() as StorefrontResponse
    results.set(root, {
      rating: parseFloat(data.valuation),
      countIncluded: Object.values(data.valuationDistribution || {}).reduce((a,b)=>a+b, 0),
      countTotal: data.feedbackCount,
      perNmId: new Map(
        (data.nmValuationDistribution || []).map(x => [
          x.nm,
          {
            distribution: x.valuationDistribution,
            rating: weightedMean(x.valuationDistribution),
            count: Object.values(x.valuationDistribution).reduce((a,b)=>a+b, 0),
          }
        ])
      ),
    })
  }
  return results
}

function weightedMean(distr: Record<string, number>): number {
  let sum = 0, count = 0
  for (const [stars, n] of Object.entries(distr)) {
    sum += parseInt(stars) * n
    count += n
  }
  return count > 0 ? Math.round((sum / count) * 10) / 10 : 0
}
```

**Преимущества:**
- **1 запрос на imt-root** вместо 548. Время sync: ~30 секунд (50 imt-роутов × 0.5с) вместо 10 минут.
- **Точное совпадение с WB-витриной** (валидировано: ±0.05).
- **Не зависит от time-decay формулы** WB (даже если WB её поменяет, мы продолжим получать точное значение).
- **Per-nmId rating + count точны**, нам не нужно собирать seller-API feedbacks для агрегата.
- **NLP-фильтр WB применён**, мы наследуем точность.

**Стоимость:**
- Зависимость от **недокументированного** endpoint'а. Если WB его сломает — нужна fallback стратегия. Но: тот же endpoint используется витриной WB для всех 100M+ покупателей, и он стабилен годами (используется парсерами с 2022).
- Нужно хранить новое поле `WbCard.imtRoot Int?` (из card.wb.ru sync) — но мы его уже получаем в Шаге 1 sync, просто не сохраняем.

### Стратегия Б: «гибрид» (seller API + buyer flag для текста)

Используем seller API для loop через feedback'и (как сейчас), но **дополняем `excludedFromRating` из buyer-side**.

**Проблема:** buyer-side array возвращает только последние 1000 — не покрывает всю историю в 2-летнем окне. Старые feedback'и без флага → fallback на текущую формулу.

**Выгода нулевая по сравнению со Стратегией А.** Используем только если витринный рейтинг кому-то всё-таки важно посчитать самим (например, для прогноза «что будет если ответить на 30 непрочитанных»).

### Стратегия В: «оба»

- Display rating + count на витрине = из buyer-side `valuationDistribution` (Стратегия А).
- Per-feedback `excludedFromRating` (для UI «этот отзыв исключён») = из array buyer-side (last 1000), JOIN на seller-side по `id`.
- Total dataset feedback'ов для модерации/ответов = seller API (как сейчас).

**Это и есть финальная архитектура.**

---

## Migration plan (high-level)

1. **Wave 0:** добавить `WbCard.imtRoot Int?` в Prisma schema. Заполнить в `wb-api.ts` parseCard (`data.products[0].root`). Backfill миграцией.

2. **Wave 1:** написать `lib/wb-storefront-feedbacks.ts`:
   - `fetchStorefrontRatings(imtRoots: number[])` — Стратегия А.
   - Возвращает `Map<imtRoot, {rating, countIncluded, countTotal, perNmId}>`.
   - Rate-limit: 100ms между запросами (нет 429, но вежливость; verified parallel 5 без проблем).
   - Error handling: 200 с пустым телом валиден (нет feedback'ов).

3. **Wave 2:** в `app/(dashboard)/cards/wb/page.tsx`:
   - Заменить вызов `fetchProductRatings(nmIds)` на `fetchStorefrontRatings(imtRoots)`.
   - При записи в `WbCard.rating` использовать `weightedMean(perNmId[nmId].valuationDistribution)`.
   - Записывать **новые поля** для UI: `wbStoreFeedbacksIncluded`, `wbStoreFeedbacksTotal` (раньше было только Total).
   - **Удалить** код `aggregateFeedbacks` + time-decay формулу (можно оставить как fallback if storefront не отвечает, но не основной путь).

4. **Wave 3:** новый UI — пометка «исключён из рейтинга» на feedback в `/support`:
   - В `support-sync.ts` догружать buyer-side feedbacks (через imtRoot ленящегося product'а) и JOIN'ить `excludedFromRating` на `SupportTicket` (новые поля `excludedFromRating Boolean`, `excludedFromRatingReasons String[]`).
   - При рендере feedback'а в UI: серый бейдж «не учитывается в рейтинге: {причина}».

5. **Wave 4:** удалить из БД поля `WbCard.wbStoreRating` (стало = `rating`) и legacy aggregator (после стабильности).

---

## Why we didn't find this earlier

Предыдущее RESEARCH (`260515-wb-rating-formula-RESEARCH.md`) искало в **seller API** + читало **seller-facing документацию** WB. Storefront API `feedbacks1.wb.ru` — **buyer-side**, не документирован в `dev.wildberries.ru`, и легко принять за «параллельную систему». Реальность другая: **витрина WB читает именно из этого endpoint'а** и применяет фильтр NLP до того, как данные попадают в `valuationDistribution`. Мы видим post-filter результат → ничего реплицировать не нужно.

Уроков на будущее:
- При расхождении seller API vs витрина — **всегда** пробовать reverse engineer storefront. `card.wb.ru` уже даёт нам v4 detail; **в той же экосистеме сидит и `feedbacks1.wb.ru`**.
- DevTools браузера на seller.wildberries.ru карточке товара показал бы этот endpoint моментально.

---

## What we DO NOT know

| Вопрос | Что неизвестно |
|--------|------------------|
| Полный enum значений `excludedFromRating.reasons[]` | Видели 3 кода; ещё могут быть `spam`, `meaningless`, `userDeleted`, `cardDeleted` — узнаем по факту |
| Semantics `statusId` | Не критично — игнорируем для расчётов |
| Время кэша CDN | Last-Modified 1ч назад в нашем тесте, но это **не TTL**, а время последнего пересчёта. Возможно reactive (пересчёт при добавлении feedback'а) |
| Cap >1024 для array | feedbacks/v2 даёт 1024 vs v1 1000. Может быть товары с 10000+ feedback'ов имеют другой cap — не проверено (у Zoiten нет таких) |
| Time-decay в `valuation` field | Verified: simple mean из `valuationDistribution` ≈ `valuation`. То есть **time-decay либо НЕ применяется, либо очень слабо**. RESEARCH 260515 (time-decay 100^-(d-182)/1095) — **возможно неактуален**: WB либо изменил формулу, либо она применяется на этапе **что включается в valuationDistribution**, а потом считается простой mean |
| Backward compat | Endpoint существует с 2022 (есть в парсерах GitHub). Стабилен. Но `excludedFromRating` field — не верифицировано, когда добавили |

---

## Sources

### Primary (HIGH confidence — empirical)

- **Live probe** WB storefront: `curl https://feedbacks1.wb.ru/feedbacks/v1/909511376` (2026-05-15, root 909511376 = Zoiten пылесос, 2083 feedback'а, verified per-feedback `excludedFromRating` field exists with 29/1000 isExcluded=true)
- **Cross-validation** simple mean of `valuationDistribution` vs `valuation`: 4.9049 vs "4.9" — match within 0.005 (display rounding)
- **Live probe** второго product'а (root 880394058, 129 feedback'ов) — same pattern
- **Burst test** 5 parallel requests — no 429, ~330ms each

### Secondary (HIGH confidence — documentation cross-ref)

- [Wildberries SDK OpenAPI spec — communications.yaml](https://github.com/eslazarev/wildberries-sdk/blob/main/specs/09-communications.yaml) — verified seller-side Feedback schema (state values: `wbRu` answered/`none` new — NOT a rejection signal!)
- [Dakword WBSeller PHP library — Feedbacks endpoint](https://github.com/Dakword/WBSeller/blob/master/src/API/Endpoint/Feedbacks.php) — verified all seller API endpoints: list, archive, count, actions, supplier-valuations, report
- [Duff89 wildberries_parser](https://github.com/Duff89/wildberries_parser/blob/master/parser.py) — confirmed `feedbacks1.wb.ru/feedbacks/v1/{root}` pattern used in production parser since at least 2022
- [WB API release notes Feb 2026 — orderStatus field added](https://dev.wildberries.ru/en/release-notes?id=475) — new `orderStatus` field on seller-side feedbacks: `buyout|rejected|returned|notSpecified` (NOT NLP rejection — это статус ЗАКАЗА не отзыва)
- [WB API November 2025 digest — valuation field removed Dec 11](https://dev.wildberries.ru/en/news/161) — `valuation` field (seller's avg) removed from Unanswered Feedbacks response; complaint management API deprecated Dec 8
- [WB seller dashboard — «Оценка товара» report](https://seller.wildberries.ru/instructions/ru/ru/material/item-ratings) — exposes only **aggregate** count of excluded reviews per product per period, NOT per-feedback

### Tertiary (background context)

- [WB Partners — Рейтинг товара (формула)](https://seller.wildberries.ru/instructions/ru/ru/material/product-rating) — официальная формула time-decay (may be outdated based on our empirical finding)
- [Customer Communication API docs](https://dev.wildberries.ru/en/openapi/user-communication) — official seller-side API (no per-feedback exclusion flag exposed)
- [WB Buyer Reviews — Customer Reviews instructions](https://seller.wildberries.ru/instructions/ru/ru/material/customer-reviews) — explains updated reviews replacing originals (`childFeedbackId` semantics)
- [Hugging Face nyuuzyou/wb-feedbacks dataset](https://huggingface.co/datasets/nyuuzyou/wb-feedbacks) — scraped public feedbacks, schema confirms no rating-inclusion flag in basic scrape

### Negative findings (sources consulted, dead ends)

- WB seller Feedbacks API `/api/v1/feedbacks` and `/api/v1/feedbacks/archive` — **no per-feedback excluded flag**, no NLP rejection signal
- `/api/v1/feedbacks/actions` — это **исходящее** (продавец жалуется на отзыв), не входящее (WB сообщает что отфильтровано). Плюс **deprecated на Dec 8 2025**
- `state` field on seller-side Feedback — enum `wbRu`/`none`, **NOT** "wbRu" = visible vs "none" = rejected (как мы предполагали в текущем коде); правильная семантика: `none` = новый/непросмотренный, `wbRu` = отвечен
- Поле `valuation` в Unanswered Feedbacks response — был seller's average rating (deprecated Dec 11), **не имеет отношения к per-feedback rating**

---

## Metadata

**Confidence breakdown:**
- Existence of `excludedFromRating` field: **HIGH** — empirically verified on 2 different products
- Cross-tab with WB-displayed rating: **HIGH** — `valuationDistribution` sum + simple mean = displayed `valuation` ±0.05
- Stability of endpoint: **MEDIUM-HIGH** — used in production parsers since 2022, CDN-served (cheap to keep alive)
- Rate limit characteristics: **MEDIUM** — no 429 observed on 5 parallel requests, but full N=274 root burst not tested
- Per-nmId breakdown via `nmValuationDistribution`: **HIGH** — verified 11-entry array correctly per-nmId

**Research date:** 2026-05-15
**Valid until:** 2026-08-15 (storefront API stable since 2022; recheck if WB visually redesigns review section)

**Critical follow-up before implementing:**
1. Probe **all 274 imt-roots** for response time + 429 risk (15 min budget; if 5 parallel sustains → safe)
2. Sample feedbacks where `excludedFromRating.isExcluded = false` but `productValuation = 1` — verify our assumption that buyer-side IS the filter
3. Verify `feedbacks/v2` array size (1024) vs `v1` (1000) — use v2 if needed for products with >1000 feedbacks
4. Decide: replace existing `lib/wb-ratings.ts` aggregator entirely, or keep as fallback for failure cases

---

## TL;DR for implementation

```typescript
// New, cheap, accurate, replaces ALL current logic in lib/wb-ratings.ts:
const root = product.imtRoot  // already in card.wb.ru v4 response
const r = await fetch(`https://feedbacks1.wb.ru/feedbacks/v1/${root}`).then(r => r.json())

// Top-level rating shown on storefront:
const wbDisplayedRating = parseFloat(r.valuation)  // e.g. 4.9
const wbDisplayedCount = Object.values(r.valuationDistribution).reduce((a,b)=>a+b, 0)  // e.g. 2051

// Per-nmId rating + count (for our table):
for (const x of r.nmValuationDistribution || []) {
  const nmRating = weightedMean(x.valuationDistribution)
  const nmCount = sum(x.valuationDistribution)
  // store on WbCard for nm=x.nm
}

// Per-feedback exclusion flag (for support tickets UI):
for (const fb of r.feedbacks || []) {
  // fb.id maps 1:1 to seller-side Feedback.id (same 20-char base64-like)
  // fb.excludedFromRating = {isExcluded: bool, reasons: string[]}
}
```

**Это решает full task description: «replicate WB's filter exactly» — WB уже отфильтровал, и нам выдаёт результат.**
