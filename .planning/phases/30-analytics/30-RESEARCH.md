# Phase 30: Аналитика — дашборд «Топ-30 SKU в нише» - Research

**Researched:** 2026-07-13
**Domain:** Next.js 15 App Router (фоновые задачи без очереди) + внешняя аналитика WB-конкурентов (MPSTATS API, basket-CDN card.json) + pure-движок метрик + recharts/pdfkit визуализация
**Confidence:** MEDIUM (стек/паттерны проекта — HIGH; MPSTATS точные эндпоинты позиций/запросов — LOW, требуют Wave 0 спайка с реальным токеном)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**MPSTATS — токен и запуск сбора**
- **D-01 (токен):** MPSTATS-токен хранится в **AppSetting KV** (`analytics.mpstatsToken`), вводится один раз в UI в шапке раздела (паттерн `GlobalRatesBar` — debounced + `router.refresh`). Правка гейтится `requireSection("ANALYTICS","MANAGE")`. Заголовок запроса — `X-Mpstats-TOKEN`.
- **D-02 (запуск):** Сбор — **фоновый прогон с прогрессом**, не синхронный (30+ MPSTATS-запросов + пагинация + 30 сканов card.json/detail не влезают в один HTTP без риска таймаута nginx/Next). `NicheRun.status`: `PENDING → COLLECTING → READY | PARTIAL | FAILED`. UI поллит статус (паттерн статуса можно взять из существующих sync-кнопок WB — cooldown-bus/lastRun). Прогресс отражает «собрано X/30, MPSTATS Y/30, карточки Z/30».
- **D-03 (лимиты):** 1 запрос MPSTATS = 1 лимит тарифа — собирать последовательно/умеренным параллелизмом, ловить 429/исчерпание лимита, писать в статус прогона, не ронять весь прогон (см. правило полноты SPEC req.7).

**Источник фото и характеристик конкурентов**
- **D-04:** **basket-CDN `.../info/ru/card.json`** по nmID — полный листинг фото (первые 5) + характеристики (options/grouped). **`card.wb.ru/cards/v4/detail`** (существующий curl-механизм `lib/wb-api.ts`) — цена/СПП/рейтинг/отзывы. Медианная цена по ТЗ берётся из файлов details (−3%); detail — резервно/для сверки. Транспорт card.json — тем же curl-подходом, если Node fetch к basket заблокирован (research подтвердит; `lib/wb-storefront-feedbacks.ts` отмечает, что basket-хосты обычно НЕ блокируют native fetch, в отличие от card.wb.ru — проверить на research).

### Claude's Discretion (решаю по конвенциям проекта, зафиксировано)
- **Хранение прогона:** immutable **JSON-снапшот `payloadJson`** (паттерн finance-weekly W3c: рендер вкладок/PDF из снапшота) + лёгкая индекс-таблица `NicheRun` (id, createdAt, dateFrom/dateTo, status, completeness-пометка, skuCount). Посуточные ряды воронки и позиций — внутри payloadJson (не отдельные нормализованные таблицы), т.к. данные иммутабельны после сбора и всегда читаются целым прогоном.
- **Графики в PDF:** серверный рендер линий **прямо в `pdfkit`** из массивов данных (без headless-браузера и без recharts на сервере). На экране — recharts; в PDF — простые линейные оси/полилинии из тех же series.
- **Движок:** pure-функции `lib/analytics/{types,engine,data}.ts` + golden-тесты (паттерн `lib/sales-plan/`, `lib/finance-cashflow/`).
- **UI-таблицы:** sticky-паттерн существующих разделов; переключатели (сортировка, выбор метрик, период) — URL searchParams (паттерн `PlanFactControls`).

### Deferred Ideas (OUT OF SCOPE)
- Ozon и другие МП — вне фазы (только WB).
- Автосбор файлов «Сравнение карточек» — нет официального API WB.
- Автообновление/cron прогонов — запуск вручную (дорого по лимитам MPSTATS).
- Экспорт в Excel/CSV — в этой фазе только PDF.
- Прогнозы/рекомендации/AI-инсайты по нише — возможная будущая фаза аналитики.
- Сравнение прогонов ниши во времени (диффы между сохранёнными прогонами) — история хранится (req.5), но UI-сравнение — отдельно.
</user_constraints>

<phase_requirements>
## Phase Requirements

Полные формулировки и acceptance criteria — в `.planning/phases/30-analytics/30-SPEC.md` (12 requirements, локед). Ниже — краткая карта на найденные research-опоры.

| ID | Описание (кратко) | Research Support |
|----|--------------------|------------------|
| R1 | Загрузка 6 detail-JSON → топ-30 SKU | §Code Examples (валидатор), §Common Pitfalls (дубликаты nmID), §Open Questions (разные периоды файлов); паттерн загрузки — `components/stock/IvanovoUploadButton.tsx` |
| R2 | Движок метрик воронки (÷30, «от сумм», клик→заказ, цена ×0.97) | §Code Examples (aggregateFunnel), §Validation Architecture (golden-тесты); паттерн — `lib/pricing-math.ts`, `tests/pricing-math.test.ts` |
| R3 | MPSTATS — позиции organic/ad + запросы >500 | §MPSTATS API (LOW confidence — Wave 0 обязателен), §Assumptions Log A1-A3 |
| R4 | Скан карточек конкурентов (реюз) | §Basket-CDN card.json (MEDIUM/LOW), §Code Examples (basketHostForVol), reuse `lib/wb-api.ts fetchWbDiscounts` (curl) |
| R5 | Персистентность нескольких ниш с историей | §Architecture Patterns Pattern 1 (immutable snapshot), паттерн `lib/finance-weekly/snapshot.ts` + `WeeklyFinReportSnapshot` |
| R6 | Единая сортировка топ-30 на всех вкладках | §Architecture Patterns (URL searchParams controls), паттерн `PlanFactControls.tsx` |
| R7 | Правило полноты по рангу выручки (топ-10/11-30) | §Code Examples (evaluateCompleteness), §Validation Architecture |
| R8 | 5 вкладок, все 30 строк | §Architecture Patterns (recommended structure), паттерн sticky-таблиц CLAUDE.md §458 |
| R9 | «Статистика карточки» — графики динамики | §Standard Stack (recharts), паттерн `components/finance/CashflowChart.tsx` |
| R10 | «Статистика запросов» — тепловая карта | §Architecture Patterns (кастомный компонент, нет готового решения в проекте) |
| R11 | PDF-выгрузка | §Code Examples (pdfkit line-drawing), паттерн `app/api/procurement/inspection/report-generate/route.ts` |
| R12 | RBAC-раздел ANALYTICS | §Architecture Patterns Pattern 4, паттерн `20260610_phase23_cash/migration.sql` |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Обязательные для планировщика директивы (проверены на соответствие фазе 30):

- **Server Actions:** `"use server"` + `requireSection()` + try/catch + `revalidatePath` + zod-валидация (CLAUDE.md §450).
- **Select:** нативный HTML `<select>`, НЕ base-ui Select (CLAUDE.md §451). Актуально для переключателя сортировки/метрик.
- **Combobox/фильтры:** кастомный `CreatableCombobox` / `MultiSelectDropdown` при необходимости — вряд ли нужны в фазе 30 (нет reference-справочников).
- **WB v4 API — ТОЛЬКО curl**, НЕ Node fetch (TLS fingerprint блокировка) — CLAUDE.md §456, обязательное условие для `card.wb.ru/cards/v4/detail` (реюз `lib/wb-api.ts`).
- **Sticky-таблицы:** нативный `<table>` + `<thead className="bg-background">` + `sticky top-0 z-20 bg-background border-b`; **НИКОГДА** `bg-muted/40` и подобная полупрозрачность на sticky-ячейках (повторяющийся баг проекта, CLAUDE.md §471). Все 5 вкладок дашборда — sticky-таблицы, риск применим напрямую.
- **`<Link prefetch={false}>`** обязателен в списках/навигации с большим числом ссылок (CLAUDE.md §601) — если строки SKU станут `<Link>` (например, клик по строке → карточка), прописать `prefetch={false}`.
- **Server listens только на 127.0.0.1** за nginx (CLAUDE.md §603) — не относится к коду фазы, но объясняет почему MPSTATS/basket-CDN запросы идут из Node-процесса на VPS, а не через отдельный edge/worker.
- **Per-user UI настройки — НЕ localStorage**, поле на `User` (CLAUDE.md §606-617) — если понадобится персистентность выбора вкладки/метрик между сессиями (SPEC этого не требует явно — оставить как discretion, по умолчанию URL searchParams достаточно).
- **`git add -A`** при коммитах с новыми файлами (`commit -am` не берёт untracked) — операционная заметка, не влияет на план.
- **Деплой:** `nohup deploy.sh` → `==> Done` → smoke-check — вне scope этой фазы (только планирование/research).

