# Раздел «Управление рекламой» — research findings

**Дата:** 2026-05-19
**Источники:** 2 Google Sheets (донор + рабочий) + WB Advert API + лекало под существующую инфраструктуру `WbApiToken` (quick 260512-jxh).

---

## 1. Что обнаружено в Google Sheets

### Донор-файл («выгрузка зойтен», 20 вкладок)

| Вкладка | Что это | Источник WB API | Используем? |
|---|---|---|---|
| Настройки | Параметры + **API-ключ** (scope bits 2,5,6,30 — отдельный JWT, действует до 2026-11-22) | — | ✓ токен забираем |
| СписокРК | Список кампаний: advertId, type, status, count, changeTime, cpm | `GET /adv/v1/promotion/count` (или `/promotion/adverts`) | ✓ |
| **АПИ_РК** | **Детальная статистика per (advertId, date, nmId, appType)** — 34 MB, ключевые данные | `POST /adv/v2/fullstats` | ✓✓✓ |
| РНП-данные | Pivot-сводка расходов по дням (rows=nmId, cols=Excel date serials 46132..46161) | производное от АПИ_РК | ❌ генерируем в UI |
| Артикулы | Локальная сводка stock + orders + speed (есть у нас в БД) | Statistics API | ❌ дублирует наши данные |
| Продажи, Заказы | Statistics API (есть у нас в БД) | Statistics API | ❌ |
| Джем воронка | Funnel per nmId per day (openCard, addToCart, orders, buyouts) | `/api/v2/nm-report/grouped/history` | Опционально (Phase X) |
| Склад | Stock per nmId (есть у нас) | Stocks API | ❌ |
| Лист35..44 | Daily snapshots — копии АПИ_РК за разные даты | производное | ❌ заменяется БД |

### Рабочий файл («автомат зойтен», 27 вкладок)

| Вкладка | Что это |
|---|---|
| сборкаЗак | Лог заказов (per timestamp): nmId, qty, ordersRub, finishedRub, ratio |
| **сборкаРК** | Агрегация рекламных открутки per (advertId, date) — то, что хотим повторить |
| сборкаДЖЕМ | Funnel-агрегация per nmId per date |
| переходы, портрет, общее кабинет | Аналитика |
| вакууматор, мясорубка, выпрямитель, аэрогрили, кофемашины, чайники, швабры, пароочистители, отпариватели, массажеры, пылесос для мебели, гриль электро, брюки, двойки, тройки, … | **Per-product unit-economics boards** — таблицы со строками-метриками (цена, эквайринг, комиссия, доставка, джем, брак, закупка, реклама) и колонками-датами (с группировкой по неделям). По-сути это ровно тот же шаблон расчёта, который мы уже сделали в `/prices/wb` PricingCalculatorDialog, только во времени |
| План, планфакт | (пропустить по запросу пользователя) |

**Ключевой инсайт:** рабочий файл — это **аналитический dashboard** на основе сырых данных из донора. Юнит-экономика per товар по времени уже в нашей БД (мы её считаем in-realtime через `lib/pricing-math.ts`), не хватает только **рекламных расходов per (день, nmId, advertId)**.

---

## 2. WB Advert API — endpoints, нужные нам

| Endpoint | Назначение | Частота |
|---|---|---|
| `GET https://advert-api.wildberries.ru/adv/v1/promotion/count` | Список кампаний (advertId, type, status) | 1× в час (~15 мин достаточно) |
| `GET /adv/v1/promotion/adverts` (или `/promotion/info`) | Детали кампании: name, nmId targets, daily budget | при обнаружении новой advertId |
| `POST /adv/v2/fullstats` | Полная статистика per (advertId, date, nmId, appType): views/clicks/ctr/cpc/sum/atbs/orders/cr/shks/sum_price | Daily cron — за последние 7 дней rolling (как `wb-orders-daily`) |
| `GET /adv/v1/balance` | Текущий баланс рекламного счёта | Daily |

**Rate limits WB Advert API:**
- `/promotion/*` — 5 запросов/секунду
- `/fullstats` — 1 запрос/секунду + max 100 advertId в батче
- Документация: <https://dev.wildberries.ru/openapi/promotion>

**Типы кампаний (`type` в `/promotion/count`):**
- `4` — каталог (legacy)
- `5` — карточка товара (legacy)
- `6` — поиск (legacy)
- `7` — рекомендации на главной (legacy)
- `8` — единая ставка (legacy)
- `9` — единая или ручная ставка (актуальный) — **все наши текущие кампании type=9**
- ⚠️ В новых кампаниях добавились типы для авто-РК (АРК), CPM-поиск+каталог — нужно проверить актуальный список через swagger.

