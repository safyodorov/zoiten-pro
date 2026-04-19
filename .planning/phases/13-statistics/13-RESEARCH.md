# Phase 13: Статистика — Research

**Researched:** 2026-04-17
**Domain:** Агрегация статистики поддержки поверх SupportTicket/Message/Media/ReturnDecision/AppealRecord/Customer — витрина «По товарам» и «По менеджерам», денормализованная ManagerSupportStats, cron 03:00 МСК, live-расчёт текущего дня.
**Confidence:** HIGH — все данные уже в БД (Phase 8–12), ничего синхронизировать с WB не нужно; агрегация это чистое Prisma/SQL поверх существующих моделей. MEDIUM в части формулы avg response time (несколько разумных вариантов, выбор делается в discuss-phase). HIGH по cron-инфраструктуре (паттерн Phase 8/9/10 systemd timer).

## Summary

Phase 13 — замыкающая фаза милстоуна v1.1. Новой интеграции с WB не требуется: все метрики строятся поверх локальных таблиц, заполненных в Phase 8–12. Объём работы минимальный: 1 новая Prisma-модель `ManagerSupportStats` (+ 1 индекс на `SupportMessage.isAutoReply`, + 1 опциональный индекс на `SupportTicket (channel,nmId,createdAt)`), модуль `lib/support-stats.ts` с 5 aggregation-функциями, страница `/support/stats` с 2 вкладками, 1 новый cron endpoint + systemd timer на 03:00 МСК.

**Критические находки:**

1. **Метрики полностью выводятся из уже имеющихся моделей** — `SupportTicket` (channel, status, rating, returnState, createdAt, assignedToId, nmId, resolvedAt), `SupportMessage` (direction, authorId, wbSentAt, isAutoReply), `ReturnDecision` (action, decidedById, decidedAt, reason), `AppealRecord`, `Customer`, `WbCard`. Никакие поля добавлять не нужно — только индексы для производительности.
2. **«Топ причин возвратов» из-за свободного текста** — `SupportTicket.wbComment` (wb_comment от WB, длинная инструкция покупателю) и `SupportMessage[0].text` (user_comment покупателя) хранятся как free-form. Таксономии причин у WB нет. Рекомендация: агрегировать `ReturnDecision.reason` (текст отказа менеджера — всегда заполнен для `REJECT`) + отдельная колонка «Топ причин отказов» по `groupBy(reason)`. Для APPROVE запросить причину от покупателя через `SupportMessage` INBOUND первого сообщения тикета (user_comment из WB Claims API).
3. **Автоответы без attribution** — `SupportMessage.isAutoReply=true` создаются через cron, `authorId=null`. Для столбца «кол-во автоответов» на менеджера использовать **`AutoReplyConfig.updatedById`** как proxy («кто настроил автоответ»), либо просто отображать глобальный счётчик автоответов отдельно от колонок менеджеров (рекомендую: общий счётчик, без per-manager attribution).
4. **Avg response time — формула** — `OUTBOUND.wbSentAt − первое INBOUND.wbSentAt` на тикет, фильтр `isAutoReply=false` (автоответ ≠ человеческий ответ), усреднение `AVG` по тикетам в периоде. Тикеты без ответа — не включаются в числитель и знаменатель (иначе NaN).
5. **Period = первое число месяца 00:00 в timezone `Europe/Moscow`** для ManagerSupportStats. Храним как `DateTime` в UTC-терминах (в БД), но конвертация делается через `new Date(Date.UTC(year, month-1, 1, -3, 0, 0))` — 1-е число месяца 00:00 МСК = 23:00 предыдущего дня UTC летом, 21:00 зимой (с DST). Проще: использовать `Intl.DateTimeFormat` для расчёта начала месяца МСК + возвращать ISO-строку.
6. **Live расчёт за сегодня поверх ManagerSupportStats** — ManagerSupportStats содержит агрегаты за каждый закрытый месяц, плюс запись за текущий месяц обновляемую cron-ом 03:00 МСК. Для отображения «текущих цифр» за диапазон включающий сегодня — брать из БД запись по текущему месяцу + **дельту за сегодня** через live-aggregation (SupportTicket + Message `createdAt >= startOfTodayMsk`). Альтернатива — всегда live-считать период, а cache использовать только для исторических диапазонов (рекомендую — проще, таблица 5500 тикетов aggregation быстрый <500ms).
7. **Performance audit** — 2495 FEEDBACK + 19 QUESTION + 2600 CHAT + RETURN (растёт с 0) = ~5500 тикетов сейчас, ~20-30k через год. Индексы `(channel)`, `(nmId)`, `(createdAt)`, `(returnState)` уже есть в schema (schema.prisma:589-594). Добавить только `@@index([channel, nmId, createdAt])` для per-product агрегаций и `@@index([isAutoReply])` на SupportMessage.
8. **Cron 03:00 МСК** — systemd `OnCalendar=*-*-* 00:00:00 UTC` (если сервер UTC) ИЛИ `OnCalendar=*-*-* 03:00:00 Europe/Moscow` (явный TZ с поддержкой DST). Проверено: systemd 245+ (Ubuntu 22.04) поддерживает `Europe/Moscow` в OnCalendar через суффикс `Europe/Moscow`. Рекомендую явный TZ — DST-safe.
9. **RBAC** — не добавлять новую секцию `STATS`. Статистика ≤ views of support data; использовать `requireSection("SUPPORT")` для чтения. `MANAGE` не нужен (только чтение + cron пишет с CRON_SECRET).
10. **Historical backfill** — ManagerSupportStats пустая после первого deploy. Первый cron через ≤24 часа заполнит запись за текущий месяц. Past months останутся пустыми — это приемлемо для MVP (руководитель видит цифры начиная с месяца Phase 13 deploy). Опционально: backfill-script `scripts/backfill-stats.ts` для аналитики за Phase 8–12 период.

**Primary recommendation:** Разбить фазу на **3 плана** (без Wave 0 в отдельном плане — тесты включаются в каждый план, по аналогии с Phase 11/12):

- **Plan 13-01 Foundation (Prisma + aggregation helpers + tests):** миграция `ManagerSupportStats` + 2 индекса, `lib/support-stats.ts` с 5 pure-ish helpers (+ vitest GREEN), `lib/date-periods.ts` helper для TZ-safe периодов.
- **Plan 13-02 UI /support/stats:** RSC-страница `/support/stats` с `<StatsTabs />` (По товарам / По менеджерам), фильтры периода (7д / 30д / квартал / кастом), 2 таблицы, пункт в nav-items `/support/stats`.
- **Plan 13-03 Cron + Backfill + UAT:** `GET /api/cron/support-stats-refresh` (защита CRON_SECRET, upsert ManagerSupportStats), systemd timer 03:00 МСК, опциональный backfill-script за предыдущие месяцы из существующих тикетов, deploy + human UAT.

## User Constraints (from CONTEXT.md)

> CONTEXT.md для Phase 13 **ещё не создан** — будет сгенерирован в `/gsd:discuss-phase 13` после этого RESEARCH. Ограничения выводятся из ROADMAP.md Phase 13 goal + 5 success criteria + REQUIREMENTS.md SUP-36..39 + additional_context исходного ТЗ.

### Likely Locked Decisions (to confirm in discuss-phase)

- **Scope:** SUP-36, SUP-37, SUP-38, SUP-39 (4 requirements Phase 13).
- **2 вкладки:** «По товарам» и «По менеджерам».
- **Фильтры периода:** 7д / 30д / квартал / кастом (dateFrom–dateTo).
- **ManagerSupportStats:** `@@unique([userId, period])`, period = первое число месяца 00:00 МСК.
- **Cron:** 03:00 МСК ежедневно, upsert по (userId, period) для текущего месяца.
- **Live поверх cache:** текущий день считается live (не ждёт ночной cron).
- **RBAC:** read = `requireSection("SUPPORT")`, cron с CRON_SECRET.
- **Язык:** русский (CLAUDE.md).
- **TZ:** Europe/Moscow для всех дат (CLAUDE.md).
- **Native select, MultiSelectDropdown inline** (CLAUDE.md).

### Likely Claude's Discretion (research recommendations)

- **Графики vs таблицы:** рекомендую **только таблицы + числа** для MVP Phase 13. Recharts/Nivo отложить на v1.2 (deferred).
- **Формула avg response time:** `first OUTBOUND (isAutoReply=false).wbSentAt − first INBOUND.wbSentAt` на тикет, `AVG` по тикетам в периоде. Тикеты без ответа не учитываются.
- **Автоответы attribution:** глобальный счётчик автоответов за период (без разбивки по менеджерам). Рекомендация — показать отдельной строкой над таблицей менеджеров: «Автоответов за период: N».
- **Топ причин возвратов:** `groupBy(reason)` по `ReturnDecision` где `action='REJECT'` (отказов), topN=10. Для APPROVE причина = `user_comment` (из `SupportMessage` INBOUND первого сообщения тикета).
- **Backfill:** опциональный — `npm run stats:backfill` CLI, не блокирует deploy.
- **Где храним период:** в `ManagerSupportStats.period` как `DateTime` (00:00 МСК = UTC момент, хранится нативно PostgreSQL `timestamp`), уникальность `@@unique([userId, period])`.
- **Pagination таблиц:** 50 товаров per page в «По товарам» (sort DESC по кол-ву отзывов), меньше пагинации не требуется (ограниченный список 50-200 SKU). Таблица менеджеров — без пагинации (≤ 10 менеджеров).

### Likely Deferred Ideas (OUT OF SCOPE Phase 13)