## Summary

Фаза 30 добавляет полностью новый раздел `/analytics`, не пересекающийся по данным с существующими товарами компании — движок анализирует произвольные конкурентные SKU. Стек уже содержит всё необходимое: `recharts` (8 использований), `pdfkit` (уже применяется для генерации PDF с фото в `app/api/procurement/inspection/report-generate/route.ts`), `sharp` (сжатие фото), curl-механизм обхода TLS-fingerprint блокировки WB (`lib/wb-api.ts`). **Новых npm-зависимостей фаза не требует.**

Два по-настоящему новых для проекта элемента: (1) **фоновый прогон, переживающий HTTP-ответ** — в проекте пока нет прецедента «fire-and-forget» асинхронной работы вне request-response цикла (все существующие «sync»-кнопки блокируют HTTP до 300-600 секунд синхронно, включая специально увеличенный `nginx proxy_read_timeout 600s` для аналогичного кейса Phase 7); Next.js 15.1+ даёт для этого штатный `after()` API из `next/server`, официально поддерживаемый в self-hosted Node.js-сервере (`next start`, без Vercel-специфичного `waitUntil`) — это закрывает D-02 без внедрения очереди/Redis. (2) **MPSTATS-клиент** — новая интеграция; заголовок авторизации и общий REST-стиль (`https://mpstats.io/api/wb/get/item/{id}/{report}?d1=...&d2=...`) подтверждены несколькими независимыми источниками, но **точные пути эндпоинтов для позиций (organic/ad) и списка запросов с частотностью НЕ найдены в открытых источниках** — официальная документация mpstats.io/integrations рендерится через JS и недоступна для автоматического парсинга в этой сессии. Это блокирующий unknown для точной реализации `lib/analytics/mpstats.ts` и требует Wave 0-спайка с реальным токеном пользователя (по аналогии с уже применённым в проекте паттерном верификации WB Promotions Calendar API в `07-WAVE0-NOTES.md`).

**Primary recommendation:** Строить `lib/analytics/{types,engine,data,mpstats,wb-card-scan,pdf}.ts` как pure/DI-модули по паттерну `lib/finance-cashflow/`; хранить прогон как `NicheRun` (индекс + status) + immutable `payloadJson` (паттерн `WeeklyFinReportSnapshot`); фоновый сбор запускать через `after()` из Server Action сразу после создания `NicheRun(status=PENDING)`, с обязательным Wave 0 спайком для подтверждения реальных путей MPSTATS API и текущей карты basket-хостов ДО написания продакшен-кода клиентов.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Загрузка и валидация 6 detail-JSON | API/Backend | Browser/Client | Парсинг/дедуп nmID — server-side (безопасность, консистентность с БД); клиент только выбирает файлы |
| Извлечение топ-30 SKU + суточной воронки | API/Backend | — | Чистая функция `lib/analytics/data.ts`, вызывается только сервером |
| Движок метрик (÷30, «от сумм», ×0.97) | API/Backend | — | Pure engine, детерминирован, тестируется без Prisma/сети |
| MPSTATS-клиент (позиции/запросы) | API/Backend | — | Токен не должен покидать сервер; HTTP к внешнему API |
| Скан карточек конкурентов (card.json/detail) | API/Backend | — | curl-subprocess (`execSync`) — только серверный процесс |
| Фоновый прогон + статус-машина | API/Backend | Database/Storage | `after()` выполняется в том же Node-процессе после ответа; статус читается/пишется в БД |
| Персистентность прогона (NicheRun + payloadJson) | Database/Storage | API/Backend | Postgres/Prisma, immutable JSONB |
| Polling статуса на UI | Browser/Client | Frontend Server (RSC) | Клиент опрашивает статус-эндпоинт каждые 2-3с пока COLLECTING |
| Рендер дашборда (5 вкладок, начальные данные) | Frontend Server (RSC) | Browser/Client | RSC читает снапшот из БД, передаёт клиентским компонентам для интерактивности |
| Графики динамики (recharts) | Browser/Client | — | recharts требует `"use client"` |
| Тепловая карта запрос×день | Browser/Client | — | Кастомный интерактивный компонент (скролл внутри строки, hover) |
| PDF-экспорт (сводная + по-SKU блоки) | API/Backend | — | `pdfkit` полностью серверный, стримится в HTTP-ответ |
| RBAC-гейтинг `/analytics` | Frontend Server (Middleware) | API/Backend | `middleware.ts` (Edge) для route-редиректа + `requireSection()` в каждом Server Action/Route |
| Хранение MPSTATS-токена | Database/Storage | API/Backend | `AppSetting` KV, значение читается только на сервере |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `recharts` | ^3.8.0 (уже в package.json) [VERIFIED: package.json] | Графики динамики на вкладке «Статистика карточки» | Уже используется в 8 местах проекта (`CashflowChart.tsx`, `PlanFactChart.tsx`, `WbCardOrdersChart.tsx`), есть shadcn-обёртка `components/ui/chart.tsx` |
| `pdfkit` | ^0.19.1 (уже в package.json) [VERIFIED: package.json] | Серверная генерация PDF (req.11) | Уже применяется в `app/api/procurement/inspection/report-generate/route.ts` (фото + текст + Cyrillic-шрифты); поддерживает векторное рисование линий для графиков в PDF (`doc.moveTo/lineTo/stroke`) [CITED: pdfkit.org/docs/vector.html] |
| `sharp` | ^0.34.5 (уже в package.json) [VERIFIED: package.json] | Сжатие фото конкурентов под бюджет байт перед вставкой в PDF | Паттерн `compressToBudget()` уже в `report-generate/route.ts` |
| `zod` | ^4.3.6 (уже в package.json) [VERIFIED: package.json] | Валидация структуры detail-JSON, схемы server actions | Единственный валидатор в проекте (`lib/pricing-schemas.ts` и т.д.) |
| `next/server` `after()` | Next.js ^15.5.14 (уже в package.json) [VERIFIED: package.json + nextjs.org/docs] | Фоновый запуск сбора после ответа Server Action (D-02) | Стабилен с v15.1.0, официально поддержан для self-hosted Node.js сервера (`next start`) без доп. инфраструктуры [CITED: nextjs.org/docs/app/api-reference/functions/after] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:child_process` (execSync) | встроен в Node | curl-обход TLS-fingerprint для `card.wb.ru/cards/v4/detail` | Реюз существующего паттерна `lib/wb-api.ts:fetchWbDiscounts` — НЕ писать новый транспорт (SPEC req.4) |
| `node:fetch` (глобальный) | встроен в Node ≥18 | Запросы к MPSTATS API и, предположительно, к basket-CDN (`wbbasket.ru`) | Basket-хосты — вероятно НЕ блокируют native fetch (аналогия с `feedbacks1.wb.ru` в `lib/wb-storefront-feedbacks.ts`), но ТРЕБУЕТ проверки в Wave 0 — см. §Common Pitfalls |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `after()` для фонового прогона | Redis + BullMQ / отдельный worker-процесс | Отклонено: новая тяжёлая инфраструктура на VPS 2ГБ RAM, полностью излишняя для одного on-demand ручного прогона (SPEC: «не автообновление/cron» — нагрузка редкая); `after()` уже встроен и достаточен для одного персистентного Node-процесса |
| Нормализованные таблицы для посуточных рядов | `NicheRunDay` / `NicheRunPosition` per-SKU per-day таблицы | Отклонено discretion-решением CONTEXT.md — данные иммутабельны, читаются только целым прогоном, `payloadJson` проще и быстрее в реализации (паттерн W3c уже проверен на finance-weekly) |
| pdfkit прямое рисование линий | headless Chrome/Puppeteer + recharts SSR → screenshot → embed | Отклонено CONTEXT.md discretion — тяжёлая зависимость (Chromium ~300МБ) неприемлема на VPS 2ГБ, `pdfkit` уже достаточен для простых линейных графиков |

**Installation:**
```bash
# Новых зависимостей НЕ требуется — recharts/pdfkit/sharp/zod уже в package.json.
# after() входит в уже установленный next@^15.5.14.
```

**Version verification:**
```
npm view recharts version   → сверено с package.json (^3.8.0 установлен, актуальная версия существует на реестре)
npm view pdfkit version     → сверено с package.json (^0.19.1)
npm view next version       → сверено с package.json (^15.5.14, after() стабилен с 15.1.0)
```
Все три уже установлены и используются в проекте — команды выше нужны планировщику только для подтверждения отсутствия breaking changes при возможном апдейте, устанавливать НЕ требуется.

## Package Legitimacy Audit

**Не применимо.** Фаза 30 не вводит ни одной новой npm-зависимости — весь необходимый стек (`recharts`, `pdfkit`, `sharp`, `zod`, встроенный `next/server after()`, `node:child_process`) уже присутствует в `package.json` и активно используется в других разделах проекта. Package Legitimacy Gate (slopcheck/registry-проверка) пропускается по правилу протокола: «Every phase that installs external packages must run…» — эта фаза внешних пакетов не устанавливает.

Если в ходе планирования выяснится необходимость нового пакета (например, отдельная библиотека для тепловой карты) — планировщик обязан прогнать Package Legitimacy Gate перед добавлением в PLAN.md. Рекомендация research: тепловую карту (req.10) реализовать кастомным div/grid-компонентом на Tailwind, БЕЗ новой библиотеки — матрица «запрос × день» — простая CSS-grid раскраска по цветовой шкале, третья сторонняя библиотека избыточна.

## Architecture Patterns

### System Architecture Diagram

```
[Браузер]
  │ 1. Загружает 6 detail-JSON файлов (input[type=file][multiple])
  ▼
