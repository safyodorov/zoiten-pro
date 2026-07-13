# Phase 30 — Wave 0 Notes (spike: MPSTATS + basket-CDN + detail-JSON)

**Date:** 2026-07-13. Verified with the user's real MPSTATS token + a real detail file (`кофе 1-5.docx` → `tests/fixtures/analytics-detail-sample-1.json`, 5 SKU, ниша «кофемашины»).
**Status:** ✅ ВСЕ блокирующие unknowns подтверждены живыми запросами. Wave 0 закрыт.

---

## 1. MPSTATS API — позиции в поиске + список запросов (ANL-03, ANL-10)

`CONFIRMED: GET https://mpstats.io/api/wb/get/item/{nmId}/by_keywords?d1=YYYY-MM-DD&d2=YYYY-MM-DD`
Header: `X-Mpstats-TOKEN: <token>`. Один вызов на SKU покрывает и позиции, и список запросов с частотностью.

Ответ (HTTP 200), top-level: `words`, `days`, `days_formatted`, `sales`, `balance`, `final_price`, `comments`, `rating`.
- `days_formatted` — ось дат (совпала с окном файла: 30 точек d1..d2). Единая шкала с воронкой (D-02, окно = период byDay файлов).
- `words` — объект «запрос → данные», **до 200 запросов на SKU** (наблюдалось ровно 200 → возможен cap; при необходимости уточнить пагинацию, но 200 достаточно для топа ниши).

Поля `words[запрос]`:
| Поле | Тип | Смысл |
|------|-----|------|
| `pos` | number[30] | дневная итоговая позиция |
| `organic_pos` | number[30] | **органическая** позиция по дням (0 = нет в органике в этот день) |
| `auto` | array[30] | **реклама/буст**: элемент `[cpm, ?, ad_type, position]`, напр. `[0,0,"b",2]` → тип `"b"`, позиция 2. (В наблюдении cpm=0 — вероятно у неактивной ставки; для SKU с активной рекламой ждать ненулевой; поле есть.) |
| `ad_type` | string[30] | дневной тип размещения (`"b"` = boost/авто) |
| `traffic_volume` | number[30] | дневная частотность запроса |
| `wb_count` | number | **агрегатная частотность WB (для фильтра > 500)**, напр. «кофемашина» = 202088 |
| `count` / `total` | number | доп. частотные метрики MPSTATS |
| `avg_pos` / `avg_organic_pos` / `avg_ad_pos` | number | средние позиции |
| `norm_query` | string | нормализованный текст запроса |

**Правила для реализации (30-05):**
- Разделение органика/реклама: `organic_pos[i]` (органика) и `auto[i][3]`/`ad_type[i]` (реклама). Средняя позиция по дням присутствия (прочерк, если 0) — ANL-10 (`avg_organic_pos`/`avg_ad_pos` можно взять готовыми, но проверить, что «дни отсутствия не штрафуются»).
- Список запросов ниши с частотностью > 500 = union ключей `words` по всем 30 SKU, фильтр `wb_count > 500` (D-02 / ANL-03). Источник — этот же вызов (доп. запрос к MPSTATS не нужен).

`CONFIRMED: GET https://mpstats.io/api/wb/get/item/{nmId}/sales?d1&d2` — дневные `balance/sales/price/final_price/wallet_price/rating/comments` (вторично; цена конкурентов первично из detail-JSON per D-04).
`FAILED: GET .../item/{nmId}/card` и `.../item/{nmId}/keywords` → HTTP 405 (не те пути).

**Лимиты:** 1 запрос = 1 лимит тарифа (30 SKU × 1 by_keywords = 30 обращений). Собирать последовательно/умеренно, ловить 429 (30-05/30-07, D-03).

---

## 2. basket-CDN card.json — характеристики + фото + продавец (ANL-04)

`CONFIRMED: GET https://{host}/vol{vol}/part{part}/{nmId}/info/ru/card.json` (HTTP 200, native fetch/curl OK — basket НЕ TLS-блокируется).
**Хост НЕ вычисляем по дрейфующей vol→host карте** — берём прямо из `commonParams[].mainPhoto` в detail-файле (напр. `https://basket-39.wbbasket.ru/vol8993/part899301/899301731/images/c246x328/1.webp` → host=`basket-39.wbbasket.ru`, vol=`8993`, part=`899301`). Снимает research-pitfall #4 (дрейф host-карты).