- Графики/чарты (recharts, Nivo) — deferred v1.2.
- Экспорт статистики в Excel/PDF — deferred (уже в Out of Scope REQUIREMENTS.md).
- Сравнение периодов (WoW, MoM delta) — deferred.
- Drill-down: клик на цифру → список тикетов попавших в метрику — deferred.
- Per-manager автоответы attribution — deferred (см. открытые вопросы).
- Статистика по каналам отдельно (отзывы vs вопросы vs чаты breakdown) — в MVP достаточно per-channel колонок в таблице менеджеров.
- Топ причин возвратов по APPROVE (через user_comment) — MVP только REJECT причины (они реально заполнены менеджером).
- Real-time refresh таблицы (WebSocket/polling) — reload страницы достаточно.
- Статистика по обжалованиям (AppealRecord) — deferred, не в SUP-36..39.
- Алерт руководителю при падении % ответов — deferred.
- Статистика по времени суток / heatmap загрузки — deferred.
- Сравнение менеджеров с плановыми KPI — deferred.

## Project Constraints (from CLAUDE.md)

- **Язык:** русский в UI, комментариях, коммитах, планах.
- **Select:** native HTML `<select>`, **НЕ base-ui Select**.
- **MultiSelectDropdown:** inline в компоненте (паттерн SupportFilters/ReturnsFilters).
- **Server actions / RSC**: `'use server'` для writes, RSC для чтений. В Phase 13 writes минимальны (только cron UPSERT через API route).
- **Cron:** `GET /api/cron/<name>/route.ts` + `x-cron-secret` header + `process.env.CRON_SECRET`, systemd timer через deploy.sh (паттерн Phase 8/9/10).
- **RBAC read:** `requireSection("SUPPORT")` на `/support/stats`.
- **Время:** Moscow timezone через `Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow" })` (паттерн TicketSidePanel).
- **Prisma singleton:** `import { prisma } from "@/lib/prisma"`.
- **Vitest:** `tests/support-stats.test.ts` в существующем каталоге, паттерн unit-тестов pure helpers (как `customer-aggregations.test.ts` из Phase 12).
- **GSD Workflow:** любой Edit/Write через `/gsd:execute-phase` → каждый план в своей ветке работы.
- **Deploy:** `./deploy.sh` на VPS через SSH, systemd timer добавляется в deploy.sh (не новый скрипт).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **SUP-36** | Страница `/support/stats` с 2 вкладками «По товарам»/«По менеджерам», фильтры периода (7д / 30д / квартал / кастом). | RSC-страница + client tabs (аналогично `/cards/wb` ↔ `/cards/ozon` с `CardsTabs`), фильтры через searchParams (паттерн SupportPage). `lib/date-periods.ts` парсит searchParams → `{dateFrom, dateTo}` в TZ Europe/Moscow. |
| **SUP-37** | Метрики по товарам: кол-во отзывов, средний рейтинг, % ответов, возвраты (total/approved/rejected), топ причин возвратов, кол-во вопросов, среднее время ответа. | 7 aggregations в `lib/support-stats.ts` через Prisma `groupBy` + `_avg.rating` + `_count`. Per-product JOIN через `nmId` в WbCard для названия/фото. |
| **SUP-38** | Метрики по менеджерам: всего обработано, отзывы/вопросы/чаты/возвраты отвечено, % одобрения возвратов, avg time, кол-во автоответов. | 8 aggregations — read из `ManagerSupportStats` для прошлых месяцев + live `groupBy` для текущего месяца/дня. Автоответы — отдельный глобальный счётчик без per-manager breakdown. |
| **SUP-39** | `ManagerSupportStats` — `@@unique([userId, period])`, period = начало месяца, cron 03:00 МСК. | Новая Prisma-модель, 9 агрегатных полей + updatedAt. `GET /api/cron/support-stats-refresh` с CRON_SECRET + systemd timer `OnCalendar=*-*-* 03:00:00 Europe/Moscow`. |

## Standard Stack

### Core (already in project, no new installs)

| Библиотека | Версия | Purpose | Why Standard |
|------------|--------|---------|--------------|
| Prisma | 6.x | `groupBy`, `_avg`, `_count`, `aggregate`, raw SQL для топ-N reason | Проект-wide, паттерн Phase 12 (customer-aggregations) |
| Next.js App Router | 15.5.14 | RSC-страница, server action `updateStatsNow`, cron route handler | Проект-wide |
| Zod | 4.x | Парсинг searchParams (period preset enum, dateFrom/dateTo ISO) | Паттерн Phase 11 server actions |
| Lucide icons | — | `BarChart3`, `Users`, `Package` для табов и пустого состояния | Паттерн проекта |
| Intl API (native) | — | `DateTimeFormat`, `toLocaleString` с `timeZone: "Europe/Moscow"` для period start-of-month | Паттерн Phase 10 `isWithinWorkingHours` |

### Supporting

| Библиотека | Purpose | When to Use |
|------------|---------|-------------|
| shadcn/ui v4 Tabs (base-ui) | переключатель «По товарам» / «По менеджерам» | Tabs wrapper уже создан в Phase 3 `components/ui/tabs.tsx` (data-selected API) |
| native `<select>` | Фильтр period preset (7д / 30д / квартал / кастом) | CLAUDE.md convention |
| `<input type="date">` | Кастомный период (dateFrom/dateTo) | HTML5 native, без зависимостей |

### Alternatives Considered