---

## 3. Что не покрывают Sheets, но потенциально нужно

- **Авто-кампании (АРК)** — отдельный endpoint `/adv/v2/auto/...`, в листах их нет (видимо у вас сейчас не используются)
- **Категории-цели** — campaign может таргетироваться на категорию, а не nmId
- **Кластеризация кампаний** (один advertId на несколько nmId — пример из вашего sheet9 «вакууматор» где одна РК для семейства)

---

## 4. Предлагаемая модель данных (черновик)

```prisma
// Новая таблица — список кампаний (snapshot WB)
model WbAdvertCampaign {
  advertId      Int      @id            // primary key из WB
  name          String?                  // название кампании (часто null)
  type          Int                      // 4-9, см. справочник
  status        Int                      // -1, 4, 7, 8, 9, 11
  cpm           Int?                     // текущая ставка
  dailyBudget   Int?                     // дневной бюджет ₽
  startDate     DateTime?
  endDate       DateTime?
  changeTime    DateTime                 // из API
  raw           Json?                    // полный ответ /promotion/adverts для аудита
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  targets       WbAdvertTarget[]
  stats         WbAdvertStatDaily[]
  @@index([status])
  @@index([type])
}

// many-to-many advertId ↔ nmId (один advert может бить по нескольким товарам)
model WbAdvertTarget {
  id         Int      @id @default(autoincrement())
  advertId   Int
  nmId       Int                          // ссылка на WbCard.nmId (без FK)
  active     Boolean  @default(true)
  campaign   WbAdvertCampaign @relation(fields: [advertId], references: [advertId], onDelete: Cascade)
  @@unique([advertId, nmId])
  @@index([nmId])
}

// Дневная статистика per (campaign, date, nmId, platform)
model WbAdvertStatDaily {
  id         Int      @id @default(autoincrement())
  advertId   Int
  date       DateTime @db.Date            // MSK day
  nmId       Int
  appType    Int                          // 1=сайт, 32=Android, 64=iOS, ...
  views      Int      @default(0)
  clicks     Int      @default(0)
  ctr        Float?                       // %
  cpc        Float?                       // ₽
  sum        Float    @default(0)         // потрачено ₽
  atbs       Int      @default(0)         // add-to-basket
  orders     Int      @default(0)         // заказы из РК
  cr         Float?                       // конверсия в заказ %
  shks       Int      @default(0)         // штук заказано
  sumPrice   Float    @default(0)         // ₽ оборот по заказам РК
  campaign   WbAdvertCampaign @relation(fields: [advertId], references: [advertId], onDelete: Cascade)
  @@unique([advertId, date, nmId, appType])
  @@index([date])
  @@index([nmId, date])
}

// Баланс рекламного счёта (snapshot)
model WbAdvertBalanceSnapshot {
  id        Int      @id @default(autoincrement())
  capturedAt DateTime @default(now())
  balance   Float                          // основные средства ₽
  bonus     Float                          // бонусы ₽
}
```

**Связка с нашими сущностями:**
- `WbAdvertTarget.nmId` → существующая `WbCard.nmId` (через JOIN на `int`-поле, как в существующем коде)
- В UI агрегаты по imtId — через `WbCard.imtId` (как мы делаем в /prices/wb для отзывов)
- ДРР per товар = `SUM(WbAdvertStatDaily.sum) / SUM(WbAdvertStatDaily.sumPrice)` за период

---

## 5. Sync архитектура (черновик)

```
┌──────────────────────────────────────────────────┐
│ Cron: /api/cron/wb-adv-sync (15 мин)             │
│   1. GET /promotion/count → upsert campaigns     │
│   2. GET /promotion/adverts (для NEW campaigns) →│
│      обновить targets (nmId[])                   │
│   3. GET /balance → upsert WbAdvertBalanceSnapshot│
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ Cron: /api/cron/wb-adv-stats-daily (раз в день)  │
│   POST /adv/v2/fullstats за rolling 7 days       │
│   per active advertId (батчами по 100)           │
│   upsert WbAdvertStatDaily                       │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ Manual: /api/wb-adv-backfill?days=N              │
│   То же что daily, но с заданным окном (1..30)   │
└──────────────────────────────────────────────────┘
```

**Token:** `WB_ADS_TOKEN` в `WbApiToken` (как `WB_RETURNS_TOKEN`, `WB_CHAT_TOKEN`). Bootstrap из `.env` на VPS, потом редактируется через UI `/admin/settings`.

**Rate limit защиты:** copy-paste из `lib/wb-api.ts:retryFetch` (429 backoff) + AppSetting cooldown lock как в quick 260513-khv.

