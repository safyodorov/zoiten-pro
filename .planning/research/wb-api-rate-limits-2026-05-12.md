# WB API Rate Limits — полная сводка (2026-05-12)

> **Внимание по источникам:** dev.wildberries.ru и openapi.wildberries.ru стоят за Cloudflare anti-bot (HTTP 498 на прямые fetch). Все данные получены через WebSearch с извлечением фрагментов официальной документации, которую поисковики кешируют. Там, где цифры не подтверждены официальным текстом — явно помечено «недокументировано» или «эмпирически». Уровни уверенности: HIGH = цитата из официального doc-сниппета, MEDIUM = косвенный источник/несколько источников совпадают, LOW = один косвенный источник.

---

## 1. Token types и их влияние (после 30.03.2026)

### Типы токенов

| Тип | Назначение | Rate limit (после 30.03.2026) | TTL |
|-----|-----------|-------------------------------|-----|
| **Personal** | Собственная инфраструктура продавца (on-premise, 1C) | Выше, чем у Basic/Test. На первом этапе = Service | 180 дней |
| **Service** | Облачные сервисы из каталога Business Solutions WB | Выше, чем у Basic/Test. На первом этапе = Personal | 180 дней |
| **Basic** | Вспомогательный токен (не для основных интеграций) | Ниже, чем Personal/Service | 180 дней |
| **Test** | Sandbox/тестирование | Ниже, чем Personal/Service | 180 дней |

**Ключевая цитата (news/281, HIGH confidence):**
> «Personal and Service tokens will have higher request limits than Basic and Test tokens, since Basic and Test tokens are considered auxiliary rather than primary. At the first stage of the update, the limits for Personal and Service tokens will be the same.»

**Конкретные числа дифференциации по типам токена в официальных кешах не найдены.** Страница news/281 за Cloudflare. Числа — НЕДОКУМЕНТИРОВАНО в доступных источниках, требует прямого доступа к docs или эмпирического измерения.

### Рекомендация WB (news/281):
- Если используешь Basic токен для интеграции — мигрировать на Personal или Service.
- Можно создать до 20 токенов на один магазин.

### Scope/разрешения токена (bitmask)

Поле `s` в токене — bitmask (integer), каждый бит = наличие доступа к категории:
- Content (карточки товаров)
- Statistics (статистика продаж/заказов)
- Marketplace (FBS/FBW заказы)
- Prices/Discounts (цены)
- Analytics (воронка продаж, nm-report)
- Feedbacks/Questions
- Returns (Claims)
- Buyer Chat
- Promotions Calendar
- Read-only flag (нет права записи)
- Sandbox flag

Декодировать токен можно на отдельной странице в personal cabinet WB. Источник: официальная doc-страница api-information (HIGH confidence из поисковых сниппетов).

---

## 2. Headers (X-Ratelimit-*)

Все четыре заголовка документированы официально (HIGH confidence — фрагменты из кеша dev.wildberries.ru/en/docs/openapi/api-information):

| Заголовок | Когда присылается | Семантика |
|-----------|-------------------|-----------|
| `X-Ratelimit-Limit` | Каждый ответ | Максимальный burst: сколько запросов можно отправить подряд без пауз, прежде чем bucket опустеет |
| `X-Ratelimit-Remaining` | Каждый ответ | Текущий остаток в bucket. Уменьшается на 1 после каждого запроса. При 409 в Marketplace — уменьшается сразу на 5 или 10 (см. ниже) |
| `X-Ratelimit-Reset` | Каждый ответ | Секунды до полного восполнения bucket до значения X-Ratelimit-Limit |
| `X-Ratelimit-Retry` | Только в 429-ответе | Секунды ожидания перед следующим запросом. Если сделать запрос раньше — снова получишь 429 |

**Алгоритм:** Token Bucket. Запросы распределяются равномерно по времени окна.

**Важно:** `X-Ratelimit-Remaining` снижается немедленно при ответе. При 0 следующий запрос → 429.

### Специальный кейс: 409 = «multi-credit» запрос