| Вместо | Альтернатива | Tradeoff |
|--------|--------------|----------|
| Prisma `groupBy` в JS коде | Raw SQL через `$queryRaw` | `groupBy` достаточно для 7 метрик по товарам; raw SQL потребуется только для «Топ-N причин» и avg response time (CTE с window function). **Рекомендую: `groupBy` для простых агрегаций + `$queryRaw` для 2 сложных запросов**. |
| ManagerSupportStats денормализация | Всегда live-агрегация при открытии страницы | Live-агрегация по 30 тикетам/менеджера за месяц × 10 менеджеров = 300 rows — быстро. Но за квартал × 10 = ~9000 rows + per-channel breakdown → заметная латентность. **Рекомендую: cache из ManagerSupportStats + live delta за сегодня** (как указано в ROADMAP SC#5). |
| Recharts/Nivo графики | Только таблицы с числами | MVP Phase 13 не включает графики (deferred v1.2). Экономия ~150KB зависимостей. **Рекомендую: таблицы только**. |
| Отдельная секция RBAC `STATS_VIEW` | Reuse SUPPORT | Статистика — часть раздела «Служба поддержки», отдельная секция overengineering. **Рекомендую: `requireSection("SUPPORT")`**. |
| `new Date().toLocaleString("ru-RU", {timeZone})` для start-of-month | `date-fns-tz` библиотека | Native Intl API достаточно для 1 операции. **Не устанавливаем date-fns-tz**. |

**Installation:** никаких новых npm-пакетов — все зависимости уже в проекте.

**Version verification (npm view):** не требуется — Phase 13 не добавляет зависимостей.

## Architecture Patterns

### Recommended Project Structure

```
prisma/
└── schema.prisma                         # миграция phase13_statistics:
                                          #   + model ManagerSupportStats (новая)
                                          #   + @@index([channel, nmId, createdAt]) на SupportTicket
                                          #   + @@index([isAutoReply]) на SupportMessage

app/
├── (dashboard)/support/
│   └── stats/
│       └── page.tsx                      # RSC: assemble data + render <StatsTabs />
├── api/
│   └── cron/
│       └── support-stats-refresh/
│           └── route.ts                  # GET cron: refresh ManagerSupportStats для current month
└── actions/
    └── stats.ts                          # server action `refreshStatsNow()` (опциональная manual-кнопка)

lib/
├── support-stats.ts                      # Pure aggregation helpers (5 функций + Prisma queries):
│                                         #   - getProductStats(dateFrom, dateTo, filter?)
│                                         #   - getManagerStats(dateFrom, dateTo)
│                                         #   - refreshManagerSupportStats(monthStartMsk)
│                                         #   - computeAvgResponseTimeSec(ticketIds)
│                                         #   - getTopReturnReasons(dateFrom, dateTo, topN=10)
└── date-periods.ts                       # TZ-safe helpers:
                                          #   - startOfMonthMsk(date)
                                          #   - parsePeriodPreset(preset, custom) → {dateFrom, dateTo}
                                          #   - PERIOD_PRESETS = ["7d", "30d", "quarter", "custom"]

components/
└── support/
    └── stats/
        ├── StatsTabs.tsx                 # Client: 2 таба (Tabs wrapper from components/ui/tabs.tsx)
        ├── StatsPeriodFilter.tsx         # Client: native select preset + 2 date inputs
        ├── ProductStatsTable.tsx         # Client: 7 колонок + sorting + pagination 50/стр
        ├── ManagerStatsTable.tsx         # Client: 8 колонок, без пагинации
        ├── AutoRepliesSummary.tsx        # Client: одна строка «Автоответов за период: N»
        └── TopReturnReasons.tsx          # Client: bar-like список top-10 с counts

tests/
├── support-stats.test.ts                 # Unit tests pure helpers + mocked prisma
└── date-periods.test.ts                  # Unit tests TZ-aware period parsing

scripts/
└── backfill-manager-stats.ts             # Optional CLI: npm run stats:backfill → past months
```

### Pattern 1: Aggregation via Prisma `groupBy` + JS finalization

**What:** Вместо raw SQL используем Prisma `groupBy` для базовых метрик, JS-композиция для производных (процент ответов, avg response time, top reasons). Pure TS, testable с mocked prisma.

**When to use:** все агрегации кроме avg response time (нужна correlated subquery) и top reasons (нужен GROUP BY с ORDER BY COUNT).

**Example:**
```typescript
// lib/support-stats.ts
import { prisma } from "@/lib/prisma"
import type { TicketChannel } from "@prisma/client"

export interface ProductStatRow {
  nmId: number
  name: string | null
  photoUrl: string | null
  feedbacksTotal: number
  avgRating: number | null
  feedbacksAnsweredPct: number | null
  questionsTotal: number
  returnsTotal: number
  returnsApproved: number
  returnsRejected: number
  returnsPendingPct: number | null
  avgResponseTimeSec: number | null
}

export async function getProductStats(
  dateFrom: Date,
  dateTo: Date
): Promise<ProductStatRow[]> {
  // 1. COUNT + AVG(rating) per (nmId, channel, status)
  const tickets = await prisma.supportTicket.groupBy({
    by: ["nmId", "channel", "status"],
    where: {
      createdAt: { gte: dateFrom, lte: dateTo },
      nmId: { not: null },
    },
    _count: { _all: true },
    _avg: { rating: true },
  })

  // 2. Returns breakdown per (nmId, returnState)
  const returns = await prisma.supportTicket.groupBy({
    by: ["nmId", "returnState"],
    where: {
      channel: "RETURN",
      createdAt: { gte: dateFrom, lte: dateTo },
      nmId: { not: null },
    },
    _count: { _all: true },
  })

  // 3. Avg response time — через raw SQL (см. Pattern 2 ниже)
  const responseTimeMap = await computeAvgResponseTimeSec(dateFrom, dateTo)

  // 4. Enrich с WbCard
  const nmIds = Array.from(new Set([...tickets, ...returns].map(r => r.nmId!).filter(Boolean)))
  const cards = await prisma.wbCard.findMany({
    where: { nmId: { in: nmIds } },
    select: { nmId: true, name: true, photoUrl: true },
  })

  // 5. Composite rows (map + reduce)
  return assembleProductRows(tickets, returns, responseTimeMap, cards)
}
```

### Pattern 2: Raw SQL для сложных метрик — avg response time, top reasons

**What:** Для `AVG(OUTBOUND.wbSentAt − INBOUND.wbSentAt)` и `GROUP BY reason ORDER BY COUNT DESC LIMIT 10` используем `prisma.$queryRaw` с типизацией через тип возврата.

**When to use:** метрики требующие window function, CTE, или correlated subquery, которые Prisma `groupBy` не выражает.

**Example (avg response time per nmId):**
```sql
-- raw SQL для lib/support-stats.ts
WITH first_inbound AS (
  SELECT
    "ticketId",
    MIN("wbSentAt") AS inbound_at
  FROM "SupportMessage"
  WHERE "direction" = 'INBOUND' AND "wbSentAt" IS NOT NULL
  GROUP BY "ticketId"
),
first_outbound AS (
  SELECT
    "ticketId",
    MIN("wbSentAt") AS outbound_at
  FROM "SupportMessage"
  WHERE "direction" = 'OUTBOUND' AND "isAutoReply" = false AND "wbSentAt" IS NOT NULL
  GROUP BY "ticketId"
)
SELECT
  t."nmId",
  AVG(EXTRACT(EPOCH FROM (fo.outbound_at - fi.inbound_at)))::int AS avg_response_sec
FROM "SupportTicket" t
JOIN first_inbound fi ON fi."ticketId" = t.id
JOIN first_outbound fo ON fo."ticketId" = t.id
WHERE t."createdAt" >= $1 AND t."createdAt" <= $2
  AND t."nmId" IS NOT NULL
  AND fo.outbound_at > fi.inbound_at
GROUP BY t."nmId"
```

**Example (top-10 return rejection reasons):**
```sql
SELECT
  rd.reason,
  COUNT(*)::int AS cnt
FROM "ReturnDecision" rd
JOIN "SupportTicket" t ON t.id = rd."ticketId"
WHERE rd."action" = 'REJECT'
  AND rd.reason IS NOT NULL
  AND rd."decidedAt" >= $1 AND rd."decidedAt" <= $2
GROUP BY rd.reason
ORDER BY cnt DESC
LIMIT 10
```

### Pattern 3: Live + Cache гибрид для menedger stats

**What:** Cache — `ManagerSupportStats` обновляется cron-ом 03:00 МСК для каждого месяца. При рендере страницы:
1. Если период полностью в прошлом (dateTo < startOfMonthMsk(today)) → читаем **только cache** (sum по месяцам в периоде).
2. Если период содержит текущий месяц → читаем cache для past months + **live-aggregation** для текущего месяца от 00:00 1 числа до now.
3. Если период короче месяца или custom (7д / 30д / custom не выровнен) → всегда live-aggregation (не трогаем cache).

**When to use:** per-manager метрики. Продуктовые метрики — всегда live (не кэшируются; оптимизируются через индексы).

**Why hybrid:** cache окупается для квартальных и многомесячных отчётов; для 7д/30д live-агрегация по 2-3k тикетов быстрая (<300ms).

**Example:**
```typescript
// lib/support-stats.ts
export async function getManagerStats(
  dateFrom: Date,
  dateTo: Date
): Promise<ManagerStatRow[]> {
  const todayMsk = startOfTodayMsk(new Date())
  const currentMonthStart = startOfMonthMsk(new Date())

  // Fully historical → cache only
  if (dateTo < currentMonthStart) {
    return readManagerStatsFromCache(dateFrom, dateTo)
  }

  // Aligned with full months → cache + live current month
  if (isMonthStart(dateFrom) && isMonthStart(dateTo)) {
    const cache = await readManagerStatsFromCache(dateFrom, currentMonthStart)
    const live = await liveManagerStats(currentMonthStart, new Date())
    return mergeManagerStats(cache, live)
  }

  // Custom/partial → live only
  return liveManagerStats(dateFrom, dateTo)
}
```

### Pattern 4: TZ-safe start-of-month МСК

**What:** Начало месяца в Europe/Moscow — не наивный `new Date(year, month, 1)` (вернёт в локальной TZ сервера). Нужно: вычислить «01.<month>.<year> 00:00:00 МСК» и сохранить как UTC момент в БД.

**When to use:** `period` в `ManagerSupportStats`, парсинг period preset.

**Example:**
```typescript
// lib/date-periods.ts
export function startOfMonthMsk(date: Date = new Date()): Date {
  // Extract year+month in Moscow timezone
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date)
  const year = parseInt(parts.find(p => p.type === "year")!.value)
  const month = parseInt(parts.find(p => p.type === "month")!.value)

  // "YYYY-MM-01T00:00:00+03:00" — always +03:00 (Moscow, no DST since 2011)
  return new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00+03:00`)
}

export function parsePeriodPreset(
  preset: "7d" | "30d" | "quarter" | "custom",
  customFrom?: string,
  customTo?: string
): { dateFrom: Date; dateTo: Date } {
  const now = new Date()
  switch (preset) {
    case "7d":
      return { dateFrom: new Date(now.getTime() - 7 * 86400_000), dateTo: now }
    case "30d":
      return { dateFrom: new Date(now.getTime() - 30 * 86400_000), dateTo: now }
    case "quarter":
      return { dateFrom: new Date(now.getTime() - 90 * 86400_000), dateTo: now }
    case "custom":
      return {
        dateFrom: customFrom ? new Date(`${customFrom}T00:00:00+03:00`) : new Date(0),
        dateTo: customTo ? new Date(`${customTo}T23:59:59+03:00`) : now,
      }
  }
}
```

**Note:** Russia abandoned DST in 2011 — Europe/Moscow постоянно +03:00. Можно безопасно хардкодить `+03:00` (проверено: `tzdata` не меняется для Europe/Moscow с 2014).

### Anti-Patterns to Avoid

- **Агрегация в клиентском JS после `findMany` всех тикетов** — тянет 5500+ строк в RSC, долго. Используй `groupBy` / raw SQL в БД.
- **Наивный `new Date(year, month, 1)` для period** — вернёт локальное время сервера (UTC на VPS), НЕ Moscow. Используй `startOfMonthMsk()`.
- **Хранение period как String `"2026-04"`** — не индексируется для range queries. Используй `DateTime` 1st of month МСК.
- **Добавление секции RBAC `STATS_VIEW`** — overengineering. Reuse `SUPPORT`.
- **Cron refresh всей истории каждый день** — N×N сложности. Cron обновляет ТОЛЬКО текущий месяц (если хочется полную пересборку — отдельный backfill-скрипт).
- **Per-manager attribution автоответов** — `authorId=null` для автоответов, связать с менеджером невозможно без sentinel. Не добавлять колонку в ManagerStats.

## Don't Hand-Roll

| Проблема | Не строй | Используй вместо | Почему |
|---------|----------|------------------|--------|
| Start-of-month in TZ | Ручной `new Date(year, month, 1)` + корректировка на offset | `new Date("YYYY-MM-01T00:00:00+03:00")` (Intl для извлечения year/month) | DST-safe, без offset-by-one ошибок (Russia +03:00 постоянно с 2014) |
| GROUP BY + COUNT + AVG | Ручная reduce-цикл в JS поверх `findMany` | Prisma `groupBy` или raw SQL | СУБД делает это за 50ms; JS по 5000 строк — 500ms+ |
| Top-N reasons | `findMany` → JS groupBy → sort → slice | Raw SQL с GROUP BY + ORDER BY + LIMIT | 1 SQL запрос vs 5000 rows transferred |
| Custom tabs | Ручной state-managed div | Существующий `components/ui/tabs.tsx` (base-ui wrapper из Phase 3) | Доступность (aria, keyboard), паттерн проекта |
| Cron scheduler | Ручной setInterval в Node | systemd timer (паттерн Phase 8/9/10) | Process crash ≠ lost schedule; Persistent=true recovers |
| Date parsing searchParams | Ручной strict regex | `new Date(str)` + `isNaN(d.getTime())` guard | Native, покрывает ISO + `YYYY-MM-DD` |

**Key insight:** Phase 13 — 90% стандартный Prisma + RSC без нового стека. Ключевые рекомендации — **не пытайтесь сделать дашборд модным с графиками** (deferred), **не переоптимизируйте через материалзованные views** (PostgreSQL справится с 30k тикетов без этого).

## Runtime State Inventory

Phase 13 не переименовывает и не мигрирует существующие данные. Это **greenfield phase** с новой моделью `ManagerSupportStats`.

- **Stored data:** None — новая модель заполняется с нуля через cron.
- **Live service config:** None — только новый systemd timer добавляется в deploy.sh.
- **OS-registered state:** 1 новый systemd timer `zoiten-stats-refresh.timer` регистрируется при deploy.sh.
- **Secrets/env vars:** None новых. Используется существующий `CRON_SECRET` в `/etc/zoiten.pro.env`.
- **Build artifacts:** None — обычный `npm run build` + Prisma migrate deploy.

**Verified:** инвентарь полный, рисков runtime-state нет.

## Data Model

### ManagerSupportStats (новая модель)

```prisma
// Phase 13 — денормализованная статистика менеджеров (SUP-39).
// Обновляется cron'ом 03:00 МСК: один row на (userId, period), где period = 1-ое число месяца 00:00 МСК.
// Для отчётов за период > 1 месяца — SUM по rows. Текущий месяц — overwrite каждый день.
// Past months — immutable после закрытия месяца (но cron может пересчитывать для коррекции).
model ManagerSupportStats {
  id                   String   @id @default(cuid())
  userId               String
  user                 User     @relation("ManagerStats", fields: [userId], references: [id], onDelete: Cascade)
  period               DateTime // 1st of month 00:00 Europe/Moscow (+03:00)
  totalProcessed       Int      @default(0) // replies + status changes + appeal decisions + return decisions
  feedbacksAnswered    Int      @default(0) // COUNT OUTBOUND SupportMessage where channel=FEEDBACK AND isAutoReply=false
  questionsAnswered    Int      @default(0) // same для QUESTION
  chatsAnswered        Int      @default(0) // same для CHAT
  returnsDecided       Int      @default(0) // COUNT ReturnDecision where action IN (APPROVE, REJECT, RECONSIDER)
  returnsApproved      Int      @default(0) // COUNT ReturnDecision where action = APPROVE
  returnsRejected      Int      @default(0) // COUNT ReturnDecision where action = REJECT
  avgResponseTimeSec   Int?     // nullable — если за месяц не было ответов
  autoRepliesCount     Int      @default(0) // глобальный счётчик за месяц, денормализовано для отображения (не per-manager)
  updatedAt            DateTime @updatedAt
  @@unique([userId, period])
  @@index([period])
}