[API Route: POST /api/analytics/upload]  ──requireSection(ANALYTICS,VIEW)──┐
  │ 2. JSON.parse + zod-валидация структуры (salesFunnel.byDay/byWeek/byMonth,
  │    commonParams, searchQueries) + дедуп nmID across файлов
  │ 3. Если <6 файлов / <30 уникальных SKU / дубликат → 400 + явное сообщение
  ▼
[Браузер: превью 30 SKU + форма запуска сбора]
  │ 4. Пользователь подтверждает запуск (кнопка "Начать сбор")
  ▼
[Server Action: startNicheRun()]  ──requireSection(ANALYTICS,MANAGE)──┐
  │ 5. prisma.nicheRun.create({status:"PENDING", dateFrom, dateTo, skuCount:30})
  │ 6. after(async () => { ...collectNicheRun(runId)... })  ← НЕ блокирует ответ
  │ 7. return {runId}  → HTTP-ответ уходит немедленно (<1с, нет риска nginx timeout)
  ▼                                          ▼ (в фоне, тот же Node-процесс)
[Браузер: polling GET /api/analytics/runs/{id}/status каждые ~2-3с]   [collectNicheRun(runId)]
  │                                                                     │ a. status→COLLECTING
  │                                                                     │ b. MPSTATS: 30 SKU
  │                                                                     │    последовательно/умеренно
  │                                                                     │    параллельно (D-03),
  │                                                                     │    ретрай на 429 без падения
  │                                                                     │ c. card-scan: 30 nmID через
  │                                                                     │    curl (card.wb.ru detail)
  │                                                                     │    + basket-CDN card.json
  │                                                                     │    (фото + характеристики)
  │                                                                     │ d. engine: aggregateFunnel()
  │                                                                     │    по каждому SKU (из файлов)
  │                                                                     │ e. evaluateCompleteness()
  │                                                                     │    сортировка по выручке →
  │                                                                     │    провал топ-10 → FAILED
  │                                                                     │    (payloadJson НЕ пишется)
  │                                                                     │    провал 11-30 → PARTIAL
  │                                                                     │    (payloadJson пишется +
  │                                                                     │    пометка incompleteSkus)
  │                                                                     │    иначе → READY
  │                                                                     │ f. prisma.nicheRun.update(
  │                                                                     │    {status, payloadJson})
  ◄─────────────────────────────────────────────────────────────────────┘
  │ 8. Статус READY/PARTIAL/FAILED → редирект на /analytics/runs/{id}
  ▼
[RSC: /analytics/runs/[id]/page.tsx]
  │ 9. Читает NicheRun.payloadJson (единственный источник для рендера)
  ▼
[5 клиентских вкладок: Общая / Листинг / Характеристики /
 Статистика карточки (recharts) / Статистика запросов (heatmap)]
  │ Сортировка (выручка/конв.) — URL searchParams, применяется одинаково
  │ во всех вкладках, читая payloadJson на клиенте (без повторных запросов)
  ▼
[Кнопка "Выгрузить PDF"] → GET /api/analytics/runs/{id}/pdf
  │ Читает тот же payloadJson, рендерит pdfkit (сводная таблица + по-SKU блоки),
  │ порядок = текущая сортировка (передаётся query-параметром)
  ▼
[Скачивание PDF]
```

### Recommended Project Structure

```
lib/analytics/
├── types.ts              # DetailFileRaw, NicheRunPayload, FunnelAggregate, PositionSeries, ...
├── data.ts                # parseDetailFile(), mergeDetailFiles(), extractTop30() — pure
├── engine.ts               # aggregateFunnel(), evaluateCompleteness(), sortSkus() — pure
├── mpstats.ts               # MPSTATS-клиент (X-Mpstats-TOKEN), rate-limit handling — DI-friendly
├── wb-card-scan.ts          # обёртка над лист.фото+характеристики (card.json) + реюз lib/wb-api.ts detail
├── collector.ts             # оркестратор: вызывает mpstats+wb-card-scan+engine, пишет NicheRun
├── snapshot.ts               # buildNicheRunPayload()/parseNicheRunPayload() — паттерн finance-weekly/snapshot.ts
└── pdf.ts                    # renderNicheRunPdf(payload, sortOrder) — pdfkit

app/(dashboard)/analytics/
├── page.tsx                  # список прогонов (история, req.5)
├── upload/page.tsx            # форма загрузки 6 файлов + MPSTATS-токен (GlobalRatesBar-паттерн)
└── runs/[id]/
    ├── page.tsx                # RSC — читает payloadJson, рендерит вкладки
    └── (5 client-компонентов вкладок)

components/analytics/
├── AnalyticsUploadForm.tsx
├── AnalyticsTokenBar.tsx        # паттерн GlobalRatesBar — debounced MPSTATS-токен
├── NicheRunStatusPoller.tsx      # polling COLLECTING → READY/PARTIAL/FAILED
├── SortToggle.tsx                # URL searchParams, паттерн PlanFactControls
├── tabs/
│   ├── OverviewTab.tsx
│   ├── ListingTab.tsx
│   ├── CharacteristicsTab.tsx
│   ├── CardStatsTab.tsx           # recharts, паттерн CashflowChart.tsx
│   └── QueryStatsTab.tsx           # кастомная тепловая карта (div/grid)
└── PdfExportButton.tsx

app/api/analytics/
├── upload/route.ts               # POST — парсинг+валидация 6 файлов
├── runs/route.ts                  # POST — startNicheRun (или app/actions/analytics.ts)
├── runs/[id]/status/route.ts       # GET — статус для polling
└── runs/[id]/pdf/route.ts          # GET — pdfkit стрим
```

### Pattern 1: Immutable Run Snapshot (NicheRun + payloadJson)

**What:** Индекс-таблица с метаданными и статусом + одна JSONB-колонка со ВСЕМ, что нужно для рендера (воронка, метрики, фото-URL, характеристики, позиции по дням). Повторный сбор создаёт НОВУЮ запись, не перезаписывает.

**When to use:** Всегда для этой фазы — прогон дорог (лимиты MPSTATS), данные не должны пересчитываться при каждом открытии.

**Example:**
```ts
// Источник паттерна: lib/finance-weekly/snapshot.ts (W3c, quick 260710-mih)
export const NICHE_RUN_SNAPSHOT_VERSION = 1

export interface NicheRunPayload {
  version: 1
  dateFrom: string
  dateTo: string
  skus: SkuPayload[] // 30 штук, содержит всё нужное для всех 5 вкладок
}

export function parseNicheRunPayload(json: unknown): NicheRunPayload | null {
  if (typeof json !== "object" || json === null) return null
  const obj = json as Record<string, unknown>
  if (obj.version !== NICHE_RUN_SNAPSHOT_VERSION) return null
  if (!Array.isArray(obj.skus)) return null
  return obj as unknown as NicheRunPayload
}
```
Prisma-модель (draft, планировщик уточняет):
```prisma
enum NicheRunStatus {
  PENDING
  COLLECTING
  READY
  PARTIAL
  FAILED
}