Официально задокументировано (HIGH confidence):
- В категории **Marketplace**: запрос с ответом 409 считается как **10 запросов** (X-Ratelimit-Remaining -10).
- В части методов: запрос с 409 считается как **5 запросов**.
- Конкретные методы, где 5 vs 10 — НЕДОКУМЕНТИРОВАНО в доступных кешах. По наблюдениям: DBS Assembly Orders — 10x.

**Практический вывод:** Всегда обрабатывай 409 как «дорогую» ошибку. Не retry без паузы — каждый retry при 409 сжигает 5-10 кредитов из bucket.

---

## 3. Anti-abuse эскалация

### Официально задокументировано

Из официальных фрагментов (MEDIUM confidence — косвенные источники):
- Превышение rate limit → **HTTP 429**
- Читай `X-Ratelimit-Retry` из 429-ответа → жди указанное число секунд
- Повторный запрос раньше указанного времени → снова 429

### Наблюдаемое поведение (LOW confidence — community, форум dev.wildberries.ru/forum/1365)

**«Fresh-IP probation» эффект** (наблюдение из форума разработчиков WB, не официальная документация):
- При развёртывании на новом сервере с постоянным IP — учащённые 429.
- Паттерн: 1-2 успешных запроса после долгого блока → снова 429 с длинным retry-after.
- Интерпретация: WB ведёт репутацию IP. Новый IP или IP после блока попадает в «пробацию» — WB дозволяет минимум трафика, потом снова блокирует, если видит интенсивность.
- Рекомендация из форума: распределять запросы равномерно, не отправлять пачками.

### Нет официальной документации по:
- Продолжительности эскалации (становится ли retry-after длиннее при повторных нарушениях)
- IP-level ban vs token-level ban
- Точному порогу, после которого наступает «расширенная» блокировка

**Требует эмпирического измерения** в реальных условиях.

---

## 4. Per-endpoint таблица

Уровни уверенности: H = HIGH, M = MEDIUM, L = LOW.

| Endpoint | Method | Category | Limit | Burst/Window | Recovery | 409 penalty | Confidence | Special |
|----------|--------|----------|-------|--------------|----------|------------|------------|---------|
| `content-api.wildberries.ru/content/v2/get/cards/list` | GET | Content | 100 req/min | не задокументировано | ~1 min | не упомянут | H | Общий лимит Content-категории |
| `content-api.wildberries.ru/content/v2/object/charcs/{subjectId}` | GET | Content | 100 req/min (общий Content) | не задокументировано | ~1 min | не упомянут | H | Входит в общий Content-лимит |
| `content-api.wildberries.ru/content/v2/cards/upload` | POST | Content (отдельный) | 10 req/min | не задокументировано | 1 min | не упомянут | H | **Отдельный лимит** от общего Content c июня 2025 |
| `content-api.wildberries.ru/content/v2/cards/update` | POST | Content (отдельный) | 10 req/min | не задокументировано | 1 min | не упомянут | H | **Отдельный лимит** от общего Content c июня 2025 |
| `discounts-prices-api.wildberries.ru/api/v2/list/goods/filter` | GET | Prices & Discounts | 10 req/6 sec | не задокументировано | 6 sec | не упомянут | H | Общий лимит P&D-категории |
| `common-api.wildberries.ru/api/v1/tariffs/commission` | GET | Tariffs | 1 req/min | не задокументировано | 1 min | не упомянут | M | Лимит для метода комиссий по категориям |
| `statistics-api.wildberries.ru/api/v1/supplier/stocks` | GET | Statistics | 3 req/30 sec | не задокументировано | 30 sec | не упомянут | H | Временная блокировка при превышении |
| `statistics-api.wildberries.ru/api/v1/supplier/orders` | GET | Statistics | 3 req/30 sec | не задокументировано | 30 sec | не упомянут | H | Общий Statistics-лимит |
| `statistics-api.wildberries.ru/api/v1/supplier/sales` | GET | Statistics | 3 req/30 sec | не задокументировано | 30 sec | не упомянут | H | Общий Statistics-лимит |
| `seller-analytics-api.wildberries.ru/api/v2/nm-report/downloads` | POST (create) | Analytics | 1 req/min | не задокументировано | 1 min | не упомянут | M | Создание задачи (async) |
| `seller-analytics-api.wildberries.ru/api/v2/nm-report/downloads` | GET (check status) | Analytics | НЕДОКУМЕНТИРОВАНО | — | — | — | L | Polling — лимит неизвестен, нужно эмпирически |
| `seller-analytics-api.wildberries.ru/api/v2/nm-report/downloads` | GET (download) | Analytics | НЕДОКУМЕНТИРОВАНО | — | — | — | L | Готовый отчёт хранится 2 часа |
| `feedbacks-api.wildberries.ru/api/v1/feedbacks` | GET | Feedbacks & Questions | 1 req/sec | не задокументировано | 1 sec | не упомянут | M | Общий лимит F&Q-категории |
| `feedbacks-api.wildberries.ru/api/v1/questions` | GET | Feedbacks & Questions | 1 req/sec | не задокументировано | 1 sec | не упомянут | M | Общий лимит F&Q-категории |
| `returns-api.wildberries.ru/api/v1/claims` | GET | Returns | 20 req/min | не задокументировано | 1 min | не упомянут | M | |
| `buyer-chat-api.wildberries.ru/api/v1/seller/events` | GET | Buyer Chat | 10 req/10 sec | не задокументировано | 10 sec | не упомянут | M | Список чатов и события |
| `dp-calendar-api.wildberries.ru/api/v1/calendar/promotions` | GET | Promotions Calendar | НЕДОКУМЕНТИРОВАНО | — | — | — | L | Нет данных в доступных источниках |

