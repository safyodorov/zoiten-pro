# Phase 30: Аналитика — дашборд «Топ-30 SKU в нише» - Context

**Gathered:** 2026-07-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Новый раздел `/analytics`: пользователь загружает 6 файлов WB «Сравнение карточек» + MPSTATS-токен → фоновый сбор по 30 конкурентным SKU (воронка из файлов, позиции из MPSTATS, фото+характеристики сканом карточек) → персистентный прогон ниши → полноэкранный дашборд из 5 вкладок с единой сортировкой (выручка / конв. клик→заказ) + PDF-выгрузка. Анализ КОНКУРЕНТОВ по произвольным nmID — не завязан на `Product`/`MarketplaceArticle`.

НЕ трогаем: существующий механизм скана карточек (`lib/wb-api.ts` — переиспользуем как есть), другие разделы, схемы других фаз. Новая `ERP_SECTION.ANALYTICS` + рукописная миграция.
</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**12 requirements are locked.** См. `30-SPEC.md` — полные требования, границы и критерии приёмки. Downstream-агенты (researcher, planner) ОБЯЗАНЫ прочитать `30-SPEC.md` до планирования. Требования здесь не дублируются.

**In scope (from SPEC.md):** загрузка 6 detail-JSON и определение топ-30; движок метрик воронки (среднее÷30, «от сумм», клик→заказ, цена −3%); MPSTATS-интеграция (позиции органика/реклама, окно = период файлов, запросы >500 из MPSTATS по SKU); переиспользование скана карточек (5 фото + характеристики); персистентность нескольких ниш с историей; единая сортировка на всех вкладках; правило полноты по рангу выручки (топ-10 блокирует, 11–30 — пометка); 5-вкладочный полноэкранный дашборд; графики «одна метрика = один график» + тепловая карта позиций; PDF (таблица + по-SKU блоки); новый `ERP_SECTION.ANALYTICS` + RBAC.

**Out of scope (from SPEC.md):** автосбор файлов «Сравнение карточек» (нет API WB); привязка к товарам компании; МП кроме WB; автообновление/cron; экспорт Excel/CSV; прогнозы/AI-инсайты; мульти-токен MPSTATS; модификация существующего скана карточек.
</spec_lock>

<decisions>
## Implementation Decisions

### MPSTATS — токен и запуск сбора
- **D-01 (токен):** MPSTATS-токен хранится в **AppSetting KV** (`analytics.mpstatsToken`), вводится один раз в UI в шапке раздела (паттерн `GlobalRatesBar` — debounced + `router.refresh`). Правка гейтится `requireSection("ANALYTICS","MANAGE")`. Заголовок запроса — `X-Mpstats-TOKEN`.
- **D-02 (запуск):** Сбор — **фоновый прогон с прогрессом**, не синхронный (30+ MPSTATS-запросов + пагинация + 30 сканов card.json/detail не влезают в один HTTP без риска таймаута nginx/Next). `NicheRun.status`: `PENDING → COLLECTING → READY | PARTIAL | FAILED`. UI поллит статус (паттерн статуса можно взять из существующих sync-кнопок WB — cooldown-bus/lastRun). Прогресс отражает «собрано X/30, MPSTATS Y/30, карточки Z/30».
- **D-03 (лимиты):** 1 запрос MPSTATS = 1 лимит тарифа — собирать последовательно/умеренным параллелизмом, ловить 429/исчерпание лимита, писать в статус прогона, не ронять весь прогон (см. правило полноты SPEC req.7).

### Источник фото и характеристик конкурентов
- **D-04:** **basket-CDN `.../info/ru/card.json`** по nmID — полный листинг фото (первые 5) + характеристики (options/grouped). **`card.wb.ru/cards/v4/detail`** (существующий curl-механизм `lib/wb-api.ts`) — цена/СПП/рейтинг/отзывы. Медианная цена по ТЗ берётся из файлов details (−3%); detail — резервно/для сверки. Транспорт card.json — тем же curl-подходом, если Node fetch к basket заблокирован (research подтвердит; `lib/wb-storefront-feedbacks.ts` отмечает, что basket-хосты обычно НЕ блокируют native fetch, в отличие от card.wb.ru — проверить на research).