model NicheRun {
  id             String         @id @default(cuid())
  createdAt      DateTime       @default(now())
  createdById    String?
  createdBy      User?          @relation(fields: [createdById], references: [id], onDelete: SetNull)
  dateFrom       DateTime       @db.Date
  dateTo         DateTime       @db.Date
  status         NicheRunStatus @default(PENDING)
  skuCount       Int            @default(0)
  progressNote   String?        // "MPSTATS 12/30, карточки 30/30" — для polling UI
  incompleteSkus Json?          // [{nmId, reason}] — для статуса PARTIAL (req.7)
  errorMessage   String?        // для FAILED
  payloadJson    Json?          // NicheRunPayload — null пока не READY/PARTIAL
  updatedAt      DateTime       @updatedAt
}
```

### Pattern 2: Background Collection via `after()` + Status Polling

**What:** Server Action создаёт запись со статусом `PENDING` и немедленно возвращает `runId`; фактический сбор запускается через `after()` (Next.js 15.1+), выполняется в том же долгоживущем Node-процессе (self-hosted `next start` за nginx/systemd), но НЕ блокирует HTTP-ответ.

**When to use:** Любая работа, которая не гарантированно укладывается в разумный HTTP-таймаут (даже при увеличенном `proxy_read_timeout 600s`, как это уже сделано для WB Promotions Calendar в Phase 7 — CLAUDE.md §294). MPSTATS: 30 SKU × (позиции + пагинация запросов) с умеренным параллелизмом (не долбить лимит) реалистично может выйти за пределы комфортного HTTP-окна.

**Example:**
```ts
// app/actions/analytics.ts
"use server"
import { after } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { collectNicheRun } from "@/lib/analytics/collector"