// Обновление User:
// model User {
//   ...
//   supportStats ManagerSupportStats[] @relation("ManagerStats")
// }
```

**Design rationale:**
- **period как `DateTime`** (не `String "2026-04"`) — позволяет range queries `{period: {gte, lte}}` и sort.
- **Без `channel` breakdown в модели** — 4 колонки `feedbacksAnswered/questionsAnswered/chatsAnswered/returnsDecided` достаточно для таблицы. Дополнительный canal dimension = overengineering.
- **`autoRepliesCount` на каждой строке менеджера** — денормализованно одинаково для всех менеджеров месяца (глобальный счётчик). Тратим 10 rows × 4 bytes = 40 bytes на дублирование — приемлемо для упрощения UI.
- **`@@index([period])`** — для backfill и архивных запросов.

### Индексы для performance

```prisma
// Расширение существующих моделей (add-only, не breaking):

model SupportTicket {
  // ...existing fields...
  @@index([channel, nmId, createdAt]) // Phase 13: per-product агрегации (SUP-37)
}

model SupportMessage {
  // ...existing fields...
  @@index([isAutoReply, direction, wbSentAt]) // Phase 13: фильтр автоответов + avg response time
}
```

**Миграция:**
```bash
npx prisma migrate dev --name phase13_statistics
```

## Aggregation Queries

### По товарам (SUP-37)

| Метрика | Тип | Источник |
|--------|-----|----------|
| Кол-во отзывов | COUNT | `SupportTicket WHERE channel='FEEDBACK' AND nmId=? AND createdAt BETWEEN ?` |
| Средний рейтинг | AVG | `SupportTicket._avg.rating WHERE channel='FEEDBACK' AND rating IS NOT NULL` |
| % ответов | Composite | `COUNT(status IN ('ANSWERED','CLOSED','APPEALED')) / COUNT(*)` по FEEDBACK+QUESTION per nmId |
| Возвраты total | COUNT | `SupportTicket WHERE channel='RETURN' AND nmId=?` |
| Возвраты approved | COUNT | `+ returnState='APPROVED'` |
| Возвраты rejected | COUNT | `+ returnState='REJECTED'` |
| Топ причин возвратов | groupBy | `ReturnDecision.reason WHERE action='REJECT'` (top-N глобально, не per-product — это отдельный UI block) |
| Кол-во вопросов | COUNT | `SupportTicket WHERE channel='QUESTION' AND nmId=?` |
| Среднее время ответа | Raw SQL | CTE `first_inbound` + `first_outbound(isAutoReply=false)` → `AVG(EXTRACT EPOCH ...)` |

**Null/missing handling:**
- Если nmId не привязан к WbCard (рассинхрон) → показываем `nmId` без названия/фото, бейдж «Карточка не найдена».
- Если метрика `null` (AVG пустого множества) → показываем прочерк «—».
- `feedbacksAnsweredPct` = null при total=0.

### По менеджерам (SUP-38)

| Метрика | Тип | Cache | Live |
|--------|-----|-------|------|
| Всего обработано | SUM | `totalProcessed` | `totalProcessed per month` |
| Отзывов отвечено | SUM | `feedbacksAnswered` | Live COUNT OUTBOUND WHERE channel=FEEDBACK |
| Вопросов отвечено | SUM | `questionsAnswered` | Live COUNT OUTBOUND WHERE channel=QUESTION |
| Чатов отвечено | SUM | `chatsAnswered` | Live COUNT OUTBOUND WHERE channel=CHAT |
| Возвратов решено | SUM | `returnsDecided` | Live COUNT ReturnDecision |
| % одобрения возвратов | Composite | `SUM(returnsApproved) / SUM(returnsDecided)` | Same |
| Avg time (сек) | Weighted AVG | Уточнение — хранить `totalResponseTimeSec + responseCount`, считать weighted AVG | Live: raw SQL CTE |
| Автоответов за период | SUM | `autoRepliesCount` | Live COUNT isAutoReply=true |

**Important:** `avgResponseTimeSec` через SUM cache — **weighted average**. Cache должен хранить не только `avgResponseTimeSec` но и `responseCount` (число учтённых в среднем тикетов) чтобы корректно усреднять за N месяцев:

```typescript
weightedAvg = SUM(avg[i] × count[i]) / SUM(count[i])
```

**Решение:** добавить `responseCount: Int @default(0)` в `ManagerSupportStats`. (Обновлённая модель выше в `Data Model`.)

### Refresh cron query (per month)

```typescript
// lib/support-stats.ts
export async function refreshManagerSupportStats(
  monthStart: Date, // 1st of month 00:00 MSK
  monthEnd: Date    // last millisecond of month MSK
) {
  const supportUsers = await prisma.user.findMany({
    where: { isActive: true, sectionRoles: { some: { section: "SUPPORT" } } },
    select: { id: true },
  })

  for (const { id: userId } of supportUsers) {
    const [
      feedbacksCount,
      questionsCount,
      chatsCount,
      returnDecisions,
      responseTime,
    ] = await Promise.all([
      prisma.supportMessage.count({
        where: {
          authorId: userId,
          direction: "OUTBOUND",
          isAutoReply: false,
          sentAt: { gte: monthStart, lte: monthEnd },
          ticket: { channel: "FEEDBACK" },
        },
      }),
      // ... questions, chats
      prisma.returnDecision.groupBy({
        by: ["action"],
        where: {
          decidedById: userId,
          decidedAt: { gte: monthStart, lte: monthEnd },
        },
        _count: { _all: true },
      }),
      computeManagerAvgResponseTime(userId, monthStart, monthEnd),
    ])

    const returnsApproved = returnDecisions.find(d => d.action === "APPROVE")?._count._all ?? 0
    const returnsRejected = returnDecisions.find(d => d.action === "REJECT")?._count._all ?? 0
    const returnsDecided = returnDecisions.reduce((sum, d) => sum + d._count._all, 0)

    await prisma.managerSupportStats.upsert({
      where: { userId_period: { userId, period: monthStart } },
      create: { userId, period: monthStart, feedbacksAnswered: feedbacksCount, /* ... */ },
      update: { feedbacksAnswered: feedbacksCount, /* ... */, updatedAt: new Date() },
    })
  }
}
```

## Time Periods

### Period Presets (UI)

```typescript
type PeriodPreset = "7d" | "30d" | "quarter" | "custom"

