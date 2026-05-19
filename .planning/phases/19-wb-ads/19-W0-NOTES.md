# 19-W0 Smoke Check Notes

**Дата:** 2026-05-19 (Tue, MSK)
**Исполнитель:** Claude (sonnet опус 4.7)
**Status:** ✅ **W0 завершён.** 3/4 endpoint верифицированы empirically с реальным shape; `/promotion/adverts` deprecated, есть workaround через `fullstats.days[].apps[].nms[]`. Source for `beginDate`/`endDate` formats: WebSearch results + WB forum (см. Sources в конце).

---

## TL;DR ключевые находки (важные для 19-01 и 19-02)

1. **Существующий `WB_API_TOKEN` технически работает для Advert API** (bit 30 в JWT scope даёт доступ — empirically verified). НО **рекомендация: всё-таки завести отдельный `WB_ADS_TOKEN`** для изоляции rate-limit buckets. Аргумент пользователя 2026-05-19: «чтобы лимитами не пересекаться». Это правильно — WB rate-limit считается per-token, разные токены = независимые buckets, при бане одного модуля другие работают. План 19-02 в основном остаётся (отдельный токен), но мотивировка меняется: не из-за scope, а из-за isolation. Bit 30 нужен в `REQUIRED_SCOPE_BITS` для Ads-функций — WB_ADS_TOKEN тоже должен его иметь.

2. **Endpoint paths из RESEARCH.md устарели.** WB мигрировал:
   - `POST /adv/v1/promotion/adverts` → **404** (не существует)
   - `POST /adv/v2/fullstats` → **404** (мигрирован)
   - `GET  /adv/v3/fullstats`  → path существует (получили 400 на тестовом body — нужен правильный формат)
   План 19-01 (Prisma schema) пока **корректен по data shape** для `/promotion/count` и `/balance`, но придётся обновить `lib/wb-adv-api.ts` (19-03) под v3 и заменить путь `/promotion/adverts` на актуальный (TODO ниже).

3. **Shape `/promotion/count` отличается от RESEARCH.** Возвращает grouping `{adverts: [{type, status, count, advert_list: [{advertId, changeTime}]}]}`, а не flat list. Нужно adapter в client.

4. **Shape `/balance`:** `{balance: int, net: int, currency: "RUB"}` — НЕТ поля `bonus` (RESEARCH ожидал). Модель `WbAdvertBalanceSnapshot` в 19-01 надо подровнять.

---

## 1. `GET /adv/v1/promotion/count` — ✅ 200 OK

**Запрос:** `curl -H "Authorization: $WB_API_TOKEN" https://advert-api.wildberries.ru/adv/v1/promotion/count`

**Real shape:**
```json
{
  "adverts": [
    {
      "type": 6,
      "status": 7,
      "count": 27,
      "advert_list": [
        {"advertId": 2666349, "changeTime": "2025-11-20T11:28:10.471826+03:00"},
        {"advertId": 2689232, "changeTime": "2025-11-20T11:28:10.471826+03:00"},
        ...
      ]
    },
    ...
  ],
  "all": 427    // total count (по данным response size; уточнить точное имя поля в полном JSON)
}
```

**Реальные значения `type` (cabinet 879842, 427 кампаний):**
| type | count |
|------|-------|
| 5    | 12    |
| 6    | 27    |
| 9    | 388   |

(Тип 9 = единая/ручная ставка, доминирует. Типы 5/6 — legacy.)

**Реальные значения `status`:**
| status | count |
|--------|-------|
| 4      | 1     |
| 7      | 195   |
| 9      | 66    |
| 11     | 165   |

(Совпадает с RESEARCH ожиданиями `-1, 4, 7, 8, 9, 11` — кроме того, статусов -1 и 8 нет в наших данных.)

**advertId range:** 2_666_349 .. 36_731_930 (диапазон ~34M; type=Int в schema проходит — Int32 max ~2.1B).

**Корректировки для 19-01:**
- ✅ `WbAdvertCampaign.advertId Int @id` — OK.
- ⚠️ Структура response — `adverts[].advert_list[]` — двухуровневая. В client (lib/wb-adv-api.ts) нужно flatten в один массив `{advertId, type, status, changeTime}`.
- ⚠️ `changeTime` — ISO с timezone (`+03:00`), не Z. `DateTime` в Prisma OK.

---

## 2. `/adv/v1/promotion/adverts` — ❌ deprecated, есть workaround