export async function startNicheRun(input: StartRunInput) {
  await requireSection("ANALYTICS", "MANAGE")

  const run = await prisma.nicheRun.create({
    data: { status: "PENDING", dateFrom: input.dateFrom, dateTo: input.dateTo, skuCount: input.skus.length },
  })

  after(async () => {
    try {
      await prisma.nicheRun.update({ where: { id: run.id }, data: { status: "COLLECTING" } })
      await collectNicheRun(run.id, input) // MPSTATS + card-scan + engine + completeness + save
    } catch (e) {
      console.error("[analytics] collectNicheRun failed:", e)
      await prisma.nicheRun
        .update({ where: { id: run.id }, data: { status: "FAILED", errorMessage: (e as Error).message } })
        .catch(() => {})
    }
  })

  return { ok: true, runId: run.id }
}
```
Источник API: [CITED: nextjs.org/docs/app/api-reference/functions/after] — «`after` is fully supported when self-hosting with `next start`… Node.js server: Yes». Версия стабилизации: v15.1.0 (проект на ^15.5.14 — совместимо).

**Важная деталь надёжности:** если Node-процесс упадёт (перезапуск systemd/деплой) во время `COLLECTING`, запись НАВСЕГДА останется в этом статусе — нет автоматического «reaper». Рекомендация: страница списка прогонов должна показывать явный признак «завис» для записей `COLLECTING` старше N минут (например, 15) и предлагать пометить как FAILED вручную — простая проверка `updatedAt` без отдельного cron.

### Pattern 3: Pure Engine + Golden Tests

**What:** Вся арифметика (агрегация воронки, расчёт completeness, сортировка) — чистые функции без Prisma/fetch, тестируемые в vitest без моков сети.

**Example:** см. §Code Examples ниже (`aggregateFunnel`, `evaluateCompleteness`). Паттерн 1:1 повторяет `lib/finance-cashflow/engine.ts` и `lib/sales-plan/engine.ts` (DI через параметры, без импорта `prisma` внутри engine.ts).

### Pattern 4: AppSetting KV Token + Debounced Header Bar

**What:** MPSTATS-токен — простая строка без scope/expiry метаданных (в отличие от WB JWT-токенов, которые хранятся в отдельной таблице `WbApiToken` с `scopeBitmask/issuedAt/expiresAt` — см. `lib/wb-token.ts`). Раз токен MPSTATS не несёт декодируемых метаданных, `AppSetting` (простой `key/value/updatedAt`) — оправданно проще, чем заводить отдельную таблицу по образцу `WbApiToken`. Это уже решено в CONTEXT.md D-01 — planner НЕ должен пересматривать этот выбор, но должен знать обоснование.

**Example:**
```ts
// app/actions/pricing.ts — существующий паттерн upsert (полностью реюзаблен для analytics.*)
await prisma.appSetting.upsert({
  where: { key: "analytics.mpstatsToken" },
  create: { key: "analytics.mpstatsToken", value: token },
  update: { value: token },
})
```
UI: `components/analytics/AnalyticsTokenBar.tsx` — 1:1 копия `components/prices/GlobalRatesBar.tsx` (debounce 500ms + toast + `router.refresh()`), но с ОДНИМ полем-паролем вместо N процентных ставок; input `type="password"` рекомендуется (см. §Security Domain — токен не должен светиться на экране открытым текстом).

### Pattern 5: curl-Based Transport for WB Anti-Bot Endpoints

**What:** `card.wb.ru/cards/v4/detail` блокирует Node.js `fetch()` по TLS-fingerprint (403), но проходит через `execSync("curl ...")` — уже реализовано и ПРОВЕРЕНО в `lib/wb-api.ts:fetchWbDiscounts`. Фаза 30 обязана переиспользовать именно эту функцию (SPEC req.4 — не писать новый механизм), расширив её вызовом на произвольные конкурентные nmID (сейчас вызывается только для товаров компании — реюз должен допускать любые nmID, что уже так, т.к. функция принимает `nmIds: number[]` без привязки к `Product`).

**Anti-Pattern to avoid:** переписывать curl-вызов «под новые нужды» — вместо этого обернуть существующую функцию (`fetchWbDiscounts` / близкий helper) в `lib/analytics/wb-card-scan.ts`, передавая произвольный список nmID.

### Pattern 6: Sticky Table + URL SearchParams Controls

**What:** Уже задокументировано в CLAUDE.md §458-471 (см. §Project Constraints выше). Единая сортировка (req.6) и выбор метрик (req.9) — через `useSearchParams`/`router.push`, паттерн `PlanFactControls.tsx` (native `<select>`, сегментированные кнопки, без base-ui Select).

### Pattern 7: PDF via pdfkit Direct Vector Drawing

**What:** Cyrillic-текст требует РЕГИСТРАЦИИ шрифта (`Helvetica` не содержит кириллических глифов) — на VPS уже есть `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf` (+`-Bold`), используется в `report-generate/route.ts`. Линии графиков рисуются напрямую примитивами `moveTo/lineTo/stroke` [CITED: pdfkit.org/docs/vector.html], без recharts/headless-браузера на сервере.

**Example:**
```ts
// lib/analytics/pdf.ts — упрощённый набросок линейного графика цены по дням
function drawLineChart(
  doc: PDFKit.PDFDocument,
  series: { date: string; value: number }[],
  box: { x: number; y: number; w: number; h: number },
) {
  if (series.length < 2) return
  const minV = Math.min(...series.map((s) => s.value))
  const maxV = Math.max(...series.map((s) => s.value)) || 1
  const stepX = box.w / (series.length - 1)
  const scaleY = (v: number) => box.y + box.h - ((v - minV) / (maxV - minV || 1)) * box.h

  doc.moveTo(box.x, scaleY(series[0].value))
  for (let i = 1; i < series.length; i++) {
    doc.lineTo(box.x + i * stepX, scaleY(series[i].value))
  }
  doc.strokeColor("#2563eb").lineWidth(1.5).stroke()
}
```
**Fill+stroke gotcha:** `doc.fill()` затем `.stroke()` подряд НЕ работает (ограничение PDF spec) — использовать `fillAndStroke()` при необходимости заливки под линией [CITED: pdfkit.org/docs/vector.html].

### Anti-Patterns to Avoid

- **Не вводить очередь/Redis/BullMQ ради одного фонового прогона** — `after()` полностью закрывает потребность на self-hosted единственном Node-процессе; очередь добавила бы инфраструктурный вес без пользы (нет множественных consumer-процессов, VPS 2ГБ RAM).
- **Не парсить/строить URL фото конкурентов через Node fetch к `card.wb.ru` напрямую** — только curl-реюз (см. Pattern 5).
- **Не хранить посуточные ряды в отдельных нормализованных таблицах** — уже отклонено discretion-решением (Pattern 1).
- **Не использовать headless-браузер для PDF-графиков** — уже отклонено discretion-решением (Pattern 7).
- **Не считать конверсии как среднее дневных процентов** — SPEC требует «от сумм» (сначала Σ, потом деление) — классическая ошибка агрегации, см. §Common Pitfalls.
- **Не жёстко хардкодить одну таблицу basket-host-диапазонов навсегда** — диапазоны растут со временем (см. §Common Pitfalls), нужна проверка в Wave 0 перед реализацией.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Обход TLS-fingerprint блокировки WB | Новый curl/proxy-механизм | `lib/wb-api.ts:fetchWbDiscounts` (curl execSync) | SPEC req.4 явно запрещает писать новый механизм; уже проверен в проде |
| Сжатие фото под PDF-бюджет | Своя логика ресайза/качества | `compressToBudget()` паттерн из `report-generate/route.ts` (sharp, ступени dim/quality) | Уже отлажен, есть fallback-цепочка тиров |
| Иммутабельный снапшот прогона | Своя схема версионирования JSON | `buildWeeklySnapshotPayload`/`parseWeeklySnapshotPayload` паттерн (`version` guard + null-fallback) | Уже проверенный паттерн, включая деградацию при несовпадении версии |
| Debounced KV-настройка с toast | Своя реализация debounce/toast | `GlobalRatesBar.tsx` паттерн (useRef таймеры, `useTransition`, `sonner`) | 1:1 копируемый, уже работает для похожего кейса (глобальные ставки) |
| ISO-неделя/понедельник для окна дат | Своя date-math с ошибками в edge-cases (граница года, вс/пн) | `mondayOfWeek()`/`toIsoMonday()` паттерн (`lib/finance-snapshot.ts`, `lib/finance-weekly/snapshot.ts`) | Уже покрыт тестами, обрабатывает ISO день недели (jsDay===0 → 7) |
| Валидация формы через zod-схему в Server Action | Ручные `if`-проверки полей | `lib/pricing-schemas.ts` паттерн (whitelist ключей + `z.object`) | Единая конвенция валидации во всём проекте |

**Key insight:** Почти все «строительные блоки» этой фазы — не новые инженерные задачи, а **компоновка уже существующих в проекте примитивов** (snapshot-паттерн, curl-транспорт, debounced KV, pure-engine+golden-тесты, sticky-таблицы). Единственные ДЕЙСТВИТЕЛЬНО новые элементы — MPSTATS-клиент (внешний API, часть эндпоинтов не подтверждена) и фоновый `after()`-паттерн (новый ДЛЯ ЭТОГО ПРОЕКТА, но не новый для Next.js — официальный стабильный API).

## Common Pitfalls

### Pitfall 1: MPSTATS API — точные эндпоинты позиций/запросов неизвестны
**What goes wrong:** Клиент `lib/analytics/mpstats.ts` пишется «по аналогии» с общим REST-стилем (`/api/wb/get/item/{id}/{report}`), но конкретные `{report}`-имена для (a) органика/реклама позиций по дням и (b) списка запросов с частотностью — НЕ подтверждены в открытой документации (сайт mpstats.io/integrations рендерится через JS, недоступен для автоматического парсинга в этой research-сессии).
**Why it happens:** MPSTATS не публикует полную статическую документацию; реальная спецификация эндпоинтов доступна только в личном кабинете пользователя (со своим токеном) либо по прямому запросу в поддержку.
**How to avoid:** Обязательный **Wave 0 спайк** (см. Open Questions) — с реальным токеном пользователя curl-ом проверить 2-3 кандидат-эндпоинта, задокументировать реальный ответ в `30-WAVE0-NOTES.md` (паттерн уже применён в проекте — `07-WAVE0-NOTES.md` для WB Promotions Calendar), и только после этого фиксировать пути в `mpstats.ts`.
**Warning signs:** Если планировщик пишет `mpstats.ts` с конкретными путями БЕЗ пометки «Wave 0 verified» — это прямой перенос неподтверждённого предположения в код, повторяющий паттерн `PROMO_API` из Phase 07 (там base URL ТОЖЕ был неизвестен до Wave 0 и потребовал верификации).

### Pitfall 2: nginx timeout / фоновый прогон не переживает конкретный деплой-момент
**What goes wrong:** `after()` работает в рамках уже запущенного процесса `next start`; если во время `COLLECTING` происходит `systemctl restart zoiten-erp` (деплой очередной фазы, что происходит часто в этом проекте — см. `deploy.sh`), фоновая задача обрывается без сохранения ошибки, прогон навсегда «висит» в `COLLECTING`.
**Why it happens:** `after()` не переживает kill/restart процесса — это ожидаемое поведение (документация Next.js говорит только про «graceful drain period 10-30 сек» для штатного завершения, не про SIGKILL).
**How to avoid:** UI списка прогонов должен явно показывать «завис» для записей `COLLECTING` старше ~15 минут (по `updatedAt`) с кнопкой «Пометить как FAILED» — простая проверка, не требует cron/watchdog-процесса.
**Warning signs:** Пользователь видит вечный спиннер «Собираем данные…» без возможности перезапустить.

### Pitfall 3: card.wb.ru TLS-fingerprint блокировка Node fetch
**What goes wrong:** Прямой `fetch()` к `card.wb.ru/cards/v4/detail` возвращает 403/HTML вместо JSON.
**Why it happens:** WB детектирует TLS ClientHello отпечаток undici (Node fetch) и блокирует; curl проходит (другой TLS-стек/порядок cipher suites).
**How to avoid:** Использовать ТОЛЬКО curl-реюз (`execSync`), как уже сделано в `lib/wb-api.ts` (SPEC req.4 требует именно это).
**Warning signs:** JSON.parse падает на строке, начинающейся с `<html>`.

### Pitfall 4: basket-CDN host-таблица устаревает
**What goes wrong:** Диапазон `vol → basket-host` (напр. vol≤2405 → host 15) — вычисляется по историческим данным из community-парсеров и статьи WB на Habr (актуальной на момент публикации: shard 28 обслуживал vol 5190-5501). WB регулярно добавляет новые шарды по мере роста каталога — жёстко зашитая таблица устареет за недели/месяцы.
**Why it happens:** Нет официального публичного API для получения актуальной карты шардов — только реверс-инжиниринг сообщества.
**How to avoid:** (1) Задокументировать таблицу с датой снятия среза; (2) реализовать fallback-пробирование — если ожидаемый host возвращает 404, пробовать соседние (`host-1`, `host+1`) или диапазон вокруг (старые шарды read-only, но не удаляются — актуальные для старых nmID остаются доступны на старом host); (3) обновить таблицу непосредственно перед началом реализации фазы (свежий WebSearch на дату исполнения, не на дату research).
**Warning signs:** Фото не загружаются для части nmID, хотя карточка точно существует на WB.

### Pitfall 5: Cyrillic-текст в PDF без зарегистрированного шрифта
**What goes wrong:** `Helvetica` (встроенный шрифт pdfkit) не содержит кириллических глифов — русский текст рендерится пустыми прямоугольниками/квадратами.
**Why it happens:** Стандартные 14 PDF-шрифтов (Helvetica и т.д.) покрывают только Latin-1.
<br>
**How to avoid:** Регистрировать `DejaVuSans.ttf`/`DejaVuSans-Bold.ttf` (уже присутствуют на VPS по пути `/usr/share/fonts/truetype/dejavu/`), с graceful fallback на `Helvetica` если файлов нет (паттерн `report-generate/route.ts`: `existsSync(FONT_REG) && existsSync(FONT_BOLD)`).
**Warning signs:** PDF генерируется без ошибки, но текст нечитаем.

### Pitfall 6: «От сумм» vs «среднее процентов» — расчёт конверсий
**What goes wrong:** Наивная реализация усредняет ежедневные проценты (`avg(CTR_day1, CTR_day2, ...)`), что математически НЕ эквивалентно требуемому `Σ(openCard) / Σ(viewCount)` при неравномерном распределении показов по дням.
**Why it happens:** SPEC явно требует «не как среднее арифметическое дневных процентов, а от суммарных объёмов» (30-SPEC.md req.2) — легко упустить при беглой реализации.
**How to avoid:** golden-тест с фикстурой, где дни с разным объёмом дают РАЗНЫЙ результат при двух методах расчёта — тест должен явно проверять, что используется «от сумм», а не среднее.
**Warning signs:** Итоговые проценты в UI слегка отличаются от «дашборд WB кабинета» пользователя (если он сверяет вручную).

### Pitfall 7: Дубликаты nmID между 6 файлами
**What goes wrong:** Один и тот же конкурентный nmID случайно попадает в 2 из 6 загруженных отчётов (например, пользователь по ошибке дважды экспортировал похожую подборку) — итог 30 «слотов», но <30 уникальных SKU.
**Why it happens:** Файлы загружаются независимо, валидация внутри одного файла не видит остальные 5.
**How to avoid:** Дедуп-проверка ДОЛЖНА быть кросс-файловой (накопительное множество nmID при последовательном приёме файлов), не только внутри одного файла — SPEC req.1 acceptance явно требует «ровно 30 SKU» и «дубликат отклоняется».
**Warning signs:** Прогон стартует с 29 уникальными SKU вместо 30, тесты это не поймают, если проверяют только один файл изолированно.

### Pitfall 8: Разные периоды `byDay` в 6 файлах
**What goes wrong:** ТЗ описывает «единый период» для всех 30 SKU, но 6 файлов загружаются независимо и МОГУТ быть выгружены пользователем в разные дни/с разным окном `byDay`.
**Why it happens:** Нет технического ограничения, гарантирующего, что все 6 экспортов из кабинета WB были сделаны одновременно.
**How to avoid:** См. §Open Questions — планировщик должен решить: (a) требовать идентичный период у всех 6 файлов (отклонять с сообщением при расхождении), или (b) брать пересечение/объединение периодов. Рекомендация research: **вариант (a)** — строже, но соответствует буквальному прочтению ТЗ («единая шкала дат»), и предотвращает скрытые артефакты в графиках динамики.

## Code Examples

### Aggregate Funnel («от сумм», req.2)
```ts
// lib/analytics/engine.ts — источник формул: 30-SPEC.md req.2, 30-TZ-source.md §3
export interface FunnelDayRaw {
  nmId: number
  dt: string
  viewCount: number
  openCard: number
  addToCart: number
  orders: number
  ordersSum: number
  buyoutCount: number
  medianPrice: number
}