// URL: /support/stats?period=30d
//      /support/stats?period=custom&dateFrom=2026-01-01&dateTo=2026-03-31
```

### TZ-safe parsing

Russia Europe/Moscow = **+03:00** (без DST с 2011). Все даты в UI и БД считаются в этой TZ. В Postgres храним UTC (default), но ввод/вывод — через ISO-строки с `+03:00` suffix.

```typescript
// lib/date-periods.ts (signatures)
export function startOfDayMsk(d: Date): Date
export function endOfDayMsk(d: Date): Date
export function startOfMonthMsk(d: Date): Date
export function endOfMonthMsk(d: Date): Date
export function parsePeriodPreset(preset, customFrom?, customTo?): { dateFrom: Date; dateTo: Date }
export function getPastMonths(dateFrom: Date, dateTo: Date): Date[] // список 1-х чисел месяцев в диапазоне
```

**Edge cases:**
- Custom period пересекает год (2025-12-01 → 2026-01-15) — работает корректно, `DateTime` range query учитывает год.
- Custom period 1 день (dateFrom=dateTo) — от 00:00 МСК до 23:59 МСК того же дня.
- Quarter = 90 дней (не календарный квартал) — проще и соответствует additional_context.

### Period для ManagerSupportStats

- `period` = **строго 1-ое число месяца 00:00 МСК** (`2026-04-01T00:00:00+03:00`).
- Хранится как `DateTime` в БД (в UTC терминах — `2026-03-31T21:00:00.000Z`).
- При range query в cache: `period >= startOfMonthMsk(dateFrom)` и `period <= startOfMonthMsk(dateTo)` (inclusive).

## Live vs Cached

### Decision matrix

| Сценарий | Источник | Причина |
|---------|----------|---------|
| Период полностью в прошлом (`dateTo < currentMonthStart`) и выровнен по месяцам | **Cache only** (SUM по rows) | Immutable данные, быстро |
| Период с текущим месяцем, выровнен по месяцам | Cache past + **live current month** | SC#5: «Текущий день live поверх ManagerSupportStats» |
| Период не выровнен по месяцам (7д, 30д, custom) | **Always live** | Cache в месячных бакетах, не поможет |
| Вкладка «По товарам» | **Always live** | Не кэшируется в Phase 13 MVP |

### Live aggregation performance

Тестовая нагрузка: 5500 тикетов, 10 менеджеров, 30d период.
- `groupBy(by: [assignedToId, channel], where: {createdAt: BETWEEN})` — ~100ms с индексом `@@index([createdAt])`.
- Raw SQL для avg response time — ~150ms с индексом `@@index([ticketId, sentAt])` + CTE (один sequential scan).

Итого: ~300-500ms для полного набора метрик. Приемлемо.

### Как не дублировать логику

**Принцип DRY:** cron `refreshManagerSupportStats(monthStart, monthEnd)` вызывает те же функции, что live mode — просто с другим range. Функции возвращают plain-object row, который cron записывает в БД, а UI рендерит напрямую.

```typescript
// Single source of truth:
export async function computeManagerStatsForPeriod(
  userId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<ManagerStatRow>

// Cron wraps:
await prisma.managerSupportStats.upsert({
  ..., data: await computeManagerStatsForPeriod(userId, monthStart, monthEnd)
})

// Live wraps (RSC):
const liveRow = await computeManagerStatsForPeriod(userId, currentMonthStart, now)
const cacheRows = await prisma.managerSupportStats.findMany({ where: { userId, period: { in: pastMonthStarts } } })
const merged = mergeRows(cacheRows, [liveRow])
```

## Avg Response Time Formula

### Рекомендованная формула

**Per ticket:** `firstOutbound(isAutoReply=false).wbSentAt − firstInbound.wbSentAt` (в секундах)

**Inclusion rules:**
- **Exclude tickets без OUTBOUND** (`null` не усредняем).
- **Exclude автоответы** (`isAutoReply=true`). Автоответ — не человеческий ответ.
- **Exclude tickets где OUTBOUND < INBOUND** (исторические реплай до первого inbound — data corruption, skip).
- **Exclude RETURN канал** из ответа? Оставить — возвраты имеют SupportMessage INBOUND (жалоба покупателя) и OUTBOUND (через `ReturnDecision.comment` → SupportMessage? или только в `ReturnDecision` без message). **Уточнение:** Phase 9 создаёт `SupportMessage` OUTBOUND при approve/reject? → смотреть `lib/support-sync.ts` sync возвратов + approveReturnAction. Если SupportMessage не создаётся — RETURN не попадает в avg time, и это ОК. Если создаётся — включить.

**Aggregation:**
- Per nmId (таблица по товарам) — `AVG` по тикетам в периоде с привязкой к nmId.
- Per user (таблица по менеджерам) — `AVG` по тикетам где `firstOutbound.authorId=user`.
- Все tickets с `NULL avg` (нет ответа) — не включаются ни в числитель, ни в знаменатель.

### Альтернативные формулы (не выбраны)

| Формула | Почему не выбрана |
|---------|-------------------|
| All OUTBOUND − all INBOUND (avg всех пар) | Не соответствует понятию «время первого ответа». Усредняет последующие переписки. |
| Include isAutoReply=true | Искусственно занижает avg (автоответ ≈ секунды), а пользователь видит не реальную работу менеджера. |
| `lastMessageAt − createdAt` | `lastMessageAt` обновляется на каждом input/output; не отражает «first response». |

**Decision:** формула для `/gsd:discuss-phase 13` — user подтверждает выбранную («first outbound не-автоответ минус first inbound»).

## Top Return Reasons

### Подход

**Источник:** `ReturnDecision.reason` — это **причина отказа менеджера** (заполнена при `action='REJECT'` через Zod min(10) max(1000) в Phase 9). Для `action='APPROVE'` — опциональная причина (`approvecc1` action).

**Агрегация:** `GROUP BY reason ORDER BY COUNT(*) DESC LIMIT 10` через raw SQL, только `action='REJECT'`.

**Нормализация:** причины хранятся как free-text (минимум 10 символов). Получим много уникальных значений с тонкими различиями («Фото не того товара», «Фото не относится», «Фото не относится к товару»). Для MVP Phase 13 — **не нормализуем**, показываем top-N без fuzzy matching.

**UI:** TopReturnReasons компонент — список top-10 причин с счётчиком справа, bar-indicator (ширина пропорциональна max count):

```tsx
[████████████] Фото не того товара (23)
[█████████   ] Истёк срок возврата (18)
[██████      ] Следы носки (12)
...
```

**Альтернатива:** включать `user_comment` (жалоба покупателя) из `SupportTicket.wbComment` или `SupportMessage[0].text` INBOUND. Но это **другой источник** — причина глазами покупателя vs решение менеджера. Рекомендую **MVP только menedger REJECT reasons**, user_comment можно добавить как вторую таблицу в v1.2.

### Глобальная или per-product?

**MVP:** глобальный top-10 за период (один блок на странице, над таблицей товаров). Per-product breakdown в v1.2.

**Rationale:** per-product причины на 50-200 SKU = слишком много маленьких списков. Глобальный топ — actionable для руководителя.

## UI Architecture

### Структура /support/stats

```
/support/stats?tab=products&period=30d
/support/stats?tab=managers&period=custom&dateFrom=2026-01-01&dateTo=2026-03-31
```

### RSC + Client pattern (паттерн Phase 7 /prices/wb)

```tsx
// app/(dashboard)/support/stats/page.tsx — RSC
export default async function StatsPage({ searchParams }) {
  await requireSection("SUPPORT")
  const sp = await searchParams
  const period = parsePeriodPreset(sp.period ?? "30d", sp.dateFrom, sp.dateTo)
  const tab = sp.tab === "managers" ? "managers" : "products"

  // Параллельная загрузка данных
  const [productStats, managerStats, topReasons, autoReplies] = await Promise.all([
    tab === "products" ? getProductStats(period.dateFrom, period.dateTo) : null,
    tab === "managers" ? getManagerStats(period.dateFrom, period.dateTo) : null,
    tab === "products" ? getTopReturnReasons(period.dateFrom, period.dateTo, 10) : null,
    tab === "managers" ? countAutoRepliesInPeriod(period.dateFrom, period.dateTo) : null,
  ])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Статистика</h1>
        <StatsPeriodFilter />
      </div>
      <StatsTabs current={tab}>
        <ProductsPanel
          visible={tab === "products"}
          rows={productStats}
          topReasons={topReasons}
        />
        <ManagersPanel
          visible={tab === "managers"}
          rows={managerStats}
          autoRepliesCount={autoReplies}
        />
      </StatsTabs>
    </div>
  )
}
```

### StatsTabs.tsx (client) — паттерн /cards с base-ui Tabs

```tsx
"use client"
import { useRouter, useSearchParams } from "next/navigation"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function StatsTabs({ current, children }) {
  const router = useRouter()
  const sp = useSearchParams()
  const onChange = (tab: string) => {
    const params = new URLSearchParams(sp)
    params.set("tab", tab)
    router.push(`/support/stats?${params}`)
  }

  return (
    <Tabs value={current} onValueChange={onChange}>
      <TabsList>
        <TabsTrigger value="products">По товарам</TabsTrigger>
        <TabsTrigger value="managers">По менеджерам</TabsTrigger>
      </TabsList>
      {children}
    </Tabs>
  )
}
```

### StatsPeriodFilter.tsx (client)

```tsx
"use client"
// Native <select> для preset + 2 input[type=date] для custom
// URL-sync через searchParams (паттерн SupportFilters)
```

### ProductStatsTable.tsx

Колонки (8): Товар (фото+название+nmId), Отзывов, Средний рейтинг, Вопросов, Возвратов (total/approved/rejected), Топ причина возврата (inline most-frequent, глобальная), % ответов, Avg time. Sort DESC по колонке clickable header. Pagination 50/page.

### ManagerStatsTable.tsx

Колонки (9): Менеджер, Всего обработано, Отзывов, Вопросов, Чатов, Возвратов (decided), % одобрения возвратов, Avg time. Без пагинации (≤10 менеджеров).

### AutoRepliesSummary.tsx

Один ряд над таблицей менеджеров: «Автоответов WB отправлено за период: **N**» с подсказкой «Включается при работе cron автоответов в нерабочее время» (tooltip).

## Cron Scheduling

### Systemd timer config (deploy.sh)

```bash
# ── Phase 13: systemd timer для /api/cron/support-stats-refresh (03:00 МСК daily) ──
cat > /etc/systemd/system/zoiten-stats-refresh.service <<'SVC'
[Unit]
Description=Zoiten Support Stats Refresh (ManagerSupportStats — current month)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/zoiten.pro.env
ExecStart=/usr/bin/curl -fsS --max-time 600 -H "x-cron-secret: ${CRON_SECRET}" http://localhost:3001/api/cron/support-stats-refresh
SVC