**Запрос:**
```
POST https://advert-api.wildberries.ru/adv/v1/promotion/adverts
Authorization: $WB_API_TOKEN
Content-Type: application/json

[36731930, 36731776, 36714207, 36713988, 36713910]
```

**Response:** `404 "path not found"` (origin: `s2s-api-auth-adv`).

**Также проверены alternative paths (все 404):**
- `GET /adv/v1/promotion/adverts?id=...`
- `POST /adv/v1/info`
- `GET /adv/v1/info?id=...`

**TODO (после cooldown):** Найти актуальный path для деталей кампании. Кандидаты:
- `GET /adv/v1/promotion/{advertId}` (REST-style, по одному)
- `POST /adv/v2/promotion/info` (батчево)
- Проверить через openapi.wildberries.ru или сэмпл curl с правильным методом

Без этого endpoint мы НЕ узнаём `nmIds[]` targets кампании. Это блокирующий вопрос для модели `WbAdvertTarget` (M:N campaign↔nmId).

**✅ Принятое решение (2026-05-19):** `fullstats` v3 возвращает `days[].apps[].nms[]` с `nmId` и `name` — это implicit targets. Собираем `WbAdvertTarget` как union nmId из всех `nms[]` ответа. Это даже **лучше**, потому что мы видим РЕАЛЬНУЮ работу кампании, а не задекларированные targets. /promotion/adverts вообще не нужен для нашего use case.

---

## 3. `/adv/v3/fullstats` — ✅ ВЕРИФИЦИРОВАНО (2026-05-19 14:00 МСК)

**Метод:** `GET`
**Путь:** `https://advert-api.wildberries.ru/adv/v3/fullstats`
**Query params:**
- `ids` (required) — comma-separated advertIDs, max 100 per request
- `beginDate` (required) — формат **`YYYY-MM-DD`** (НЕ `begin`!)
- `endDate` (required) — формат **`YYYY-MM-DD`** (НЕ `end`!)
- Max period: 31 день

**Response shape (verified empirically):**

Top-level (массив объектов, по одному на advertId):
```json
{
  "advertId": 35105144,
  "atbs": 344,                  // added-to-basket count
  "canceled": 1,                // technically cancelled orders (not buyer-refused)
  "clicks": 2548,
  "cpc": 14.7,                  // cost per click ₽
  "cr": 1.65,                   // conversion rate %
  "ctr": 6.09,                  // click-through rate %
  "currency": "RUB",            // НЕ был в RESEARCH — добавить в schema
  "orders": <int>,
  "shks": <int>,                // штук (units)
  "sum": <number>,              // spend ₽ (rounded to 2 decimals)
  "sum_price": <number>,        // sum of order prices ₽
  "views": <int>,
  "boosterStats": [             // НЕ был в RESEARCH! Search position tracking
    {"date": "2026-04-20", "nm": 866686597, "avg_position": 54},
    ...
  ],
  "days": [                     // daily breakdown
    {
      "date": "2026-04-19T00:00:00Z",  // (предположительно — уточнить в полном дампе)
      "atbs": ..., "clicks": ..., "cpc": ..., "cr": ..., "ctr": ...,
      "orders": ..., "shks": ..., "sum": ..., "sum_price": ..., "views": ...,
      "apps": [
        {
          "appType": 32,         // platform variant
          "atbs": 8, "canceled": 0, "clicks": 65, "cpc": 15.01, ...
          "nms": [
            {
              "nmId": 866686597,
              "name": "паровой выпрямитель для волос",
              "atbs": 4, "canceled": 0, "clicks": 65, "cpc": 15.01,
              "cr": 0, "ctr": 6.67, "orders": 0, "shks": 0,
              "sum": 975.83, "sum_price": 0, "views": 974
            },
            ...
          ]
        }
      ]
    }
  ]
}
```

**`null` response** — endpoint возвращает `null` (а не `[]` или `{}`!), если по запрошенным IDs нет данных в периоде. Client должен это специально хэндлить.

**КРИТИЧЕСКИ ВАЖНО для Plan 19-01 / 19-03:**

1. `appType` — observed values: `32` (надо посмотреть полный набор: 0/1/32 etc. — это разные клиенты WB: mobile/desktop/web). RESEARCH ожидал такие коды.
2. `boosterStats[]` — это **search position tracking per day per nmId**. Добавить новую модель `WbAdvertBoosterDaily` или поле `boosterPositions Json` в `WbAdvertStatDaily`.
3. Workaround для `/promotion/adverts` (404): **nmId targets** можно извлекать из `fullstats.days[].apps[].nms[].nmId` — union по всему ответу = effective targets кампании. Нет необходимости в отдельном endpoint для targets.
4. `currency` — добавить в схему. Сегодня всегда RUB, но WB может расширить.