export interface FunnelAggregate {
  viewsPerDay: number
  ordersPerDay: number
  ordersSumPerDay: number
  ctr: number
  clickToCart: number
  cartToOrder: number
  clickToOrder: number // = Σorders/ΣopenCard, ДОЛЖНО совпадать с clickToCart*cartToOrder
  buyoutPct: number
  medianPriceWallet: number // = avg(medianPrice) * 0.97
}

export function aggregateFunnel(days: FunnelDayRaw[]): FunnelAggregate {
  const sums = days.reduce(
    (acc, d) => ({
      viewCount: acc.viewCount + d.viewCount,
      openCard: acc.openCard + d.openCard,
      addToCart: acc.addToCart + d.addToCart,
      orders: acc.orders + d.orders,
      ordersSum: acc.ordersSum + d.ordersSum,
      buyoutCount: acc.buyoutCount + d.buyoutCount,
    }),
    { viewCount: 0, openCard: 0, addToCart: 0, orders: 0, ordersSum: 0, buyoutCount: 0 },
  )
  const n = days.length || 1
  const ctr = sums.viewCount > 0 ? sums.openCard / sums.viewCount : 0
  const clickToCart = sums.openCard > 0 ? sums.addToCart / sums.openCard : 0
  const cartToOrder = sums.addToCart > 0 ? sums.orders / sums.addToCart : 0
  const clickToOrder = sums.openCard > 0 ? sums.orders / sums.openCard : 0 // от сумм
  const buyoutPct = sums.orders > 0 ? sums.buyoutCount / sums.orders : 0
  const avgPriceReport = days.reduce((s, d) => s + d.medianPrice, 0) / n

  return {
    viewsPerDay: sums.viewCount / n,
    ordersPerDay: sums.orders / n,
    ordersSumPerDay: sums.ordersSum / n,
    ctr,
    clickToCart,
    cartToOrder,
    clickToOrder,
    buyoutPct,
    medianPriceWallet: avgPriceReport * 0.97,
  }
}
```

### Completeness Rule по рангу выручки (req.7)
```ts
// lib/analytics/engine.ts
export interface SkuCompletenessInput {
  nmId: number
  revenue: number
  hasFunnel: boolean
  hasPhotos: boolean
  hasCharacteristics: boolean
  hasPositions: boolean
}

export interface CompletenessResult {
  status: "OK" | "PARTIAL" | "FAILED"
  failedInTop10: number[]
  failedIn11to30: number[]
}

export function evaluateCompleteness(skus: SkuCompletenessInput[]): CompletenessResult {
  // ВСЕГДА сортировка по выручке для этой проверки — независимо от текущей UI-сортировки (req.6/req.7)
  const byRevenueDesc = [...skus].sort((a, b) => b.revenue - a.revenue)
  const failed = byRevenueDesc
    .map((s, i) => ({ ...s, rank: i + 1 }))
    .filter((s) => !s.hasFunnel || !s.hasPhotos || !s.hasCharacteristics || !s.hasPositions)

  const failedInTop10 = failed.filter((s) => s.rank <= 10).map((s) => s.nmId)
  const failedIn11to30 = failed.filter((s) => s.rank > 10).map((s) => s.nmId)

  if (failedInTop10.length > 0) return { status: "FAILED", failedInTop10, failedIn11to30 }
  if (failedIn11to30.length > 0) return { status: "PARTIAL", failedInTop10: [], failedIn11to30 }
  return { status: "OK", failedInTop10: [], failedIn11to30: [] }
}
```

### Background Run Trigger (Pattern 2, полный листинг — см. §Architecture Patterns выше)

### Basket-CDN URL Construction (draft, требует Wave 0 обновления таблицы)
```ts
// lib/analytics/wb-card-scan.ts
// ⚠ Таблица диапазонов устаревает — WB добавляет шарды со временем.
// Источники на дату research (2026-07-13): habr.com/ru/companies/wildberries/articles/967988
// (vol/part формула) + community-парсер github.com/Duff89/wildberries_parser (таблица ниже,
// частично устарела — верифицировать перед реализацией актуальными nmID).
const BASKET_RANGES: Array<[number, string]> = [
  [143, "01"], [287, "02"], [431, "03"], [719, "04"], [1007, "05"],
  [1061, "06"], [1115, "07"], [1169, "08"], [1313, "09"], [1601, "10"],
  [1655, "11"], [1919, "12"], [2045, "13"], [2189, "14"], [2405, "15"],
  // ... таблица продолжается — ОБНОВИТЬ актуальными диапазонами в Wave 0
]

function basketHostForVol(vol: number): string {
  for (const [maxVol, host] of BASKET_RANGES) if (vol <= maxVol) return host
  return "28" // fallback — актуализировать (habr 2026: shard 28 активен для vol 5190-5501)
}

export function cardJsonUrl(nmId: number): string {
  const vol = Math.floor(nmId / 100000)
  const part = Math.floor(nmId / 1000)
  const host = basketHostForVol(vol)
  return `https://basket-${host}.wbbasket.ru/vol${vol}/part${part}/${nmId}/info/ru/card.json`
}
```

### MPSTATS Client Skeleton (пути эндпоинтов — UNCONFIRMED, см. Assumptions Log)
```ts
// lib/analytics/mpstats.ts
const MPSTATS_BASE = "https://mpstats.io/api/wb" // [CITED: n8n community thread + mpstats.io/integrations/docs/description — base + auth подтверждены]

export class MpstatsRateLimitError extends Error {
  constructor() { super("MPSTATS: лимит тарифа исчерпан (429)") }
}

async function mpstatsFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${MPSTATS_BASE}${path}`, { headers: { "X-Mpstats-TOKEN": token } })
  if (res.status === 429) throw new MpstatsRateLimitError()
  if (!res.ok) throw new Error(`MPSTATS ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

// [ASSUMED — путь НЕ подтверждён, требует Wave 0]:
// export async function fetchPositions(nmId: number, d1: string, d2: string, token: string) {
//   return mpstatsFetch(`/get/item/${nmId}/positions?d1=${d1}&d2=${d2}`, token)
// }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Синхронная HTTP-обработка длинных WB-синков (300-600с блокирующий request, `WbSyncButton` cooldown+спиннер) | `after()`-based фоновый прогон с polling статуса | Первое применение в проекте — вводится этой фазой | Для req. с рисками таймаута (MPSTATS 30×) — не блокирует HTTP; UI получает промежуточный прогресс, а не «висящий» спиннер 5+ минут |
| `unstable_after` (experimental, Next 15.0 RC) | `after` стабилен из `next/server` | v15.1.0 (Next.js) | Проект на `^15.5.14` — можно использовать напрямую, без экспериментальных флагов |

**Deprecated/outdated:** нет прямых deprecations, релевантных этой фазе — весь стек (recharts 3.x, pdfkit 0.19.x, Next 15.5.x) актуален.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | MPSTATS REST-путь для позиций (organic/ad + CPM/тип/буст) имеет вид `/api/wb/get/item/{nmId}/<report-name>?d1=&d2=` с ещё неподтверждённым `<report-name>` | §MPSTATS Client Skeleton, §Common Pitfalls #1 | Клиент `mpstats.ts` пишется вслепую, весь req.3 не работает до первого реального прогона; обнаружится только на этапе выполнения, а не планирования |
| A2 | MPSTATS REST-путь для списка запросов ниши с частотностью существует как отдельный `item`-эндпоинт (аналогично по конвенции) | §MPSTATS Client Skeleton | Фильтр «частотность > 500» (req.3) не будет реализуем без корректного эндпоинта |
| A3 | Basket-CDN (`wbbasket.ru`) НЕ блокирует native Node `fetch()` (в отличие от `card.wb.ru`) — по аналогии с уже верифицированным `feedbacks1.wb.ru` в `lib/wb-storefront-feedbacks.ts` | §Standard Stack (Supporting), Pattern 5 | Если basket-CDN тоже блокирует Node fetch — придётся расширять curl-транспорт на card.json-запросы (не критично, но требует доп. кода) |
| A4 | Таблица `vol → basket-host` (см. Code Examples) актуальна лишь частично (данные от 2026-07-13 из вторичных источников); реальная граница на дату исполнения фазы может отличаться | §Common Pitfalls #4, §Code Examples | Часть фото конкурентов не загрузится (404), что при попадании в топ-10 заблокирует ВЕСЬ прогон (req.7) |
| A5 | Поля detail-JSON (`byDay[].viewCount/openCard/addToCart/orders/ordersSum/CTR/medianPrice/buyoutPercent`, `commonParams[].brandName/mainPhoto/nmRating/feedbacksCount`) в `30-TZ-source.md` соответствуют РЕАЛЬНОМУ ответу WB «Сравнение карточек» — эти имена взяты из пользовательского ТЗ (перехваченный DevTools JSON), не проверены на реальном файле в этой research-сессии | §Phase Requirements R1, §Common Pitfalls #7-8 | Парсер `parseDetailFile()` может не совпасть с реальной структурой поля-в-поле — критично получить ≥1 реальный образец файла в Wave 0 |
| A6 | Хранение `analytics.mpstatsToken` в `AppSetting.value` (plaintext String) достаточно безопасно для этого внутреннего ERP-инструмента (уже решено как D-01, не пересматривается) | §Pattern 4, §Security Domain | Токен читаем любым, у кого есть доступ к БД (напр. через Prisma Studio); при компрометации БД — MPSTATS-аккаунт скомпрометирован до ручной ротации токена |