### Claude's Discretion (решаю по конвенциям проекта, зафиксировано)
- **Хранение прогона:** immutable **JSON-снапшот `payloadJson`** (паттерн finance-weekly W3c: рендер вкладок/PDF из снапшота) + лёгкая индекс-таблица `NicheRun` (id, createdAt, dateFrom/dateTo, status, completeness-пометка, skuCount). Посуточные ряды воронки и позиций — внутри payloadJson (не отдельные нормализованные таблицы), т.к. данные иммутабельны после сбора и всегда читаются целым прогоном.
- **Графики в PDF:** серверный рендер линий **прямо в `pdfkit`** из массивов данных (без headless-браузера и без recharts на сервере). На экране — recharts; в PDF — простые линейные оси/полилинии из тех же series.
- **Движок:** pure-функции `lib/analytics/{types,engine,data}.ts` + golden-тесты (паттерн `lib/sales-plan/`, `lib/finance-cashflow/`).
- **UI-таблицы:** sticky-паттерн существующих разделов; переключатели (сортировка, выбор метрик, период) — URL searchParams (паттерн `PlanFactControls`).
</decisions>

<canonical_refs>
## Canonical References

**Downstream-агенты ОБЯЗАНЫ прочитать это до планирования/реализации.**

### Требования фазы
- `.planning/phases/30-analytics/30-SPEC.md` — **залоченные требования (12)**, границы, критерии приёмки. MUST read before planning.
- `.planning/phases/30-analytics/30-TZ-source.md` — исходное ТЗ заказчика (первоисточник WHAT).

### Переиспользуемый механизм скана карточек (НЕ переписывать — SPEC req.4)
- `lib/wb-api.ts` — curl `card.wb.ru/cards/v4/detail?appType=1&curr=rub&dest=-1257786&nm=…` (цена/СПП/рейтинг per nmID; Node fetch блокируется TLS-fingerprint → curl обязателен). См. также quick 260515-o4o (finalized buyer price per nmId), `app/api/wb-ratings-sync/route.ts`.
- `lib/wb-storefront-feedbacks.ts` — заметка: basket-хосты обычно НЕ блокируют native fetch (в отличие от card.wb.ru) — проверить для card.json.

### RBAC-раздел (паттерн регистрации)
- `prisma/schema.prisma` — enum `ERP_SECTION` (добавить `ANALYTICS`; рукописная миграция + `prisma migrate deploy`).
- `lib/sections.ts` — префикс URL → секция (добавить `"/analytics": "ANALYTICS"`; edge-safe для middleware).
- `lib/rbac.ts` — `requireSection("ANALYTICS")` (read) / `requireSection("ANALYTICS","MANAGE")` (write). RBAC-гранты — `/admin/users`; JWT-callback подтягивает права ~60с (см. DEPLOY.md §12.3).
- `middleware.ts` — Edge RBAC по `SECTION_PATHS`.

### Снапшот-паттерн (хранение прогона)
- `lib/finance-weekly/` + `lib/finance-snapshot.ts` — immutable payloadJson, рендер из снапшота (quick 260710-mih W3c). Образец для `NicheRun.payloadJson`.
- `lib/sales-plan/engine.ts`, `lib/finance-cashflow/engine.ts` — образец pure-движка (types/engine/data + DI-loader + golden-тесты).

### AppSetting KV + шапка-бар
- AppSetting: колонки `key/value/updatedAt` (createdAt НЕТ) — `ON CONFLICT (key) DO UPDATE`. Ключ `analytics.mpstatsToken`.
- `components/...GlobalRatesBar` (см. prices/wb) — образец debounced-редактируемой шапки (для ввода MPSTATS-токена).

### Графики / PDF
- `recharts` (уже в проекте): `components/ui/chart.tsx`, `components/finance/CashflowChart.tsx`, `components/sales-plan/PlanFactChart.tsx`, `components/cards/WbCardOrdersChart.tsx` — образцы (тики `fill var(--muted-foreground)`).
- `pdfkit` (уже в `package.json`) — серверная генерация PDF; линии графиков рисуются вручную из series.

### Правила проекта (CLAUDE.md + memory)
- Sticky-таблицы: сплошной `bg-background`/`bg-muted` БЕЗ `/NN` opacity на sticky-ячейках (повторяющийся баг).
- НЕ вызывать client-функции (`buttonVariants`) из RSC — статические классы.
- Модалки base-ui: `sm:`-ширина + загрузка данных через `useEffect(open)`.
- Server Actions: `"use server"` + `requireSection` + try/catch + `revalidatePath` + zod-валидация.
- Деплой (когда дойдёт до execute — отдельно, по сигналу): push → `nohup deploy.sh` → `==> Done` → curl 200 + journalctl-smoke. (В этой фазе — НЕ деплоим, только планирование.)