card.json поля (подтверждено): `imt_name` (название), `subj_name` (категория «Кофемашины»), `selling.brand_name` (бренд), **`selling.supplier_id`=114151 (продавец, ANL «Общая информация»)**, `description`, `vendor_code`, `media.photo_count`, `colors`, и главное:
- `options` — плоский список характеристик `[{name, value, charc_type?}]` (24 шт: «Высота упаковки»/«Вес с упаковкой»/«Цвет»/«Тип управления»/…).
- `grouped_options` — сгруппировано `[{group_name, options:[…]}]` («Основная информация», «Общие характеристики») — для вкладки «Характеристики» (30-10).

**Фото листинга (5 шт):** из `mainPhoto`-шаблона заменой индекса: `.../{nmId}/images/c246x328/{1..N}.webp` (N = `media.photo_count`; для крупного вида в дашборде/PDF можно `big/{i}.webp`). Т.е. фото деривуются БЕЗ доп. запроса, из mainPhoto + photo_count.
**Примечание:** `supplier_id` — числовой ID; человекочитаемое имя продавца потребует доп. резолва (напр. seller-API) — best-effort/отложить; для приёмки достаточно supplier_id + brand.

---

## 3. detail-JSON («Сравнение карточек») — структура подтверждена (ANL-01, ANL-02)

Фикстура: `tests/fixtures/analytics-detail-sample-1.json` (реконструирована из docx, 5 SKU).
- top: `error`, `errorText`, `additionalErrors`, `data`. `data`: `ID`, `salesFunnel`, `commonParams`, `searchQueries`.
- `salesFunnel.byDay` (5 SKU × 30 дней = 150), `byWeek`, **`byMonth`** (5 SKU × 2 мес = 10).
- Поля byDay/byMonth: `nmID, nmName, dt, openCard, addToCart, openToCart, orders, cartToOrder, ordersSum, buyoutCount, buyoutSum, buyoutPercent, cancelCount, cancelSum, avgPosition, viewCount, CTR, medianPrice`.
  - **`byMonth` присутствует** → «месячное значение ÷ 30» (HIGH-1, ANL-02) берёт `byMonth.{viewCount|orders|ordersSum}`; fallback Σ(byDay)/30. НЕ делить на n=days.length.
  - Внимание: `openToCart` и `cartToOrder` в источнике — УЖЕ проценты конверсий (per-строка). Но по ТЗ конверсии за месяц считаем «от сумм» (Σ), НЕ усредняя эти проценты → использовать абсолюты (openCard/addToCart/orders/buyoutCount), не готовые %.
  - `avgPosition` в воронке — это WB-позиция карточки (НЕ путать с MPSTATS search-позициями вкладки «Статистика запросов»).
- `commonParams[]` (5): `nmId, nmName, mainPhoto, subject, item, brandName, nmRating, minPrice, maxPrice, medianPrice, feedbacksCount{current,dynamics}, feedbacksRating, viewCount, CTR, nmCreated, sizes, inAdvertising, promo, …`. Медианная цена (−3%, ANL-02) — из detail (`medianPrice`), не из внешних API.
- `searchQueries[]` (в этом файле 5): `{text, frequency:{current,dynamics}, nms:[{nmId, cartToOrder, openToCart}]}` — тоже несёт запросы с частотностью (альтернатива/сверка к MPSTATS wb_count).

**Парсер (30-04):** состав топ-30 = union nmID по 6 файлам (5×6=30); дедуп; окно дат = период byDay (проверить единый период между файлами — research Open Q, при расхождении взять пересечение/наибольшее общее).

---

## Итог для дальнейших волн
- 30-05 (MPSTATS-клиент): пути и схема известны → писать не вслепую.
- 30-06 (скан карточек): host из mainPhoto + card.json options/grouped_options + фото-шаблон.
- 30-03/30-04 (движок/парсер): byMonth для ÷30, «от сумм» из абсолютов, фикстура готова.
- Полный прогон позже требует все 6 файлов (сейчас есть 1 — достаточно для Wave 0 / тестов).