**Если таблица окажется неактуальной к моменту планирования** — все 6 пунктов требуют явного подтверждения (Wave 0 спайк) до написания production-кода соответствующих модулей.

## Open Questions

1. **Точные MPSTATS-эндпоинты позиций и списка запросов**
   - What we know: базовый URL (`mpstats.io/api/wb`), заголовок авторизации (`X-Mpstats-TOKEN`, альтернативно `auth-token` query param), общая конвенция путей (`/get/item/{id}/{report}?d1=&d2=`), подтверждённый рабочий пример — `/get/item/{sku}/sales`.
   - What's unclear: конкретные имена report для (a) позиции organic/ad по дням + рекламные параметры (CPM/тип размещения/буст-позиция), (b) список запросов SKU с частотностью.
   - Recommendation: Wave 0 спайк с реальным MPSTATS-токеном пользователя — curl несколько кандидатов (`/get/item/{id}/keywords`, `/get/item/{id}/positions`, `/get/item/{id}/search_queries` и т.п.), либо изучить раздел API в личном кабинете MPSTATS пользователя (`Аккаунт → API токен`, часто содержит персональную Swagger/Postman-документацию), задокументировать в `30-WAVE0-NOTES.md` по образцу `07-WAVE0-NOTES.md`.

2. **Различие периодов `byDay` между 6 загруженными файлами**
   - What we know: SPEC подразумевает единый период («окно дат = период файлов»), ТЗ описывает один общий диапазон ~30 дней.
   - What's unclear: что делать, если 6 файлов реально имеют разные `byDay`-диапазоны (загружены не одновременно).
   - Recommendation: планировщик должен явно решить — отклонять несовпадающие периоды (строже, рекомендуется research) либо брать пересечение. Отразить в PLAN.md как явное правило валидации.

3. **Актуальная карта `vol → basket-host`**
   - What we know: формула vol/part подтверждена официальной статьёй WB на Habr; таблица диапазонов от community-парсера частично устарела относительно этой же статьи (там уже упоминается shard 28 на существенно больших vol, чем таблица покрывает).
   - What's unclear: точные актуальные границы на момент фактической реализации фазы (дата исполнения может отличаться от даты research).
   - Recommendation: перед написанием `wb-card-scan.ts` — свежий WebSearch/проверка на 2-3 реальных конкурентных nmID из ожидаемой ниши плюс fallback-пробирование соседних хостов при 404.

4. **Реальная структура detail-JSON «Сравнение карточек»**
   - What we know: структура задокументирована в `30-TZ-source.md` со слов пользователя (перехвачен через DevTools), выглядит правдоподобно (поля пересекаются по смыслу с существующей `WbCardFunnelDaily`-моделью в этом же проекте, которая берёт данные из ОФИЦИАЛЬНОГО WB Analytics API — это косвенно повышает доверие к именам полей).
   - What's unclear: точный regex/nesting/casing полей БЕЗ реального файла-образца.
   - Recommendation: запросить у пользователя ≥1 реальный detail-JSON файл ДО написания `parseDetailFile()` — сохранить как `tests/fixtures/analytics-detail-sample.json` (паттерн уже применялся в проекте: `tests/fixtures/wb-chat-chats-sample.json` и др.).

5. **Что происходит при перезапуске Node-процесса во время `COLLECTING`**
   - What we know: `after()` не переживает SIGKILL/restart процесса; в проекте регулярно происходят деплои (`deploy.sh` → `systemctl restart`).
   - What's unclear: нужен ли механизм автоматического «докручивания» зависшего прогона, или достаточно ручной пометки FAILED пользователем.
   - Recommendation: для v1 фазы — достаточно UI-индикатора «завис» + кнопки ручной пометки FAILED (простая проверка `updatedAt`), полноценный watchdog — over-engineering для функции, которая используется вручную и нечасто (не cron).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Node.js (fetch/child_process) | MPSTATS-клиент, curl-обёртка | ✓ | v24.15.0 (dev-машина); VPS — см. DEPLOY.md | — |
| curl | Скан карточек (card.wb.ru) | ✓ | 8.19.0 (dev-машина); на VPS уже используется существующим кодом | — |
| Кириллические TTF-шрифты (`DejaVuSans.ttf`/`-Bold`) | PDF-выгрузка (req.11) | ✓ (подтверждено комментарием в `report-generate/route.ts` — «есть на VPS» по пути `/usr/share/fonts/truetype/dejavu/`) | — | Graceful fallback на `Helvetica` (без кириллицы) уже реализован в существующем коде — паттерн реюзабелен |
| MPSTATS API токен | Весь сбор позиций (req.3) | ✗ (пользователь предоставляет per-прогон) | — | Нет fallback — без токена MPSTATS-часть сбора невозможна; UI должен блокировать запуск сбора без токена в `AppSetting` |
| nginx `proxy_read_timeout` | Косвенно — HTTP-ответ Server Action (не сам фоновый сбор, тот уже вне HTTP-цикла благодаря `after()`) | ✓ (600s уже настроен для Phase 7, см. CLAUDE.md §294) | — | Не критично для req.2/3/4 — `after()` разгружает основной риск таймаута; НО важно для upload-эндпоинта (req.1), если валидация 6 файлов окажется медленной (маловероятно, JSON.parse быстрый) |

**Missing dependencies with no fallback:**
- MPSTATS API токен — принципиально не может быть заменён fallback-ом, это данные пользователя.