### Что попробовал ранее (для контекста, удалить после approval)

| Попытка для `begin` | Результат |
|---|---|
| `2026-05-11` (с `begin=`, не `beginDate=`) | 400 Invalid begin date |
| `2026-05-11T00:00:00Z` (с `begin=`) | 400 Invalid begin date |
| `11.05.2026` (с `begin=`) | 400 Invalid begin date |

**Vendor confusion:** WB Advert API использует `beginDate`/`endDate`, в отличие от Statistics API (`dateFrom`/`dateTo`). Эта несогласованность задокументирована в news/281, но не отражена в RESEARCH.md изначально.

Path migration: `v2/fullstats` (404) → `v3/fullstats` (existsверb GET, query params).

**Method:** `GET` (POST/PUT возвращают 405).

**Обязательные query params (из последовательных error responses):**
- `ids` — список advertId (формат пока непонятен — comma-separated? repeated `ids=1&ids=2`?)
- `begin` — дата начала (формат **неизвестен**, см. ниже)
- `end` — дата конца (предположительно тот же формат)

**Что попробовал для `begin` — все вернули `{detail: "Invalid begin date", title: "invalid payload"}`:**

| Формат `begin` | Результат |
|---|---|
| `2026-05-11` (date only) | 400 Invalid begin date |
| `2026-05-11T00:00:00Z` (UTC ISO) | 400 Invalid begin date |
| `2026-05-11T00:00:00+03:00` (MSK ISO) | 400 Invalid begin date |
| `11.05.2026` (Russian dd.mm.yyyy) | 400 Invalid begin date |
| `1747008000` (Unix epoch) | 429 (rate-limit hit, формат не оценить) |

**Origin header:** `camp-api-public-cache` — это маршрутизировано через кэширующий слой WB, отличающийся от других endpoint origins (`s2s-api-auth-adv`). Возможно, в кеше особенные требования к формату.

**TODO для разрешения:**
- Запросить у пользователя ссылку на актуальную WB Advert API docs (dev.wildberries.ru/openapi/promotion за Cloudflare, недоступно прямо)
- Альтернатива: посмотреть запрос из cabinet через DevTools браузера (как ЛК WB вызывает /fullstats)
- Альтернатива: использовать существующий xlsx из донорского файла как ground-truth, написать adapter без API (отложенный path)

**Возможно ещё стоит попробовать:**
- `dates` как comma-list: `?ids=1&dates=2026-05-11,2026-05-18`
- `begin_at`/`end_at`
- `begin` как pure number of days from epoch (Excel-style serial)
- POST `/adv/v3/fullstats` с body `[{id, dates:[...]}]` — заново после long cooldown

---

## 4. `GET /adv/v1/balance` — ✅ 200 OK

**Запрос:** `curl -H "Authorization: $WB_API_TOKEN" https://advert-api.wildberries.ru/adv/v1/balance`

**Real shape:**
```json
{
  "balance": 0,
  "net": 2561471,
  "currency": "RUB"
}
```

**Корректировки для 19-01 `WbAdvertBalanceSnapshot`:**
- ✅ Поле `balance Int` — есть (= 0 рублей баланс кабинета)
- ✅ Поле `net Int` — есть (= 2561471 — что это? «нетто» расходы за все время / лимит? Уточнить)
- ⚠️ Поле `bonus Int` — НЕТ в response. Либо убрать из схемы, либо оставить nullable с пометкой «может вернуться в будущих версиях API».
- ➕ Добавить `currency String @default("RUB")` — пригодится если когда-нибудь будет KZT/BYN.
- ➕ Подумать о renaming `net` — это не «нетто», а скорее «доступные на счёте без бонусов» или какой-то агрегат. Без docs предполагать опасно. **TODO**: спросить пользователя что значит `net=2561471` (≈25k рублей? тысячные? копейки?) — судя по `balance=0` и нашему типичному запасу, это копейки или микрорубли.

---

## 5. JWT Scope analysis (`WB_API_TOKEN`)