### Дополнительные endpoint'ы (контекст)

| Endpoint/Категория | Limit | Confidence | Примечание |
|-------------------|-------|------------|------------|
| Marketplace (FBS/DBS orders) — все методы | 300 req/min | H | 409 = -10 credits |
| FBW Supplies — все методы | 6 req/min | H | с июля 2025 |
| FBS Supplies/passes | 1 req/10 min | H | строгий лимит |
| Reports (финансовые отчёты) | 1 req/min | M | только чтение |
| Tariffs (кроме commission) | 3 req/30 sec | M | общий Tariffs-лимит |

---

## 5. nm-report sub-operations (fetchBuyoutPercent)

Endpoint `seller-analytics-api.wildberries.ru/api/v2/nm-report/downloads` — асинхронный, 3 фазы:

```
Phase 1: POST /downloads       → создаёт задачу, возвращает taskId
Phase 2: GET  /downloads       → проверяет статус (polling)
Phase 3: GET  /downloads/{id}  → скачивает готовый отчёт (ZIP/CSV)
```

Данные по лимитам:
- **Phase 1 (create):** ~1 req/min (MEDIUM confidence, из общего Analytics-лимита)
- **Phase 2 (status check):** НЕДОКУМЕНТИРОВАНО. Нужно эмпирически определить, как часто можно полить статус без 429.
- **Phase 3 (download):** НЕДОКУМЕНТИРОВАНО. Отчёт хранится 2 часа после готовности.
- Максимальный период отчёта: 31 день.
- Jam-подписка требуется для `DETAIL_HISTORY_REPORT` (до 1 года).

**Рекомендация по polling:** Начинать с интервала 15-30 секунд, увеличивать экспоненциально при 429.

---

## 6. Статус-коды при превышении лимитов

| Код | Смысл | Как обрабатывать |
|-----|-------|-----------------|
| **429** | Rate limit exceeded | Читай `X-Ratelimit-Retry`, жди указанное число секунд |
| **409** | Conflict (в Marketplace) | ДОРОГОЙ: -5 или -10 кредитов из bucket. Не retry без паузы |
| **503** | НЕДОКУМЕНТИРОВАНО для WB API | Возможно при аппаратных проблемах WB. Не упомянут в официальных rate-limit docs |
| **423** | НЕДОКУМЕНТИРОВАНО для WB API | Не найден в официальных docs как rate-limit статус |

---

## 7. Token TTL и управление

- **TTL:** 180 дней с момента создания (нет авто-refresh).
- **Reissue (ротация):** Создать новый токен в личном кабинете → старый немедленно аннулируется.
- **Revoke:** Удалить токен в ЛК.
- **Максимум:** 20 токенов на один магазин.
- **OAuth tokens** (если используются): access token = 12 часов, refresh token = 30 дней. Авто-обновляются.
- **Рекомендация:** Мониторить TTL, ставить алерт за 14 дней до истечения.