**Missing dependencies with fallback:**
- Кириллические шрифты — fallback на Helvetica уже реализован в существующем коде (деградация: PDF без кириллицы, лучше чем падение).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.4 (уже настроен, `vitest.config.ts`) |
| Config file | `vitest.config.ts` (alias `@` → корень проекта, pool `vmForks` для Windows-стабильности) |
| Quick run command | `npx vitest run tests/analytics-engine.test.ts` (после создания файла) |
| Full suite command | `npm test` (= `vitest run`, покрывает все 100+ существующих test-файлов + новые) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| R1 | Парсинг 6 файлов → 30 SKU, отклонение дубликатов/невалидной структуры | unit | `npx vitest run tests/analytics-data.test.ts` | ❌ Wave 0 |
| R2 | aggregateFunnel — золотой тест (÷30, «от сумм», клик→заказ=произведение, цена×0.97) | unit (golden) | `npx vitest run tests/analytics-engine.test.ts` | ❌ Wave 0 |
| R3 | MPSTATS-клиент — контрактный тест на мок-ответах (после Wave 0 подтверждения формата) | unit (mocked fetch) | `npx vitest run tests/analytics-mpstats.test.ts` | ❌ Wave 0 (блокируется §Open Questions #1) |
| R4 | wb-card-scan — обёртка над существующим curl-механизмом, тест на фикстуре card.json | unit (mocked execSync) | `npx vitest run tests/analytics-wb-card-scan.test.ts` | ❌ Wave 0 |
| R5 | Персистентность — mocked-prisma тест снапшот-паттерна (build/parse payload) | unit (mocked prisma, паттерн `tests/balance-data.test.ts`) | `npx vitest run tests/analytics-snapshot.test.ts` | ❌ Wave 0 |
| R6 | Сортировка одинакова на всех вкладках | unit (pure sort function) + manual UI smoke | `npx vitest run tests/analytics-engine.test.ts` | ❌ Wave 0 |
| R7 | evaluateCompleteness — золотой тест (провал в топ-10 → FAILED; 11-30 → PARTIAL) | unit (golden) | `npx vitest run tests/analytics-engine.test.ts` | ❌ Wave 0 |
| R8 | 5 вкладок рендерят все 30 строк | manual UI smoke (нет прецедента component-тестов для полных страниц в этом проекте) | — | manual-only |
| R9 | N метрик → N графиков в строке | manual UI smoke | — | manual-only |
| R10 | Тепловая карта — средняя позиция игнорирует дни-прочерки | unit (pure aggregation function) | `npx vitest run tests/analytics-engine.test.ts` | ❌ Wave 0 |
| R11 | PDF генерируется без ошибки, содержит 30 строк + по-SKU блоки | integration (реальный pdfkit рендер в Buffer, проверка ненулевого размера + PDF magic bytes) | `npx vitest run tests/analytics-pdf.test.ts` | ❌ Wave 0 |
| R12 | RBAC 403 без гранта / доступ у SUPERADMIN и гранта ANALYTICS | unit (mocked auth/session, паттерн существующих rbac-тестов, если есть) — иначе manual smoke по аналогии с другими разделами | manual smoke (curl 403 на VPS после деплоя, паттерн DEPLOY.md) | manual-only |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/analytics-*.test.ts` (быстрый прогон только новых файлов)
- **Per wave merge:** `npm test` (полный набор — 100+ существующих файлов не должны сломаться)
- **Phase gate:** Полный набор зелёный перед `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/fixtures/analytics-detail-sample.json` — реальный (или тщательно правдоподобный синтетический) образец detail-файла для парсер-тестов (см. Open Question #4)
- [ ] `tests/fixtures/analytics-card-sample.json` — образец basket-CDN card.json (после подтверждения реального формата в Wave 0)
- [ ] `30-WAVE0-NOTES.md` — curl-верификация реальных MPSTATS-эндпоинтов с токеном пользователя (см. Open Question #1) — БЛОКИРУЕТ полноценный тест R3 до завершения
- [ ] `tests/analytics-*.test.ts` (7 файлов по таблице выше) — новые, framework уже настроен, доп. установки не требуется

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V2 Authentication | no | Reuse существующего Auth.js v5, без изменений в этой фазе |
| V3 Session Management | no | Без изменений |
| V4 Access Control | yes | `requireSection("ANALYTICS", "VIEW"/"MANAGE")` на каждом Server Action/Route + `middleware.ts` route-guard (паттерн проекта, см. Pattern 4 и CLAUDE.md §148-151) |
| V5 Input Validation | yes | zod-схемы для detail-JSON структуры (nested salesFunnel/commonParams/searchQueries), лимит размера файла на upload-эндпоинте (nginx `client_max_body_size 5m` уже настроен глобально — 6 JSON detail-файлов должны уместиться, но стоит проверить реальный размер типичного файла отчёта в Wave 0) |
| V6 Cryptography | yes (частично) | MPSTATS-токен хранится PLAINTEXT в `AppSetting.value` (локед решение D-01) — НЕ шифруется на уровне приложения. Это соответствует существующему прецеденту `WbApiToken.value` (тоже plaintext String в БД), т.е. НЕ хуже текущего уровня защиты проекта, но и не лучше — приемлемо для внутреннего ERP с доверенным доступом к БД (не multi-tenant SaaS) |

### Known Threat Patterns for Next.js/Prisma/внешние API-интеграции

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| MPSTATS-токен виден в открытом виде на экране/в DOM | Information Disclosure | `<input type="password">` для поля токена в `AnalyticsTokenBar.tsx` (паттерн `GlobalRatesBar` использует `type="number"` для ставок — для токена сделать `type="password"`, показывать placeholder «••••••••» вместо реального значения при повторном открытии формы) |
| SSRF через произвольный nmID → произвольный URL basket-CDN | Tampering/Elevation | nmID приходит ТОЛЬКО из уже провалидированных detail-JSON файлов (числовое поле, диапазон разумных WB ID) — не принимать nmID напрямую из непроверенного пользовательского ввода URL; валидировать как `Number.isInteger && > 0 && < 2^31` перед построением URL |
| Загрузка вредоносного/огромного JSON-файла (DoS через `JSON.parse` большого файла) | Denial of Service | Ограничение размера файла на клиенте (`accept=".json"` + явная проверка `file.size` до 5-10 МБ перед отправкой) и на сервере (nginx `client_max_body_size` уже 5m глобально — детали конкретного лимита для 6 файлов уточнить в Wave 0) |
| Утечка MPSTATS-лимита через параллельные клики «Начать сбор» (повторный запуск того же прогона) | Resource Exhaustion | UI должен дизейблить кнопку «Начать сбор» пока есть активный прогон в статусе `PENDING`/`COLLECTING` (аналог существующего UI-cooldown в `WbSyncButton.tsx`, но здесь — блокировка по факту наличия незавершённого NicheRun, а не по времени) |
| Отсутствие rate-limit на upload-эндпоинте (спам загрузками) | Resource Exhaustion | `requireSection` уже ограничивает доступ до авторизованных пользователей раздела — в контексте внутреннего ERP с малым числом пользователей риск низкий, доп. rate-limit не требуется для v1 |

## Sources

### Primary (HIGH confidence)
- [nextjs.org/docs/app/api-reference/functions/after](https://nextjs.org/docs/app/api-reference/functions/after) — `after()` API, стабильность с v15.1.0, поддержка self-hosted Node.js server
- [pdfkit.org/docs/vector.html](https://pdfkit.org/docs/vector.html) — векторное рисование линий (`moveTo/lineTo/stroke`, `fillAndStroke`)
- Codebase: `lib/wb-api.ts`, `lib/wb-storefront-feedbacks.ts`, `lib/finance-weekly/snapshot.ts`, `lib/wb-token.ts`, `prisma/schema.prisma`, `CLAUDE.md`, `app/api/procurement/inspection/report-generate/route.ts`, `components/prices/GlobalRatesBar.tsx`, `components/sales-plan/PlanFactControls.tsx`, `components/finance/CashflowChart.tsx`, `tests/pricing-math.test.ts`, `tests/balance-data.test.ts`, `vitest.config.ts`, `package.json`, `prisma/migrations/20260610_phase23_cash/migration.sql`, `prisma/migrations/20260710_weekly_finreport_snapshot/migration.sql`

### Secondary (MEDIUM confidence)
- [habr.com/ru/companies/wildberries/articles/967988](https://habr.com/ru/companies/wildberries/articles/967988/) — официальная статья WB про файловое хранилище (VOL=NM/100000, part=NM/1000, sharding-принцип)
- MPSTATS API base URL + `X-Mpstats-TOKEN` авторизация — подтверждено несколькими независимыми источниками (n8n community thread, mpstats.io/integrations/docs/description synthesis)
- [community.n8n.io — MPSTATS HTTP request thread](https://community.n8n.io/t/help-us-connect-n8n-to-the-mpstats-service-via-http-request/157514) — рабочий пример эндпоинта `/api/wb/get/item/{sku}/sales`

### Tertiary (LOW confidence — требуют валидации в Wave 0)
- [github.com/Duff89/wildberries_parser](https://github.com/Duff89/wildberries_parser/blob/master/parser.py) — таблица basket-host диапазонов (частично устарела относительно habr-статьи)
- MPSTATS точные пути для позиций/запросов — НЕ найдены в открытых источниках (mpstats.io/integrations — JS-рендер, недоступен для парсинга в этой сессии)
- Поля `30-TZ-source.md` (detail-JSON структура) — со слов пользователя, не сверены с реальным файлом

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — весь стек уже в проекте и используется, версии подтверждены `package.json`
- Architecture (снапшот/RBAC/sticky/pure-engine): HIGH — прямые прецеденты в этом же кодовом репозитории
- Architecture (фоновый `after()`-прогон): HIGH по механизму (официально документирован), но НОВОЕ применение для проекта — нет собственного прецедента, риск в edge-cases (Pitfall 2)
- MPSTATS-интеграция: LOW — базовая аутентификация/стиль URL подтверждены, конкретные пути НЕ найдены, обязателен Wave 0
- Basket-CDN card.json: MEDIUM (формула) / LOW (host-таблица) — алгоритм подтверждён официальной статьёй WB, но карта хостов подвержена дрейфу
- Pitfalls: HIGH — большинство основано на уже задокументированных в CLAUDE.md реальных инцидентах этого же проекта

**Research date:** 2026-07-13
**Valid until:** ~2026-07-27 (14 дней) — короче обычного 30-дневного окна из-за: (1) volатильности basket-host карты (растёт непредсказуемо), (2) вероятности, что MPSTATS Wave 0-спайк изменит найденные здесь предположения о путях API. Architecture/Standard Stack часть (не зависящая от внешних API) — валидна дольше, ~30 дней.