---

## 6. UI `/ads` — view-only v1 (черновик)

**Tab `/ads/wb` (как `/cards/wb`, `/prices/wb`):**

Основная таблица — **per Product** (как в /prices/wb), но колонки разные:

| Фото | Сводка | Тип РК | advertId / Name | Потрачено 7д | Заказов РК 7д | Оборот РК 7д | ДРР 7д | CPC | CTR | CR | Действия |
|---|---|---|---|---|---|---|---|---|---|---|---|

С group-rowSpan на product (как в /prices/wb), затем строки — каждая активная WbAdvertCampaign связанная с этим product через MarketplaceArticle → WbCard → WbAdvertTarget.

**Expandable Сводка** (как в /prices/wb expand-панели):
- Chart per nmId: bar — расходы реклама ₽/день; line — orders, ДРР %/день
- Период: 28 дней rolling

**Фильтры (toolbar):**
- Направление / Бренд / Категория / Подкатегория (каскад как везде)
- Тип кампании (multi-select)
- Статус (active / paused / all)
- Период (7/14/28 дней)

**Settings tab `/admin/settings/wb-tokens`:**
- Добавить поддержку `WB_ADS_TOKEN` (уже структура UI готова)

---

## 7. Размер работы — оценка

| Этап | Размер | Аналог |
|---|---|---|
| Schema + миграция | ~150 строк | Phase 9 returns |
| WB API client (`lib/wb-adv-api.ts`) | ~300 строк | `lib/wb-support-api.ts` |
| Sync (2 cron endpoints) | ~250 строк | Phase 10 chat-autoreply |
| Backfill endpoint | ~80 строк | quick 260518-hz7 |
| UI `/ads/wb` (table + expand + filters) | ~600 строк | Phase 14 stock + quick 260518-fg5 |
| Tests | ~200 строк | стандарт |
| **Итого** | **~1500 строк, ~4-5 wave plans** | Размер полноценной **Phase**, не quick |

**Рекомендую:** оформить как **Phase 19 — Управление рекламой WB** через `/gsd:add-phase` + далее `/gsd:discuss-phase` или `/gsd:plan-phase`.

---

## 8. Вопросы для финальной декомпозиции

Перед формализацией в phase нужно несколько решений:

### Q1. Глубина backfill исторических данных
WB Advert API позволяет до 30 дней истории. Sheets донора содержат данные с марта 2026 (≈ 80 дней). Дольше 30 дней доставать через API нельзя — нужен либо **импорт CSV из донора один раз**, либо **смириться с потерей истории старше 30 дней**.

### Q2. ROI / unit-economics — пересчитывать или хранить?
Пример: ДРР = расход_РК / оборот. Можно:
- (a) Хранить только сырые `sum` / `sumPrice` в БД, считать ДРР в RSC при запросе
- (b) Денормализовать предрассчитанные агрегаты per (nmId, date) в отдельную таблицу

Решает performance — при 100 nmId × 30 дней × 5 типов кампаний = 15k строк агрегаций, RSC справится без денормализации.

### Q3. Связка с unit-economics из /prices/wb
В вашем рабочем файле per-product таблицы (вакууматор/брюки/...) реклама — одна из строк юнит-экономики наряду с эквайрингом, комиссией. Сейчас в /prices/wb калькулятор юнит-экономики НЕ учитывает реальные расходы на рекламу — только ДРР % из глобальных ставок.

После появления WbAdvertStatDaily можно:
- (a) В калькуляторе автоматически подставлять реальный ДРР последних 7/30 дней per nmId вместо глобального
- (b) Оставить /prices/wb как есть, /ads — отдельный модуль

### Q4. Период sync
- Минимально: daily cron в ночь (как `wb-orders-daily`)
- Более актуально: каждый час stat sync, каждые 15 минут campaign list
- Можно с `?days=1` rolling каждый час — данные WB обновляются с задержкой ~1 час

---

## 9. Минимальный MVP (если хочется быстро)

Если хочется **быстро увидеть рекламные данные в UI**, без полной phase:

1. **WbApiToken row `WB_ADS_TOKEN`** + добавить в UI выбор токенов
2. **Schema:** только `WbAdvertCampaign` + `WbAdvertStatDaily` (без targets) — упрощённо
3. **Sync:** один cron `/api/cron/wb-adv-sync` daily — оба эндпоинта вместе
4. **UI:** одна страница `/ads/wb` с агрегированной таблицей (без графиков, без expand) — просто список товаров с их рекламными расходами за последние 7/28 дней

Размер MVP: ~600 строк, ~1-2 wave plans, можно через **`/gsd:quick`** с `--full` flag.