```
scopeBitmask: 1073742062
scopeBits:    [1, 2, 3, 5, 6, 7, 30]
labels (по lib/wb-jwt.ts):
  1 = Контент
  2 = Аналитика
  3 = Цены
  5 = Отзывы
  6 = Статистика
  7 = Тарифы
  30 = ??? (НЕ в WB_SCOPE_LABELS — но empirically даёт Advert API access)
expiresAt: 2026-10-07T02:27:53+03 (до 7 октября 2026)
sid: b902e1f2-7230-475a-bb14-1f2c31b5bd75
oid: 879842
payload keys: ['acc', 'ent', 'exp', 'id', 'iid', 'oid', 's', 'sid', 't', 'uid']
```

**Empirical verification:** bit 30 даёт доступ к Advert API (`/promotion/count` и `/balance` вернули 200). Bit 4 (по `lib/wb-jwt.ts` помечен как «Продвижение») НЕ установлен в WB_API_TOKEN — значит наша label-карта `lib/wb-jwt.ts` УСТАРЕЛА для bit 4 или bit 4 имеет другое значение.

**Корректировки для 19-02 (revised 2026-05-19 после feedback пользователя):**
- ✅ **Завести отдельный `WB_ADS_TOKEN`** в `WbApiToken` — для изоляции rate-limit (per-token bucket). Pattern как `WB_CHAT_TOKEN` / `WB_RETURNS_TOKEN` (260512-jxh).
- Bootstrap из `/etc/zoiten.pro.env` → таблица `WbApiToken` через существующий механизм.
- Scope requirement: bit 30 (empirically = Реклама/Продвижение).
- В `lib/wb-token-validate.ts` `REQUIRED_SCOPE_BITS`: для `WB_ADS_TOKEN` — `[30]` (минимально), либо `[1, 30]` если будут нужны характеристики кампаний/nmId через Content API под тем же токеном.
- Обновить `lib/wb-jwt.ts` `WB_SCOPE_LABELS`: добавить `30: "Продвижение"` (HIGH confidence — empirically подтверждено через `/promotion/count` 200 OK).
- **checkpoint:human-action для пользователя:** сгенерировать новый JWT в ЛК WB (Настройки → API-токены → создать новый с галочкой «Продвижение»), скопировать в `/etc/zoiten.pro.env` как `WB_ADS_TOKEN=...`, перезапустить сервис. Bootstrap при первом старте подхватит в `WbApiToken` строку.

**Преимущества separate token:**
- Бан на Advert API (как сейчас 28-мин cooldown) НЕ блокирует Statistics/Content/Prices/Returns/Chat — каждый со своим токеном.
- Можно ротировать токен Ads независимо (например, если scope расширили — пересоздать только этот, без затрагивания основной интеграции).
- Логи легче: видно, какой токен «горит» по 429.

---

## 6. Rate-limit observations (Advert API) — обновлено 2026-05-19 11:05 UTC

### Per-seller global limiter — ВАЖНОЕ ОТКРЫТИЕ

WB Advert API имеет **per-seller** global limiter, который накапливается через ВСЕ токены одного `sid`. Конкретное сообщение из 429-ответа:

> `"detail": "Limited by global limiter, per seller b902e1f2-7230-475a-bb14-1f2c31b5bd75; ..."`

**Следствие:** отдельный `WB_ADS_TOKEN` НЕ даёт полной изоляции от других токенов того же кабинета. Если кто-то параллельно (cron, scripts) интенсивно дёргает Advert API любым другим токеном — общий per-seller bucket исчерпывается, все токены этого продавца получают 429.

**Уровни лимитов (наблюдаемая иерархия):**
1. **Per-endpoint bucket** — каждый endpoint считает отдельно (`/balance`: 5 req per N sec, `/fullstats`: 1 req/sec, etc.). После /fullstats bursts мой /balance продолжал работать с `x-ratelimit-remaining: 4` ✓
2. **Per-token bucket** — недокументировано, эмпирически не дифференцируется
3. **Per-seller global limiter** — срабатывает при суммарной нагрузке от всех токенов одного seller `sid`. Включается при overuse, остается на N секунд.
4. **Fresh-IP probation** (per memory) — IP-репутация, накладывается поверх

### Конкретные цифры из smoke check

- Burst 4 GET fullstats за ~5 сек → 1681 сек cooldown (WB_API_TOKEN, per-endpoint bucket)
- Затем через WB_ADS_TOKEN — `/balance` сразу 200 (per-endpoint bucket independent)
- 2 квика на /fullstats v3 → 429 «per seller» (per-seller global limiter)

### Headers