---

## 8. Практические рекомендации по обходу rate limits

### Стратегия для Statistics API (3 req/30 sec = 6 req/min)

- Интервал между запросами: минимум **10-11 секунд** при 3 запросах подряд.
- Для fetchStocks + fetchStocksPerWarehouse + fetchOrdersPerWarehouse: они все в одной категории → общий bucket.
- Не отправлять все три параллельно.

### Стратегия для Content API (100 req/min)

- Безопасный темп: 1 запрос/650ms (≈92 req/min, с запасом 8%).
- fetchAllCards в пагинации: при большом каталоге (1000+ SKU) укладывается легко.
- Карточка charcs — не выделен отдельный лимит, считается из общего пула 100/min.

### Стратегия для Prices API (10 req/6 sec = 100 req/min эффективно)

- Интервал: минимум **600ms** между запросами.
- 10 запросов пачкой в начале окна — корректно, но рискованно если bucket не пустой.

### Стратегия для nm-report (fetchBuyoutPercent)

1. POST create → получить taskId.
2. Ждать 30 секунд перед первым status check.
3. Polling: каждые 15-30 секунд, не чаще.
4. Timeout: если статус не «готов» через 5-10 минут — считать сбоем.

### Обработка 429

```typescript
// Pseudo-code: читай X-Ratelimit-Retry, не делай blind retry
const retryAfterSec = parseInt(response.headers['x-ratelimit-retry'] ?? '60');
await sleep(retryAfterSec * 1000 + 500); // +500ms буфер
```

### Fresh-IP Probation митигация

- Не запускать пачки запросов сразу после перезапуска сервиса/смены IP.
- «Прогрев»: первые 10-15 минут работать на 50% от допустимого лимита.
- При длинных retry-after (>60 сек) — не пытаться обойти через параллельные запросы.

---

## Sources (URLs + дата получения)

Все источники получены 2026-05-12. Прямой доступ к dev.wildberries.ru недоступен (Cloudflare 498). Данные из поисковых сниппетов Google/Bing, которые кешируют официальные страницы.