cat > /etc/systemd/system/zoiten-stats-refresh.timer <<'TMR'
[Unit]
Description=Zoiten Support Stats Refresh (daily 03:00 Europe/Moscow)

[Timer]
OnCalendar=*-*-* 03:00:00 Europe/Moscow
Persistent=true
Unit=zoiten-stats-refresh.service

[Install]
WantedBy=timers.target
TMR

systemctl daemon-reload
systemctl enable --now zoiten-stats-refresh.timer
```

**VERIFIED 2026-04-17:** systemd 245+ (Ubuntu 22.04 LTS, VPS uses this) supports `Europe/Moscow` timezone suffix in `OnCalendar=`. Alternative for older systemd: use UTC offset `00:00:00` (equivalent of 03:00 МСК since Russia is UTC+3 постоянно).

**`Persistent=true`** — если VPS был выключен на 03:00 МСК, timer запустится сразу после boot (fail recovery).

### /api/cron/support-stats-refresh route

```typescript
// app/api/cron/support-stats-refresh/route.ts
import { NextRequest, NextResponse } from "next/server"
import { refreshManagerSupportStats } from "@/lib/support-stats"
import { startOfMonthMsk, endOfMonthMsk } from "@/lib/date-periods"

export const runtime = "nodejs"
export const maxDuration = 600

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("x-cron-secret")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  try {
    const now = new Date()
    const monthStart = startOfMonthMsk(now)
    const monthEnd = endOfMonthMsk(now)
    const result = await refreshManagerSupportStats(monthStart, monthEnd)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка обновления статистики"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
```

**Fail recovery:** если cron падает на одном менеджере — логируем и продолжаем. Upsert идемпотентен (повторный запуск просто перезапишет).

### Upsert logic

```typescript
await prisma.managerSupportStats.upsert({
  where: { userId_period: { userId, period: monthStart } },
  create: { userId, period: monthStart, ...metrics },
  update: { ...metrics, updatedAt: new Date() },
})
```

Первый cron после deploy создаст запись за current month. Past months останутся пустыми (без backfill).

## RBAC

| Action | Requires |
|--------|----------|
| Чтение `/support/stats` (render RSC) | `requireSection("SUPPORT")` (VIEW) |
| Cron `/api/cron/support-stats-refresh` | CRON_SECRET header, НЕ session |
| Manual refresh (опционально через UI кнопку) | `requireSection("SUPPORT", "MANAGE")` |

**Rationale:** статистика — extension секции SUPPORT, отдельный scope не нужен. `MANAGE` не требуется для чтения. Руководитель обычно имеет VIEW на все секции → видит stats.

**UI access:** пункт «Статистика» в sidebar добавляется с `section: "SUPPORT"` (паттерн nav-items).

## Historical Backfill

### При deploy

После deploy Phase 13 на VPS cron запустится в ближайшие 24 часа (или immediately если `Persistent=true` и next 03:00 МСК прошёл). Результат: запись за current month появится в `ManagerSupportStats`.

**Past months (январь, февраль, март 2026)** — отсутствуют. Для MVP это **приемлемо** — руководитель видит данные «с момента deploy Phase 13», что логично.

### Опциональный backfill-скрипт

```typescript
// scripts/backfill-manager-stats.ts
// Usage: npm run stats:backfill -- --from=2026-02-01 --to=2026-04-01
import { refreshManagerSupportStats } from "@/lib/support-stats"
import { startOfMonthMsk, getPastMonths } from "@/lib/date-periods"

async function main() {
  const args = parseArgs(process.argv)
  const months = getPastMonths(new Date(args.from), new Date(args.to))
  for (const monthStart of months) {
    const monthEnd = endOfMonthMsk(monthStart)
    console.log(`Backfilling ${monthStart.toISOString()}...`)
    await refreshManagerSupportStats(monthStart, monthEnd)
  }
  console.log("Done")
}
```

**package.json:**
```json
"scripts": {
  "stats:backfill": "tsx scripts/backfill-manager-stats.ts"
}
```

**tsx** уже установлен? Проверить при планировании. Если нет — alternative: `npx tsx scripts/backfill-manager-stats.ts`.

Backfill НЕ добавляется в deploy.sh автоматически — запускается вручную суперадмином.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | `/Users/macmini/zoiten.pro/vitest.config.ts` |
| Quick run command | `npx vitest run tests/support-stats.test.ts` |
| Full suite command | `npm test` (equivalent `npx vitest run`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| SUP-36 | Period preset parsing + TZ-safe start of month | unit | `npx vitest run tests/date-periods.test.ts -x` | ❌ Wave 0 |
| SUP-37 | getProductStats возвращает correct aggregates для fixture tickets | unit | `npx vitest run tests/support-stats.test.ts -t "getProductStats"` | ❌ Wave 0 |
| SUP-37 | getTopReturnReasons возвращает top-10 reasons | unit | `npx vitest run tests/support-stats.test.ts -t "getTopReturnReasons"` | ❌ Wave 0 |
| SUP-37 | computeAvgResponseTimeSec excludes autoreplies | unit | `npx vitest run tests/support-stats.test.ts -t "response time"` | ❌ Wave 0 |
| SUP-38 | getManagerStats merges cache + live correctly | unit | `npx vitest run tests/support-stats.test.ts -t "getManagerStats"` | ❌ Wave 0 |
| SUP-38 | weighted AVG при суммировании cache rows | unit | `npx vitest run tests/support-stats.test.ts -t "weightedAvg"` | ❌ Wave 0 |
| SUP-39 | refreshManagerSupportStats upsert с правильным period | unit | `npx vitest run tests/support-stats.test.ts -t "refresh"` | ❌ Wave 0 |
| SUP-39 | Cron route handler rejects без CRON_SECRET | integration | `npx vitest run tests/support-stats-cron.test.ts` | ❌ Wave 0 |
| SUP-36 | RSC page рендер + tabs (manual UAT) | manual | — | — |
| SUP-39 | Real cron fires at 03:00 МСК (manual UAT после deploy) | manual | `systemctl list-timers zoiten-stats-refresh.timer` | — |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/support-stats.test.ts tests/date-periods.test.ts` (unit tests только).
- **Per wave merge:** `npm test` (все vitest тесты + TypeScript check `npx tsc --noEmit`).
- **Phase gate:** полный test suite GREEN + `npm run build` успешный before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `tests/date-periods.test.ts` — covers SUP-36 (period parsing, TZ-safe start of month)
- [ ] `tests/support-stats.test.ts` — covers SUP-37, SUP-38, SUP-39 (aggregation helpers, pure-ish с mocked prisma)
- [ ] `tests/support-stats-cron.test.ts` — covers SUP-39 (CRON_SECRET guard, 401 без header)
- [ ] Fixture: `tests/fixtures/support-stats-tickets.json` — подборка 20-30 synthetic SupportTicket + SupportMessage + ReturnDecision для verification агрегатов

*Если эти файлы стабилизуются в Plan 13-01 как RED stubs, тесты становятся GREEN по мере реализации в Plan 13-01/02/03.*

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | prisma migrate + queries | ✓ | 16 | — |
| Node.js | runtime + cron route | ✓ | 20+ | — |
| systemd | timer 03:00 МСК | ✓ | 245+ (Ubuntu 22.04) | crontab (alternative) |
| vitest | unit tests | ✓ | 4.1.4 | — |
| Prisma CLI | migrations | ✓ | 6.x | — |
| tsx (for backfill script) | `npm run stats:backfill` | ❓ (check) | — | `npx tsx` |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** `tsx` может быть не в devDependencies — fallback через `npx tsx` без global install.

## Common Pitfalls

### Pitfall 1: Period boundary off-by-one

**What goes wrong:** пользователь выбрал «30 дней», видит цифры за 29 или 31 день.
**Why:** `new Date(now - 30 * 86400_000)` в UTC vs MSK drift.
**How to avoid:** всегда компютить period через `parsePeriodPreset()` helper в TZ Moscow, +03:00 suffix в ISO строках.
**Warning signs:** расхождение между UI цифрами и SQL-запросом прямым в БД (`SELECT COUNT(*) WHERE createdAt >= '...'`).

### Pitfall 2: Autoreplies inflate response time

**What goes wrong:** avg time = 30 секунд (нереально низко).
**Why:** не отфильтровали `isAutoReply=true`.
**How to avoid:** всегда `WHERE isAutoReply = false` в подзапросе `first_outbound`.
**Warning signs:** подозрительно низкие avg times (< 1 минуты при нормальном workflow ~10-60 минут).

### Pitfall 3: Cache inconsistency при изменении методики

**What goes wrong:** меняется формула avg response time, но cache `ManagerSupportStats` содержит старые цифры.
**Why:** cron перезаписывает только текущий месяц.
**How to avoid:** при изменении формулы — запустить backfill-скрипт на все past months.
**Warning signs:** прошлые месяцы показывают «unrealistic» числа после deploy новой формулы.

### Pitfall 4: NmId без WbCard (рассинхрон)

**What goes wrong:** таблица по товарам показывает строки с пустым названием и фото.
**Why:** WbCard удалён / не синхронизирован, но тикет ссылается на nmId.
**How to avoid:** LEFT JOIN WbCard, fallback UI «Карточка #{nmId}».
**Warning signs:** в UI строки без фото.

### Pitfall 5: systemd timer DST drift (не relevant но стоит упомянуть)

**What goes wrong:** ожидаешь 03:00 МСК, запускается 02:00 или 04:00.
**Why:** Europe/Moscow = постоянно +03:00 с 2011, DST отменён. **НО** некоторые старые systemd версии могут неправильно парсить TZ suffix.
**How to avoid:** проверить на VPS `systemctl list-timers` после deploy — показывает реальное next trigger time.
**Warning signs:** статистика обновилась в другой час (проверить через `updatedAt`).

### Pitfall 6: Cron timeout при большом backfill

**What goes wrong:** cron падает по timeout (300s default).
**Why:** 10 менеджеров × N запросов × M записей = долго.
**How to avoid:** `maxDuration=600` в route handler + `--max-time 600` в systemd ExecStart (уже в pattern).
**Warning signs:** cron log показывает curl timeout.

## Code Examples

### getProductStats — полная версия

```typescript
// lib/support-stats.ts
import { prisma } from "@/lib/prisma"
import type { TicketChannel, TicketStatus } from "@prisma/client"

const ANSWERED_STATUSES: TicketStatus[] = ["ANSWERED", "CLOSED", "APPEALED"]

export interface ProductStatRow {
  nmId: number
  name: string | null
  photoUrl: string | null
  feedbacksTotal: number
  avgRating: number | null
  feedbacksAnsweredPct: number | null
  questionsTotal: number
  returnsTotal: number
  returnsApproved: number
  returnsRejected: number
  returnsPending: number
  avgResponseTimeSec: number | null
}

export async function getProductStats(
  dateFrom: Date,
  dateTo: Date
): Promise<ProductStatRow[]> {
  // Base aggregation: (nmId, channel, status)
  const grouped = await prisma.supportTicket.groupBy({
    by: ["nmId", "channel", "status"],
    where: {
      createdAt: { gte: dateFrom, lte: dateTo },
      nmId: { not: null },
    },
    _count: { _all: true },
  })

  const ratings = await prisma.supportTicket.groupBy({
    by: ["nmId"],
    where: {
      createdAt: { gte: dateFrom, lte: dateTo },
      channel: "FEEDBACK",
      rating: { not: null },
      nmId: { not: null },
    },
    _avg: { rating: true },
  })

  const returns = await prisma.supportTicket.groupBy({
    by: ["nmId", "returnState"],
    where: {
      createdAt: { gte: dateFrom, lte: dateTo },
      channel: "RETURN",
      nmId: { not: null },
    },
    _count: { _all: true },
  })

  const responseTimeMap = await computeAvgResponseTimeSecPerNmId(dateFrom, dateTo)

  // Compose
  const nmIds = new Set<number>()
  for (const g of grouped) if (g.nmId !== null) nmIds.add(g.nmId)
  for (const r of returns) if (r.nmId !== null) nmIds.add(r.nmId)

  const cards = await prisma.wbCard.findMany({
    where: { nmId: { in: Array.from(nmIds) } },
    select: { nmId: true, name: true, photoUrl: true },
  })
  const cardMap = new Map(cards.map(c => [c.nmId, c]))

  const rows: ProductStatRow[] = []
  for (const nmId of nmIds) {
    const card = cardMap.get(nmId)
    const feedbacks = grouped.filter(g => g.nmId === nmId && g.channel === "FEEDBACK")
    const questions = grouped.filter(g => g.nmId === nmId && g.channel === "QUESTION")
    const returnRows = returns.filter(r => r.nmId === nmId)

    const feedbacksTotal = feedbacks.reduce((s, g) => s + g._count._all, 0)
    const questionsTotal = questions.reduce((s, g) => s + g._count._all, 0)
    const feedbacksAnswered = feedbacks
      .filter(g => ANSWERED_STATUSES.includes(g.status))
      .reduce((s, g) => s + g._count._all, 0)
    const totalResponsable = feedbacksTotal + questionsTotal
    const questionsAnswered = questions
      .filter(g => ANSWERED_STATUSES.includes(g.status))
      .reduce((s, g) => s + g._count._all, 0)

    rows.push({
      nmId,
      name: card?.name ?? null,
      photoUrl: card?.photoUrl ?? null,
      feedbacksTotal,
      avgRating: ratings.find(r => r.nmId === nmId)?._avg.rating ?? null,
      feedbacksAnsweredPct: totalResponsable > 0
        ? Math.round(((feedbacksAnswered + questionsAnswered) / totalResponsable) * 100)
        : null,
      questionsTotal,
      returnsTotal: returnRows.reduce((s, r) => s + r._count._all, 0),
      returnsApproved: returnRows.find(r => r.returnState === "APPROVED")?._count._all ?? 0,
      returnsRejected: returnRows.find(r => r.returnState === "REJECTED")?._count._all ?? 0,
      returnsPending: returnRows.find(r => r.returnState === "PENDING")?._count._all ?? 0,
      avgResponseTimeSec: responseTimeMap.get(nmId) ?? null,
    })
  }

  return rows.sort((a, b) => b.feedbacksTotal - a.feedbacksTotal)
}

async function computeAvgResponseTimeSecPerNmId(
  dateFrom: Date,
  dateTo: Date
): Promise<Map<number, number>> {
  const rows = await prisma.$queryRaw<Array<{ nmId: number; avgSec: number }>>`
    WITH fi AS (
      SELECT "ticketId", MIN("wbSentAt") AS at
      FROM "SupportMessage"
      WHERE "direction" = 'INBOUND' AND "wbSentAt" IS NOT NULL
      GROUP BY "ticketId"
    ),
    fo AS (
      SELECT "ticketId", MIN("wbSentAt") AS at
      FROM "SupportMessage"
      WHERE "direction" = 'OUTBOUND' AND "isAutoReply" = false AND "wbSentAt" IS NOT NULL
      GROUP BY "ticketId"
    )
    SELECT t."nmId", AVG(EXTRACT(EPOCH FROM (fo.at - fi.at)))::int AS "avgSec"
    FROM "SupportTicket" t
    JOIN fi ON fi."ticketId" = t.id
    JOIN fo ON fo."ticketId" = t.id
    WHERE t."createdAt" >= ${dateFrom} AND t."createdAt" <= ${dateTo}
      AND t."nmId" IS NOT NULL AND fo.at > fi.at
    GROUP BY t."nmId"
  `
  return new Map(rows.map(r => [r.nmId, r.avgSec]))
}
```

### getTopReturnReasons

```typescript
export async function getTopReturnReasons(
  dateFrom: Date,
  dateTo: Date,
  topN = 10
): Promise<Array<{ reason: string; count: number }>> {
  const rows = await prisma.$queryRaw<Array<{ reason: string; count: bigint }>>`
    SELECT rd.reason, COUNT(*) AS count
    FROM "ReturnDecision" rd
    WHERE rd."action" = 'REJECT'
      AND rd.reason IS NOT NULL
      AND rd."decidedAt" >= ${dateFrom}
      AND rd."decidedAt" <= ${dateTo}
    GROUP BY rd.reason
    ORDER BY count DESC
    LIMIT ${topN}
  `
  return rows.map(r => ({ reason: r.reason, count: Number(r.count) }))
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Stats via polling raw data each request | Denormalized cache + live delta | — (Phase 13 greenfield) | Fast multi-month queries |
| cron via crontab | systemd timer OnCalendar | Phase 10 | Persistent=true recovers after boot |
| Graphs in MVP | Numbers-only tables | — | Lower complexity, faster ship |
| per-section RBAC | Reuse SUPPORT | — | Avoid scope creep |

**Deprecated/outdated:** Russia DST abolished 2011 — Europe/Moscow = постоянно +03:00, не нужна date-fns-tz или moment-tz для этого случая.

## Open Questions

1. **Включать ли RETURN канал в avg response time?**
   - What we know: Phase 9 возможно не создаёт `SupportMessage` OUTBOUND при approve/reject (решение идёт через ReturnDecision напрямую).
   - What's unclear: если OUTBOUND не создаётся — RETURN не попадает в avg time, что может искажать картину (возвраты решаются через minutes-hours, это важная метрика).
   - Recommendation: обсудить в `/gsd:discuss-phase 13`. Варианты: (a) оставить как есть — RETURN не в avg time, (b) считать «время решения возврата» как `ReturnDecision.decidedAt − ticket.createdAt` отдельной колонкой, (c) создавать SupportMessage OUTBOUND при approve/reject (Phase 9 enhancement).

2. **Автоответы attribution — оставить глобально или скрыть вообще?**
   - What we know: `isAutoReply=true`, `authorId=null`. Нет sentinel user для attribution.
   - What's unclear: пользователь может захотеть видеть «мой автоответ настроен — мне засчитывается N автоответов».
   - Recommendation: глобальный счётчик (default). Если пользователь в discuss-phase настоит — использовать `AutoReplyConfig.updatedById` как proxy (кто последний настроил).

3. **Per-product top reasons или глобально?**
   - What we know: per-product на 200 SKU × 10 reasons = 2000 мелких строк, не actionable.
   - What's unclear: руководитель может захотеть drill-down по SKU.
   - Recommendation: MVP — глобально. v1.2 — drill-down в client-side expand.

4. **Weighted avg response time в cache — достаточно хранить `avg + count`?**
   - What we know: `SUM(avg[i] × count[i]) / SUM(count[i])` требует оба поля на каждой row.
   - What's unclear: изменение формулы (напр., median вместо avg) потребует full backfill.
   - Recommendation: добавить `responseCount: Int` в ManagerSupportStats (сделано в рекомендуемой схеме выше).

5. **Какой `totalProcessed` семантика?**
   - What we know: ROADMAP SC#3 — «replies + status changes + appeal decisions + return decisions».
   - What's unclear: замен статуса без ответа — учитывать? «Назначил менеджера» — тоже?
   - Recommendation: для MVP — `feedbacksAnswered + questionsAnswered + chatsAnswered + returnsDecided + appealsResolved`. Без учёта status changes и assignments. Уточнить в discuss.

## Risks & Unknowns

- **Performance at scale:** при 30k тикетов через год raw SQL для avg response time может занять >1 сек. Митигация — индекс `@@index([direction, isAutoReply, wbSentAt])` на SupportMessage, при необходимости materialized view в v1.2.
- **Timezone DST edge case:** если Russia вернёт DST (маловероятно, но возможно) — `+03:00` хардкод сломается. Митигация — использовать `Intl.DateTimeFormat` для runtime TZ resolution (принято в design).
- **Cron fails silently:** если CRON_SECRET не передаётся или неверен — 401 без уведомления. Митигация — проверить systemctl status после deploy, monitoring в v1.2.
- **Methodology changes:** изменение формулы avg response time потребует перезаписи всего cache. Митигация — backfill-скрипт готов, можно запускать вручную.
- **SUP-Returns OUTBOUND message:** если Phase 9 не создаёт OUTBOUND при approve/reject — avg response time для RETURN канала == NULL. Нужно проверить при планировании.
- **Lib `support-sync.ts` для RETURN:** возможно нужно добавить создание `SupportMessage` OUTBOUND при `approveReturnAction` / `rejectReturnAction` для корректного avg response time. Решение откладывается на discuss.

## Plan Slicing

**Proposed 3 plans (confirm in discuss-phase 13):**

### Plan 13-01 Foundation (Prisma + aggregation helpers + tests)

**Scope:**
- Prisma миграция `phase13_statistics`:
  - `model ManagerSupportStats` (новая, 11 полей + 2 индекса)
  - `@@index([channel, nmId, createdAt])` на SupportTicket
  - `@@index([direction, isAutoReply, wbSentAt])` на SupportMessage
  - `User.supportStats ManagerSupportStats[] @relation("ManagerStats")` обратная
- `lib/date-periods.ts` (pure, 6 функций: `startOfDayMsk`, `endOfDayMsk`, `startOfMonthMsk`, `endOfMonthMsk`, `parsePeriodPreset`, `getPastMonths`)
- `lib/support-stats.ts` (5 функций + 1 raw SQL helper):
  - `getProductStats(dateFrom, dateTo)`
  - `getManagerStats(dateFrom, dateTo)` с гибридом cache/live
  - `refreshManagerSupportStats(monthStart, monthEnd)`
  - `computeAvgResponseTimeSecPerNmId(dateFrom, dateTo)` — raw SQL
  - `computeAvgResponseTimeSecPerUser(userId, dateFrom, dateTo)` — raw SQL
  - `getTopReturnReasons(dateFrom, dateTo, topN)`
  - `countAutoRepliesInPeriod(dateFrom, dateTo)`
- Wave 0 stubs:
  - `tests/date-periods.test.ts` — RED stubs, GREEN к концу плана
  - `tests/support-stats.test.ts` — RED stubs, GREEN к концу плана (mocked prisma)
  - `tests/fixtures/support-stats-tickets.ts` — 20-30 synthetic tickets для verification

**Deliverables:** миграция applied, unit tests GREEN, `npm run build` OK.

### Plan 13-02 UI /support/stats

**Scope:**
- Route: `app/(dashboard)/support/stats/page.tsx` (RSC)
- Components:
  - `components/support/stats/StatsTabs.tsx` (client, base-ui Tabs)
  - `components/support/stats/StatsPeriodFilter.tsx` (client, native select + date inputs)
  - `components/support/stats/ProductStatsTable.tsx` (client, sorting + pagination)
  - `components/support/stats/ManagerStatsTable.tsx` (client, без пагинации)
  - `components/support/stats/TopReturnReasons.tsx` (client, bar-like visualization)
  - `components/support/stats/AutoRepliesSummary.tsx` (client, one-line summary)
- `components/layout/nav-items.ts` — добавить `{ section: "SUPPORT", href: "/support/stats", label: "Статистика", icon: "BarChart3" }`
- `components/layout/nav-items.ts` ICON_MAP — добавить BarChart3 из lucide-react
- Опциональная server action `refreshStatsNow()` для ручной кнопки (MANAGE)

**Deliverables:** /support/stats работает с live daily aggregation, рендер с фикстурами OK, `npm run build` OK, все тесты GREEN.

### Plan 13-03 Cron + Backfill + UAT

**Scope:**
- `app/api/cron/support-stats-refresh/route.ts` (GET, CRON_SECRET guarded, maxDuration=600)
- `tests/support-stats-cron.test.ts` — integration test (auth guard + happy path с mocked prisma)
- `deploy.sh` — добавить блок systemd timer `zoiten-stats-refresh` (OnCalendar 03:00 МСК)
- `scripts/backfill-manager-stats.ts` — CLI для past months (optional)
- `package.json` — `"stats:backfill": "tsx scripts/backfill-manager-stats.ts"` script
- VPS deploy + verify:
  - `systemctl list-timers zoiten-stats-refresh.timer` shows next trigger ≤ 24h
  - Manual curl `/api/cron/support-stats-refresh` → 200 + records в БД
  - `/support/stats` показывает данные после refresh
- Human UAT checklist (6-8 пунктов)
- CLAUDE.md обновление (Phase 13 описание, ManagerSupportStats model)
- README.md обновление (если нужно)

**Deliverables:** cron рабочий в production, backfill script tested, UAT signed off, ROADMAP.md Phase 13 mark as [x].

## Sources

### Primary (HIGH confidence)

- `/Users/macmini/zoiten.pro/prisma/schema.prisma` (lines 481-744) — существующая схема поддержки, возвратов, чатов, шаблонов, обжалований, автоответов, Customer.
- `/Users/macmini/zoiten.pro/.planning/phases/08-support-mvp/08-RESEARCH.md` — foundation милстоуна, WB API паттерны.
- `/Users/macmini/zoiten.pro/.planning/phases/09-returns/09-RESEARCH.md` — ReturnDecision модель, action/reason семантика.
- `/Users/macmini/zoiten.pro/.planning/phases/10-chat-autoreply/10-RESEARCH.md` — isAutoReply поле, AutoReplyConfig singleton.
- `/Users/macmini/zoiten.pro/.planning/phases/12-customer-messenger/12-RESEARCH.md` — Customer aggregation паттерн.
- `/Users/macmini/zoiten.pro/app/(dashboard)/support/page.tsx` — RSC фильтры searchParams паттерн.
- `/Users/macmini/zoiten.pro/app/(dashboard)/support/returns/page.tsx` — таблица с фильтрами и pagination.
- `/Users/macmini/zoiten.pro/app/(dashboard)/support/customers/[customerId]/page.tsx` — aggregation + 2-col layout.
- `/Users/macmini/zoiten.pro/app/api/cron/support-sync-reviews/route.ts` — cron pattern с CRON_SECRET.
- `/Users/macmini/zoiten.pro/lib/customer-aggregations.ts` — pure helpers pattern Phase 12.
- `/Users/macmini/zoiten.pro/lib/support-sync.ts` — integration patterns, single source of truth для sync.
- `/Users/macmini/zoiten.pro/deploy.sh` — systemd timer + EnvironmentFile паттерн.
- `/Users/macmini/zoiten.pro/vitest.config.ts` — test setup.
- `/Users/macmini/zoiten.pro/CLAUDE.md` — project conventions (RU, Moscow TZ, native select, atomic commits).
- `/Users/macmini/zoiten.pro/.planning/ROADMAP.md` (Phase 13 goal + 5 SC).
- `/Users/macmini/zoiten.pro/.planning/REQUIREMENTS.md` (SUP-36..39).

### Secondary (MEDIUM confidence)

- Prisma 6 `groupBy` docs — verified by usage in Phase 12 customer-aggregations.
- systemd `OnCalendar=TZ` support in 245+ — verified by Ubuntu 22.04 docs; confirmed pattern used in deploy.sh Phase 10.
- Raw SQL with `prisma.$queryRaw` pattern — used across project (search: `$queryRaw` usage).

### Tertiary (LOW confidence — flagged for validation)

- Russia постоянный UTC+3 без DST — training data (2014 cutoff), confirmed stable in tzdata. Low risk — if Russia re-enables DST, hardcoded `+03:00` breaks.
- Precise performance numbers (300-500ms для live aggregation) — estimation, not measured. Validate during Plan 13-02 on real VPS data.
- Возможное отсутствие SupportMessage OUTBOUND для RETURN канала — estimation from Phase 9 patterns, needs codebase verification in Plan 13-01 (check `approveReturnAction` / `rejectReturnAction` in `app/actions/support.ts`).

## Metadata

**Confidence breakdown:**
- Data model (`ManagerSupportStats`): HIGH — standard Prisma + паттерн существующих моделей.
- Aggregation queries: HIGH for simple `groupBy`, MEDIUM for raw SQL (CTE correctness needs SQL review at plan time).
- Cron infrastructure: HIGH — проверено паттерном Phase 8/9/10 systemd timers.
- Period/TZ handling: HIGH (Russia без DST), с оговоркой Low на long-term stability.
- UI architecture: HIGH — известные паттерны tabs + filters + tables.
- Avg response formula: MEDIUM — разумный выбор, но несколько альтернатив; confirm in discuss.

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (30 дней для стабильных Prisma/systemd; пересмотреть если Phase 9 внезапно добавит OUTBOUND message для RETURN).

## RESEARCH COMPLETE