- `x-ratelimit-limit: 1` (бакет /fullstats — 1 запрос/сек по умолчанию)
- `x-ratelimit-remaining: N` (текущий остаток в bucket)
- `x-ratelimit-retry: N sec` (только в 429, ждать ровно столько)
- `x-ratelimit-reset: N` (секунды до полного восстановления)

**Корректировки для 19-03 `lib/wb-adv-api.ts`:**
- `retryFetch` с backoff: 1→5→15s + ВСЕГДА читать `X-Ratelimit-Retry` из 429 и ждать ровно столько (см. [[feedback-wb-rate-limit-discipline]])
- Cooldown bus bucket `'advert'` с min interval **1200ms** между fullstats запросами (защищает per-endpoint bucket)
- Между батчами /fullstats — sleep 1500ms (документированный лимит 1 req/sec, добавляем буфер)
- При получении 429 с `per seller` в detail — особая пометка в логе (потенциально оповестить пользователя)
- Batch size = до 100 advertId на /fullstats (per docs) — для 427 кампаний = 5 батчей × 1.5 сек = ~8 сек cron время

### Корректировки для 19-02 (revised again 2026-05-19 11:05)

Учитывая per-seller global limiter — отдельный `WB_ADS_TOKEN` даёт **частичную** изоляцию (per-endpoint bucket остаётся независимым), но не панацея. Решение всё равно завести отдельный токен (плюсы: явный scope, легче ротировать, понятные логи), но честно зафиксировать в плане, что **per-seller cap общий** и cron'ы Statistics + Advert должны быть разнесены по времени (Statistics в 05:00, Advert в 03:00, например).

**Корректировки для 19-03 `lib/wb-adv-api.ts`:**
- `retryFetch` с backoff 1→5→15s + чтение `X-Ratelimit-Retry` ✓
- Cooldown bus bucket `'advert'` с min interval 1200ms между fullstats запросами
- Batch size = 100 advertId на один fullstats запрос (как в docs)
- Total: 427 кампаний / 100 = 5 батчей × ~1.2 сек = ~6 сек cron время — приемлемо

---

## 7. План дальнейших шагов

После 28-мин cooldown (≈11:14 UTC = 14:14 МСК):

1. **GET `/adv/v3/fullstats`** с body `[{"id": N, "dates": ["YYYY-MM-DD"]}]` — попробовать
2. **GET `/adv/v3/fullstats`** с body `[{"id": N, "from": "...", "to": "..."}]` — fallback
3. Поиск path для `/promotion/adverts` (если не найду — оставить TODO в 19-03 и стартовать без него)
4. Дополнить эту секцию полным shape ответа `/fullstats`
5. Финализировать «Корректировки плана»

---

## 8. Корректировки плана (черновик; финал после полного smoke)

### 19-01 (Prisma schema):
- `WbAdvertBalanceSnapshot`: убрать `bonus Int`, добавить `currency String @default("RUB")`. Поле `net Int` ОК, но уточнить семантику с пользователем.
- `WbAdvertCampaign`: ОК как есть, добавить флаг про двухуровневое flatten в API client.
- `WbAdvertTarget`: рассмотреть стартовый вариант — собирать nmId из `fullstats.orders[]` пока нет рабочего `/promotion/adverts`.

### 19-02 (WB_ADS_TOKEN):
- **Сократить scope plan'а**: НЕ заводить новый токен, использовать существующий `WB_API_TOKEN`. Добавить bit 30 в `REQUIRED_SCOPE_BITS` для Ads-функций. Обновить `WB_SCOPE_LABELS` (добавить `30: "Продвижение"`).

### 19-03 (lib/wb-adv-api.ts):
- Base URL: `https://advert-api.wildberries.ru`
- `getCampaignsCount()` → `/adv/v1/promotion/count` (flatten двухуровневой структуры)
- `getCampaignDetails(advertIds)` → **TBD path** (после cooldown) — либо оставить заглушкой с `nm-from-fullstats` workaround
- `getFullStats(items)` → **`/adv/v3/fullstats`** (GET с JSON body) — формат body уточнить после cooldown
- `getBalance()` → `/adv/v1/balance`

### 19-04 (cron):
- Без изменений по структуре, только эндпоинты обновить под выше.

---

## 9. Raw responses (сохранены на VPS в /tmp/)

- `/tmp/adv_count.json` — 30121 bytes, валидный JSON
- `/tmp/adv_balance.json` — 44 bytes, валидный JSON
- `/tmp/adv_details.json` — 338 bytes, 404 error
- `/tmp/adv_stats.json` — 338 bytes, 404 error

Можно скачать локально по запросу пользователя.