| URL | Что содержит | Confidence |
|-----|-------------|------------|
| [dev.wildberries.ru/en/knowledge-base/articles/019d49a1](https://dev.wildberries.ru/en/knowledge-base/articles/019d49a1-28ca-7735-bf2f-98210695abc7) | Главная страница лимитов (X-Ratelimit headers, token bucket, 409 penalty) | HIGH (официальный doc) |
| [dev.wildberries.ru/en/news/281](https://dev.wildberries.ru/en/news/281) | Rate limits per token type с 30.03.2026 | HIGH (официальный doc) |
| [dev.wildberries.ru/en/news/148](https://dev.wildberries.ru/en/news/148) | Новые типы токенов: Personal, Service, Basic, Test | HIGH (официальный doc) |
| [dev.wildberries.ru/en/docs/openapi/api-information](https://dev.wildberries.ru/en/docs/openapi/api-information) | Документация по токенам, scopes, headers | HIGH (официальный doc) |
| [dev.wildberries.ru/en/openapi/work-with-products](https://dev.wildberries.ru/en/openapi/work-with-products) | Content API лимиты (100 req/min, 10 req/min для upload/update) | HIGH (официальный doc) |
| [openapi.wildberries.ru/prices/api/en/](https://openapi.wildberries.ru/prices/api/en/) | Prices API лимит (10 req/6 sec) | HIGH (официальный doc) |
| [dev.wildberries.ru/en/docs/openapi/wb-tariffs](https://dev.wildberries.ru/en/docs/openapi/wb-tariffs) | Tariffs API (commission: 1 req/min) | MEDIUM (indirect) |
| [openapi.wildberries.ru/statistics/api/en/](https://openapi.wildberries.ru/statistics/api/en/) | Statistics API (stocks/orders/sales: 3 req/30 sec) | HIGH (официальный doc) |
| [dev.wildberries.ru/en/docs/openapi/analytics](https://dev.wildberries.ru/en/docs/openapi/analytics) | Analytics/nm-report (async pattern, 31 day max) | MEDIUM |
| [dev.wildberries.ru/en/docs/openapi/user-communication](https://dev.wildberries.ru/en/docs/openapi/user-communication) | Feedbacks, Questions, Buyer Chat лимиты | MEDIUM |
| [dev.wildberries.ru/en/forum/topics/1365](https://dev.wildberries.ru/en/forum/topics/1365) | Обсуждение 429 на VPS, fresh-IP behavior | LOW (community) |
| [github.com/Leonid74/wildberries-api-php](https://github.com/Leonid74/wildberries-api-php) | Third-party: 10 req/sec throttling, архивирован 02.03.2026 | LOW (third-party) |

---

## Summary: 5-10 ключевых чисел для разработки

| # | Число | Контекст | Confidence |
|---|-------|----------|------------|
| 1 | **100 req/min** | Content API (cards/list, charcs) — общий лимит категории | HIGH |
| 2 | **10 req/min** | Content API — только методы upload/update (отдельный лимит с июня 2025) | HIGH |
| 3 | **10 req/6 sec** (~100 req/min эффективно) | Prices & Discounts API (goods/filter) | HIGH |
| 4 | **3 req/30 sec** (= 6 req/min) | Statistics API (stocks, orders, sales) — самый строгий лимит для Zoiten | HIGH |
| 5 | **300 req/min** | Marketplace API (FBS/DBS orders) — 409 стоит 10 кредитов | HIGH |
| 6 | **1 req/min** | Tariffs/commission API — очень медленный лимит | MEDIUM |
| 7 | **10 req/10 sec** | Buyer Chat API (events) | MEDIUM |
| 8 | **20 req/min** | Returns API (claims) | MEDIUM |
| 9 | **180 дней** | TTL всех токенов (Personal, Service, Basic, Test) | HIGH |
| 10 | **-10 кредитов** | Цена 409-ошибки в Marketplace (против X-Ratelimit-Remaining) | HIGH |

**Самый критичный для Zoiten ERP:** Statistics API (3 req/30 sec). При fetchStocks + fetchStocksPerWarehouse + fetchOrdersPerWarehouse все три бьют в один bucket. Интервал между запросами — минимум 10 секунд.

---

## Open Questions — что нужно проверить эмпирически

1. **Конкретные числа дифференциации по token type (Personal vs Basic).** Официальная страница news/281 недоступна напрямую. Что именно «выше» — в 2 раза? В 5 раз? Неизвестно. **Действие:** Создать Basic и Personal токен, замерить X-Ratelimit-Limit в ответах.

2. **Лимиты nm-report polling (Phase 2: check status).** Сколько раз в минуту можно делать GET status без 429? **Действие:** Эмпирически, начиная с 1 req/10 sec.

3. **Лимит dp-calendar-api/promotions.** Нет данных в доступных источниках. **Действие:** Замерить X-Ratelimit-Limit из первого же ответа.

4. **Точный лимит feedbacks/questions.** Найдено «1 req/sec» из одного источника (MEDIUM). Нужна верификация. **Действие:** Замерить X-Ratelimit-Limit.

5. **Лимит returns/claims.** Найдено «20 req/min» из одного источника (MEDIUM). **Действие:** Замерить.

6. **Эскалация anti-abuse: становится ли retry-after длиннее при повторных нарушениях?** Не документировано. **Действие:** Логировать все значения X-Ratelimit-Retry при 429 в production, искать паттерн роста.

7. **Fresh-IP probation точный порог.** Сколько запросов «пропускает» WB перед новым блоком на новом IP? **Действие:** При следующем деплое на новый сервер — логировать первые 30 запросов поминутно.

8. **Отдельные лимиты для seller-analytics vs statistics-api.** Они на разных субдоменах — возможно, независимые buckets. **Действие:** Убедиться эмпирически, можно ли бить по nm-report одновременно со статистикой.

9. **HTTP 503/423 — используются ли WB как rate-limit статусы?** Не найдено в документации. **Действие:** Добавить в код обработку 503 с retry (не только 429).

10. **Платный API для cloud-сервисов (с 01.01.2026): касается ли Zoiten ERP?** Если Zoiten — on-premise (Personal token), платность не применяется. Если SaaS — нужен Service token и оплата. **Действие:** Уточнить у команды модель деплоя и тип используемого токена.