### Открытые для research вопросы (HOW)
- Точные MPSTATS-эндпоинты: (a) позиции per SKU по дням (organic/ad + CPM/тип/буст); (b) список запросов ниши, по которым ранжируется SKU, с частотностью. Формат ответа, пагинация, лимиты.
- Подтвердить формат basket-CDN `card.json` (URL-схема vol/part по nmID, поля фото и характеристик) и транспорт (native fetch vs curl).
- Тайминг фонового прогона: механизм (server action, пишущий статус + отдельный обработчик, vs очередь) — planner решит по существующим паттернам (cron-dispatcher/cooldown-bus).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/wb-api.ts` (curl card.wb.ru detail) — цена/СПП/рейтинг per nmID; переиспользуется для скана (SPEC req.4).
- `recharts` + `components/ui/chart.tsx` — графики динамики (вкладка «Статистика карточки», SPEC req.9) и тепловая карта (req.10, кастомный компонент на div/grid + цветовая шкала).
- `pdfkit` — PDF-выгрузка (req.11).
- AppSetting KV + `GlobalRatesBar`-паттерн — хранение/ввод MPSTATS-токена (D-01).
- `lib/parse-*`/`lib/bank-import` — паттерн загрузки+валидации файлов (detail-JSON парсится `JSON.parse`, req.1).
- `lib/finance-weekly` / `finance-snapshot.ts` — снапшот-хранение прогона (Claude's Discretion).

### Established Patterns
- Pure-движок `lib/xxx/{types,engine,data}.ts` + DI-loader + golden vitest — под `lib/analytics/`.
- RBAC-раздел: enum + sections.ts + rbac.ts + middleware + nav.
- Sticky-таблицы, URL-searchParams для контролов, server actions с zod.

### Integration Points
- Новый маршрут `app/(dashboard)/analytics/` (RSC + server actions), навигация, `ERP_SECTION.ANALYTICS`.
- Новые Prisma-модели: `NicheRun` (индекс+payloadJson+status) — рукописная миграция + `ERP_SECTION.ANALYTICS`.
- Внешние: MPSTATS API (новый клиент `lib/analytics/mpstats.ts`), basket-CDN card.json (`lib/analytics/wb-card-scan.ts` поверх реюза).
</code_context>

<specifics>
## Specific Ideas
- Прогон = immutable-снапшот: дашборд и PDF рендерятся из `NicheRun.payloadJson`, повторный сбор = НОВЫЙ прогон (SPEC req.5).
- Правило полноты по рангу выручки — валидируется ПОСЛЕ сортировки по выручке: сбой в топ-10 → статус `FAILED`/не сохраняем; в 11–30 → `PARTIAL` + пометка со списком SKU (SPEC req.7).
- PDF: сводная таблица (30 строк: артикул/бренд/выручка-мес/конв.клик→заказ) + по-SKU блоки (5 фото + график цены + график конверсий в корзину/заказ), порядок = текущая сортировка (SPEC req.11).
- Окно дат MPSTATS = период `byDay` файлов (единая ось X воронки и позиций).
</specifics>

<deferred>
## Deferred Ideas
- Ozon и другие МП — вне фазы (только WB).
- Автосбор файлов «Сравнение карточек» — нет официального API WB.
- Автообновление/cron прогонов — запуск вручную (дорого по лимитам MPSTATS).
- Экспорт в Excel/CSV — в этой фазе только PDF.
- Прогнозы/рекомендации/AI-инсайты по нише — возможная будущая фаза аналитики.
- Сравнение прогонов ниши во времени (диффы между сохранёнными прогонами) — история хранится (req.5), но UI-сравнение — отдельно.

*None additional — discussion stayed within phase scope.*
</deferred>

---

*Phase: 30-analytics*
*Context gathered: 2026-07-13 — SPEC.md (12 reqs) + discuss (MPSTATS токен=AppSetting, сбор=фоновый+прогресс, характеристики=card.json+detail) + Claude's Discretion (снапшот payloadJson, PDF-графики серверно в pdfkit, pure-движок)*
