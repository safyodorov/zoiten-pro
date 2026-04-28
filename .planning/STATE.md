---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Служба поддержки WB
status: Ready to execute
stopped_at: Completed 16-01-PLAN.md
last_updated: "2026-04-28T10:55:10.504Z"
progress:
  total_phases: 13
  completed_phases: 13
  total_plans: 51
  completed_plans: 52
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-21)

**Core value:** Единая база товаров компании, от которой зависят все остальные процессы ERP
**Current focus:** Phase 16 — wb-stock-sizes

## Current Position

Phase: 16 (wb-stock-sizes) — EXECUTING
Plan: 2 of 7

## Performance Metrics

**Velocity:**

- Total plans completed: 30
- Average duration: -
- Total execution time: -

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: Phase 07 P07..P11
- Trend: -

*Updated after each plan completion*
| Phase 01 P01 | 7 | 2 tasks | 19 files |
| Phase 01-foundation-auth P02 | 8 | 2 tasks | 4 files |
| Phase 01-foundation-auth P03 | 5 | 2 tasks | 6 files |
| Phase 01-foundation-auth P04 | 4 | 2 tasks | 10 files |
| Phase 02 P01 | 5 | 3 tasks | 11 files |
| Phase 02 P02 | 3 | 3 tasks | 5 files |
| Phase 03-reference-data P01 | 8 | 2 tasks | 2 files |
| Phase 03 P03 | 5 | 1 tasks | 1 files |
| Phase 03-reference-data P02 | 7 | 2 tasks | 8 files |
| Phase 04 P01 | 3 | 3 tasks | 6 files |
| Phase 04 P02 | 2m | 2 tasks | 4 files |
| Phase 04-products-module P03 | 363 | 3 tasks | 4 files |
| Phase 04-products-module P04 | 44s | 2 tasks | 2 files |
| Phase 05-ui-module-stubs P02 | 2min | 2 tasks | 8 files |
| Phase 05-ui-module-stubs P01 | 2min | 2 tasks | 5 files |
| Phase 06 P01 | 87s | 2 tasks | 6 files |
| Phase 06-deployment P02 | 139s | 1 tasks | 1 files |
| Phase 07-prices-wb P01 | 3min | 2 tasks | 2 files |
| Phase 07-prices-wb P00 | 21min | 2 tasks | 8 files |
| Phase 07-prices-wb P02 | 25min | 1 tasks | 3 files |
| Phase 07-prices-wb P03 | 6min | 2 tasks | 3 files |
| Phase 07-prices-wb P05 | 7min | 1 tasks | 3 files |
| Phase 07-prices-wb P04 | 9min | 2 tasks | 4 files |
| Phase 07-prices-wb P06 | 3min | 2 tasks | 6 files |
| Phase 07-prices-wb P07 | 15min | 2 tasks | 3 files |
| Phase 07-prices-wb P09 | 18min | 1 tasks | 4 files |
| Phase 07-prices-wb P10 | 159s | 3 tasks | 3 files |
| Phase 07-prices-wb P11 | 31min | 2 tasks | 3 files |
| Phase 09-returns P01 | 8min | 3 tasks | 7 files |
| Phase 09-returns P02 | 5min | 2 tasks | 5 files |
| Phase 09-returns P03 | 6min | 3 tasks | 5 files |
| Phase 09-returns P04 | 7min | 3 tasks | 5 files |
| Phase 11-templates-appeals P01 | 10min | 3 tasks | 8 files |
| Phase 11-templates-appeals P02 | 3min | 1 tasks | 2 files |
| Phase 11-templates-appeals P03 | 5min | 2 tasks | 13 files |
| Phase 10-chat-autoreply P01 | 15min | 3 tasks | 9 files |
| Phase 10-chat-autoreply P02 | 20min | 3 tasks | 6 files |
| Phase 10-chat-autoreply P03 | 4min | 2 tasks | 5 files |
| Phase 10 P04 | 8min | 3 tasks | 8 files |
| Phase 12 P01 | 5min | 3 tasks | 10 files |
| Phase 12 P02 | 4min | 3 tasks | 12 files |
| Phase 12 P03 | 15min | 3 tasks | 8 files |
| Phase 13-statistics P01 | 4min | 3 tasks | 7 files |
| Phase 13-statistics P02 | 5min | 3 tasks | 11 files |
| Phase 14-stock P01 | 391 | 2 tasks | 19 files |
| Phase 14-stock P02 | 141s | 1 tasks | 2 files |
| Phase 14-stock P03 | ~15 минут | 2 tasks | 3 files |
| Phase 14-stock P05 | 10 минут | 2 tasks | 4 files |
| Phase 14-stock P04 | 327s | 2 tasks | 7 files |
| Phase 14-stock P06 | 4 минуты | 2 tasks | 4 files |
| Phase 14-stock P07 | 559 | 3 tasks | 8 files |
| Phase 15-per-cluster-orders P01 | 5 минут | 2 tasks | 5 files |
| Phase 15-per-cluster-orders P02 | 8 минут | 2 tasks | 2 files |
| Phase 15-per-cluster-orders P03 | ~2.5 минуты | 2 tasks | 2 files |
| Phase 16-wb-stock-sizes P01 | 85s | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Init: Use Next.js 15.2.4 + Prisma 6 + Auth.js v5 (not v4) — version corrections from research
- Init: Photos stored at `/var/www/zoiten-uploads/` served by nginx (not inside project tree)
- Init: Marketplace articles in normalized table (not JSONB) — enables future API sync
- Init: Partial unique indexes on Barcode and MarketplaceArticle for soft-delete compatibility
- [Phase 01]: shadcn v4 uses base-nova style with @base-ui/react (not radix-ui) — form.tsx created manually
- [Phase 01]: zod@4.3.6 installed (not 3.x) and bcryptjs@3.0.3 (not 2.4.3) — newer compatible releases
- [Phase 01]: typedRoutes removed from next.config.ts — moved out of experimental in Next.js 15.5.x
- [Phase 01-foundation-auth]: Migration marked pending (no local PostgreSQL); will run on VPS during Phase 6 deploy
- [Phase 01-foundation-auth]: Barcode.value uses @unique for MVP; Phase 4 must convert to partial unique index for soft-delete compatibility
- [Phase 01-foundation-auth]: auth.config.ts has no Prisma/bcrypt imports — mandatory Edge runtime split for middleware.ts
- [Phase 01-foundation-auth]: Using string types in next-auth.d.ts instead of Prisma enums to avoid circular dependency
- [Phase 01-foundation-auth]: shadcn/ui v4 Button (base-ui) lacks asChild prop — use styled Link for button-as-link patterns throughout codebase
- [Phase 02]: Used explicit typed object instead of Record<string,unknown> for updateData in updateUser for Prisma type safety
- [Phase 02]: Single unified zod schema instead of two separate schemas — avoids TypeScript union type errors with react-hook-form generics
- [Phase 03-reference-data]: CreateResult type (ok: true; id: string) used for create actions to support CreatableCombobox — handleAuthError typed as { ok: false; error: string } | null for dual compatibility
- [Phase 03]: Used plain <button> (not Combobox.Item) for create affordance — avoids value conflicts and allows direct onClick handler without base-ui selection logic
- [Phase 03-reference-data]: base-ui data-selected:/data-open: variants used in Tabs/Accordion wrappers (not radix data-state=)
- [Phase 04]: Barcodes NOT copied on product duplicate — globally unique across all products
- [Phase 04]: UPLOAD_DIR env var controls photo storage path; /tmp/zoiten-uploads dev, /var/www/zoiten-uploads prod
- [Phase 04]: Dev file serving route /api/uploads/[...path] returns 404 in production — nginx handles /uploads/* directly
- [Phase 04-products-module]: zodResolver with .default() causes type mismatch in RHF 7.72 — use defaultValues instead
- [Phase 04-products-module]: Pass form as any to sub-components needing useFieldArray to avoid Control generic constraint errors
- [Phase 04-products-module]: NavLinks extracted as client component — keeps Sidebar as RSC for server-side section filtering
- [Phase 05-ui-module-stubs]: ComingSoon is a pure Server Component — no motion/client animation needed for placeholders
- [Phase 05-ui-module-stubs]: Support page uses bespoke layout with GitHub link instead of ComingSoon to convey integration context
- [Phase 05-ui-module-stubs]: motion@12.38.0 used as package name (not framer-motion); imported from 'motion/react'
- [Phase 05-ui-module-stubs]: Landing page is a Server Component assembling three client components — motion stays in leaf components
- [Phase 06]: systemd EnvironmentFile=/etc/zoiten.pro.env keeps secrets off command line and out of git
- [Phase 06]: nginx serves /uploads/ via alias (faster than proxy_pass for static files)
- [Phase 06]: deploy.sh uses prisma migrate deploy (not dev) — dev resets production data
- [Phase 06]: standalone build requires manual cp of public/ and .next/static/ after build
- [Phase 06-deployment]: DEPLOY.md is single source of truth for VPS deployment — no improvisation required
- [Phase 06-deployment]: SSL section deferred in DEPLOY.md until zoiten.pro DNS A record points to 85.198.97.89
- [Phase 07-prices-wb]: Phase 7 DB: pricing overrides как поля в Category/Subcategory/Product (не отдельная таблица) — COALESCE быстрее JOIN'а на 1000-10k товарах
- [Phase 07-prices-wb]: Phase 7 DB: AppSetting KeyValue (key PK TEXT, value TEXT) — генерическое хранилище глобальных ставок, seed 6 ключей через INSERT ON CONFLICT DO NOTHING
- [Phase 07-prices-wb]: Phase 7 DB: WbPromotion.id = Int (= promotionID из WB API), не cuid — прямое сопоставление без lookup
- [Phase 07-prices-wb]: [Phase 07-prices-wb]: vitest@4.1.4 с alias @ → корень проекта (flat root layout, нет src/)
- [Phase 07-prices-wb]: [Phase 07-prices-wb]: WB Promotions Calendar base URL = https://dp-calendar-api.wildberries.ru (origin s2sauth-calendar), НЕ discounts-prices-api
- [Phase 07-prices-wb]: [Phase 07-prices-wb]: Excel auto-акции парсится по индексам колонок (A=0, F=5, L=11, M=12, T=19, U=20), не по названиям — устойчиво к изменениям заголовков в кабинете WB
- [Phase 07-prices-wb]: [Phase 07-prices-wb]: Golden test nmId 800750522 → profit 567.68, ROI ~26%, Re продаж ~7% (из canonical Excel, зафиксированы в 07-WAVE0-NOTES.md §2)
- [Phase 07-prices-wb]: Pricing formulas извлечены напрямую из raw Excel cell formulas: acquiring/commission/credit/overhead/tax все от sellerPrice (I17*X%), не от priceAfterWallet
- [Phase 07-prices-wb]: COLUMN_ORDER = 30 элементов (без Фото — rowSpan); compile-time assertion через conditional type
- [Phase 07-prices-wb]: lib/pricing-math.ts — pure TypeScript module без импортов, используется одновременно в RSC (сервер) и realtime пересчёте (клиент)
- [Phase 07-prices-wb]: PROMO_API = https://dp-calendar-api.wildberries.ru (origin s2sauth-calendar), рейт-лимит 10 req/6sec обрабатывается через sleep(600ms) между запросами + sleep(6000ms) retry(1) на 429
- [Phase 07-prices-wb]: fetchPromotionNomenclatures silent return [] при 422 — auto-акции обрабатываются через Excel (D-06), не через API
- [Phase 07-prices-wb]: fetchAvgSalesSpeed7d в /api/wb-sync обёрнут в try/catch (degraded mode) — sync не падает, если Sales API недоступен, поле в БД остаётся null
- [Phase 07-prices-wb]: Zod схемы вынесены в lib/pricing-schemas.ts (не в app/actions/pricing.ts) — Next.js 15 'use server' файлы не экспортируют sync values, + vitest не может загружать auth chain
- [Phase 07-prices-wb]: Prisma Json поле snapshot передаётся как 'as never' — устоявшийся паттерн проекта (wb-promotions-sync/route.ts:75)
- [Phase 07-prices-wb]: parseAutoPromoExcel вынесен в lib/parse-auto-promo-excel.ts (pure TS) — route.ts тянет next/server, vitest падает на next-auth транзитивном импорте
- [Phase 07-prices-wb]: Excel auto-акций: реальные индексы колонок S=18 (planDiscount), T=19 (status) — 20 колонок 0..19; план 07-04 ошибочно указывал T=19/U=20 (off-by-one), исправлено в парсере и Wave 0 тесте
- [Phase 07-prices-wb]: shadcn tooltip создан вручную как @base-ui/react wrapper (не через CLI) — паттерн dialog.tsx, TooltipProvider встроен в Tooltip root для упрощения использования
- [Phase 07-prices-wb]: PricesTabs визуально идентичен CardsTabs (pathname.startsWith + border-primary) — единый паттерн табов для разделов с подсекциями маркетплейсов
- [Phase 07-prices-wb]: PriceCalculatorTable: COLUMN_ORDER разделён между sticky колонками (4 первых) и scroll-областью (26 остальных) — избегает дублирования заголовков
- [Phase 07-prices-wb]: PriceRow расширен 10 input-полями (sellerDiscountPct/wbDiscountPct/clubDiscountPct/walletPct/commFbwPct/drrPct/defectRatePct/costPrice/deliveryCostRub) — плану 07-08 не нужны дополнительные запросы
- [Phase 07-prices-wb]: base-ui TooltipTrigger использует render-prop для замены button на span (НЕ asChild как radix) — паттерн из components/ui/dialog.tsx
- [Phase 07-prices-wb]: GlobalRatesBar: debounced save через useRef<Partial<Record<key, timer>>> — отдельный таймер на поле, чтобы изменение одного не сбрасывало pending save другого
- [Phase 07-prices-wb]: Indicator strip (border-l-4 blue/purple/amber) рендерится на первой не-sticky ячейке (Статус цены), не на <tr> — чтобы не конфликтовать с sticky колонками
- [Phase 07-prices-wb]: PricingCalculatorDialog: z.number() + valueAsNumber вместо z.coerce.number() — zod 4.x + RHF 7.72 + zodResolver не совместимы с coerce (input unknown → output number)
- [Phase 07-prices-wb]: PriceRow расширен полями inputs (PricingInputs) и context (productId/subcategoryId/categoryId) — модалка работает без дополнительных DB-запросов, данные собираются RSC на сервере и передаются через props
- [Phase 07-prices-wb]: Realtime пересчёт через useWatch({name: [5 полей]}) + useMemo → calculatePricing — rerender только правой колонки outputs, левая колонка inputs не перерисовывается
- [Phase 07-prices-wb]: Scope checkboxes ДРР/Брак: checked=per-product (updateProductOverride), unchecked=subcategory/category default (updateSubcategoryDefault/updateCategoryDefault); Доставка всегда per-product по D-14
- [Phase 07-prices-wb]: Plan 07-10: Native <select> в Dialog для выбора auto-акции (CLAUDE.md convention, не base-ui Select)
- [Phase 07-prices-wb]: Plan 07-10: toast.loading/dismiss только для PromotionsSync (30-90 сек), Excel upload без loading toast
- [Phase 07-prices-wb]: Plan 07-11: tsconfig exclude vitest.config.ts + tests/** — Rule 3 fix при прод deploy (npm ci --omit=dev не ставит vitest, tsc type-check падал)
- [Phase 09-returns]: Два WB токена: WB_API_TOKEN (bit 5 Feedbacks) + WB_RETURNS_TOKEN (bit 11 Buyers Returns) — существующий scope не расширяем, архитектура supports two tokens через callApi(baseUrl, token, ...)
- [Phase 09-returns]: ReturnDecision = audit log (N decisions per ticket из-за reconsider) + денормализация актуального состояния в SupportTicket.returnState для быстрой фильтрации без JOIN
- [Phase 09-returns]: callWb рефакторен в callApi(baseUrl, token, path, init) без breaking changes — два wrapper'a (callWb для Feedbacks, callReturnsApi для Returns) делят одну 429-retry логику
- [Phase 09-returns]: Миграция 20260417_phase9_returns создана вручную (migration.sql) — локальной PG нет, применится через deploy.sh на VPS в Plan 09-04
- [Phase 09-returns]: Dual-mode $transaction mock (callback + array) решает проблему tx undefined — tx === prismaMock, все nested Prisma ops работают через тот же spy набор. Паттерн готов к переиспользованию в 09-04 actions.
- [Phase 09-returns]: Option A для cron — единый /api/cron/support-sync-reviews вызывает syncSupport + syncReturns (отдельный returns cron не создаётся). SUP-07 не упоминает returns cron, единый 15-мин tick достаточен.
- [Phase 09-returns]: Backward-compat response POST /api/support-sync: spread supportResult ПЕРВЫМ → новые поля (synced/support/returns/errors) после — флат поля feedbacksSynced/questionsSynced/mediaSaved для SupportSyncButton Phase 8 читаются без касаний клиента.
- [Phase 09-returns]: syncReturns update блок НЕ трогает returnState/status — защита от sync-race с локальными решениями менеджера. Unit-test 2 пинит контракт через expect(upsertCall.update).not.toHaveProperty.
- [Phase 09-returns]: Plan 09-03: MultiSelectDropdown извлечён в components/ui/ через copy-first — inline-копии в PricesFilters/SupportFilters/ProductFilters не трогаем (защита Phase 7/8 от регрессии, unified-refactor = отдельный Quick Task)
- [Phase 09-returns]: Plan 09-03: Record<K, V> вместо Map в props ReturnsTable — RSC → client boundary не сериализует Map, Object.fromEntries на сервере перед передачей
- [Phase 09-returns]: Plan 09-04: WB-first transaction order (PATCH → Decision+update) — если WB throws, Decision НЕ создаётся, returnState не меняется
- [Phase 09-returns]: Plan 09-04: action picker approve1 > autorefund1 > approvecc1 — автоматический выбор WB action, избегает хардкодов в UI
- [Phase 09-returns]: Plan 09-04: vi.resetAllMocks (не clearAllMocks) в beforeEach — очищает mockResolvedValueOnce queue, иначе queue переливается между тестами и съедает rejection mocks
- [Phase 11-templates-appeals]: Phase 11-01: WB Templates API отключён 2025-11-19 + WB Complaint API отключён 2025-12-08 — хранилище 100% локальное, hybrid manual workflow через jump-link в ЛК WB
- [Phase 11-templates-appeals]: Phase 11-01: ResponseTemplate @@unique([name, channel]) (не [name]) — одно имя допустимо в разных каналах; AppealRecord.reason: String (денормализованный label, не id) — устойчивость к изменениям справочника
- [Phase 11-templates-appeals]: Phase 11-02: Zod 4.x API z.enum([...], { message: "..." }) — errorMap из zod 3.x deprecated; план использовал устаревший синтаксис
- [Phase 11-templates-appeals]: Phase 11-02: ActionResultWith<T> вместо дженерика ActionResult<T=void> — Record<string, never> intersection не совместим с discriminated union
- [Phase 11-templates-appeals]: Phase 11-03: groupTemplatesForPicker pure helper экспортирован из TemplatePickerModal — unit тесты обходят vitest/React env issue без React/base-ui импортов
- [Phase 11-templates-appeals]: Phase 11-03: RSC prefetch шаблонов канала тикета → client picker через props (один round-trip вместо client server action)
- [Phase 11-templates-appeals]: Phase 11-03: TemplateForm nmId Zod transform (z.union.transform) вместо z.coerce.number — RHF 7.72 + zod 4.x + zodResolver несовместимы с coerce
- [Phase 10-chat-autoreply]: Phase 10-01: WB_CHAT_TOKEN scope bit 9 (3-й токен архитектура) + fallback на WB_API_TOKEN, паттерн Phase 9 getReturnsToken
- [Phase 10-chat-autoreply]: Phase 10-01: callApi isFormData branch — если body instanceof FormData, не ставим JSON Content-Type (fetch сам выставит multipart с boundary). Phase 8/9 regression защищён.
- [Phase 10-chat-autoreply]: Phase 10-01: AutoReplyConfig = Prisma singleton (id String @id = 'default'), seed через INSERT ON CONFLICT DO NOTHING в миграции
- [Phase 10-chat-autoreply]: Phase 10-01: SupportMessage.wbEventId @unique — идемпотентный cursor-based sync WB events (upsert ON CONFLICT на eventID из /api/v1/seller/events)
- [Phase 10-chat-autoreply]: Phase 10-02: AppSetting ключ 'support.chat.lastEventNext' (не новая таблица) — WB Chat events cursor хранится как string number в KV store Phase 7
- [Phase 10-chat-autoreply]: Phase 10-02: isWithinWorkingHours через toLocaleString({timeZone}) + getDay/getHours в локальной дате — ISO 8601 weekdays (jsDay===0 ? 7 : jsDay) для совместимости с workDays default [1..5]
- [Phase 10-chat-autoreply]: Phase 10-02: Партийное падение в POST /api/support-sync — try/catch per-phase чтобы WB 403 на Chat API (scope bit 9 pending) не ломал feedbacks/questions/returns 200
- [Phase 10-chat-autoreply]: Phase 10-02: Dedup 24h через findMany recent + JS some() — простой паттерн для десятков CHAT тикетов, не нужен raw SQL с DISTINCT ON
- [Phase 10-chat-autoreply]: WB-first transaction order в sendChatMessageAction — при падении WB БД остаётся консистентной (паттерн Phase 9)
- [Phase 10-chat-autoreply]: FormData (не POJO) в server action для File[] multipart upload через Next.js 'use server'
- [Phase 10-chat-autoreply]: Client + server validation дублируются: security требует серверную, UX — клиентскую
- [Phase 10]: Plan 10-04: AutoReplyConfig UI + saveAutoReplyConfig singleton upsert + systemd timer 5min для /api/cron/support-sync-chat — Phase 10 complete, awaiting-uat
- [Phase 12]: Phase 12-01: hybrid customer linking — CHAT auto через namespace chat:<chatID>, others manual через UI Plan 12-02
- [Phase 12]: Phase 12-01: pgcrypto gen_random_uuid() для idempotent backfill CHAT customers в миграции
- [Phase 12]: Phase 12-01: lib/customer-aggregations.ts — pure helpers без Prisma/Next зависимостей для Plan 12-02 RSC
- [Phase 12]: Phase 12-02: RSC page + lib/customer-aggregations pure helpers — agregation на JS без GROUP BY
- [Phase 12]: Phase 12-02: SupportTicketCard → client (useRouter.push с preventDefault/stopPropagation для inline-клика имени покупателя внутри outer Link)
- [Phase 12]: Phase 12-02: searchCustomers RBAC SUPPORT (не MANAGE) — read-only, VIEWER разрешён; debounce 300ms vs 500ms для save
- [Phase 12]: D-10: /support/new форма всегда создаёт нового Customer (customerId=null); picker existing отложен v1.2
- [Phase 12]: D-11: MergeCustomerDialog — 2-step state (search→confirm) с AlertTriangle warning, без nested AlertDialog
- [Phase 12]: D-12: MESSENGER тикет полностью скрывает ReplyPanel/ChatReplyPanel/ReturnActionsPanel, inline hint с messengerContact в <code>
- [Phase 13-statistics]: Phase 13-01: ManagerSupportStats денормализованная таблица (userId+period unique) + 2 composite индекса + lib/date-periods.ts (календарный Q D-05) + lib/support-stats.ts (6 helpers с  CTE avg response time)
- [Phase 13-statistics]: Phase 13-02: Next.js 15 запрещает произвольные экспорты из Page (parseStatsSearchParams не валидный export field) → helpers в app/(dashboard)/support/stats/search-params.ts
- [Phase 13-statistics]: Phase 13-02: parseStatsSearchParams per-field salvage (drop только невалидные поля из issues.path[0]) вместо full-fallback — tab=invalid+period=7d → period сохраняется
- [Phase 13-statistics]: Phase 13-02: StatsTabs + PeriodFilter URL-driven (useSearchParams + router.push), без локального client state — back/forward нативно, shareable URLs
- [Phase 14-stock]: Prisma миграция Phase 14 создана вручную (нет локальной PG) — pending для VPS deploy в Plan 14-07
- [Phase 14-stock]: Route rename /inventory→/stock: next.config.ts redirects() (308 permanent) + исправлены landing/dashboard компоненты (Rule 2)
- [Phase 14-stock]: Wave 0 curl smoke test НЕ выполнен в плане — Plans 14-01/02/04/05 независимы, Plan 14-03 заблокирован до подтверждения token scope
- [Phase ?]: Plan 14-03: использовать Statistics API вместо Analytics
- [Phase 14-stock]: Plan 14-02: Synthetic IDs 90001-90067 для WbWarehouse складов без верифицированных warehouseId — реальные ID подтянутся при sync в Plan 14-03 fetchStocksPerWarehouse
- [Phase 14-stock]: Plan 14-03: Statistics API вместо Analytics API (base token 403) + stableWarehouseIdFromName djb2 hash для pseudo-Int warehouseId (Statistics API не содержит числового ID)
- [Phase 14-stock]: vi.hoisted для vitest mock hoisting в stock-actions.test.ts — устраняет ReferenceError при vi.mock factory
- [Phase 14-stock]: TurnoverNormInput использует controlled input + useRef debounce — паттерн GlobalRatesBar
- [Phase 14-stock]: Plan 14-04: Synthetic fixture + fuzzy header matching вместо hardcoded column indexes — парсер устойчив к разным форматам файлов Иваново
- [Phase 14-stock]: Plan 14-04: upsertIvanovoStock принимает {sku, quantity}[] (не productId) — идемпотентно, соответствует preview API
- [Phase 14-stock]: Агрегация wbTotalStock/rfTotalStock на JS после батч WbCard.findMany — проще чем GROUP BY SQL, достаточно для 100-500 товаров
- [Phase 14-stock]: Inline production input: нативный <input> вместо shadcn Input — экономия места в ячейке таблицы (14-UI-SPEC §4)
- [Phase 14-stock]: ClusterTooltip: render-prop (render={<span />}) вместо asChild — base-ui паттерн из PromoTooltip.tsx
- [Phase 14-stock]: Plan 14-07: nginx redirect /inventory не нужен — Next.js 308 через next.config.ts достаточен
- [Phase 15-per-cluster-orders]: fetchAvgSalesSpeed7d сохранена без изменений — backward compat, новый код использует fetchOrdersPerWarehouse
- [Phase 15-per-cluster-orders]: avg в OrdersWarehouseStats = count / periodDays (не / 7 hardcoded) — поддерживает произвольный periodDays
- [Phase 15-per-cluster-orders]: fetchAvgSalesSpeed7d заменён на fetchOrdersPerWarehouse — один запрос к Orders API покрывает card-level avg/yesterday и per-warehouse breakdown (rate limit ~1 req/min)
- [Phase 15-per-cluster-orders]: Expanded per-warehouse показывает ordersPerDay (v1 spec); quantity виден через title tooltip
- [Phase 15-per-cluster-orders]: allWarehouseIds = union(stocks, orders) — склад только в orders тоже попадает в кластерные колонки
- [Phase 16-wb-stock-sizes]: Plan 16-01: techSize именован как в WB API (не size), DELETE legacy rows для clean re-sync, миграция применяется ТОЛЬКО на VPS через bash deploy.sh в Plan 16-06

### Roadmap Evolution

- Phase 7 added: Управление ценами WB — калькулятор юнит-экономики с акциями и расчётными ценами (directory renamed to `07-prices-wb` for clarity)
- Milestone v1.1 added (2026-04-17): +40 requirements (SUP-01..SUP-40), +6 phases (Phase 8..13) — Служба поддержки WB (отзывы/вопросы → возвраты → чат → шаблоны/обжалование → профиль/мессенджеры → статистика)
- Milestone v1.2 added (2026-04-21): +29 requirements (STOCK-01..STOCK-29), +1 phase (Phase 14 = 7 plans) — Управление остатками (schema + WB per-warehouse + Excel Иваново + Производство + /stock + /stock/wb с кластерами)
- Phase 15 added (2026-04-22): Per-warehouse и per-cluster скорость заказов для /stock/wb — расширение Phase 14: Orders API per-warehouse + WbCardWarehouseOrders таблица + реальные З/Об/Д per-кластер вместо единого avgSalesSpeed7d
- Phase 16 added (2026-04-22): Размерная разбивка остатков WB в /stock/wb + фикс sync bug — расширение схемы WbCardWarehouseStock с techSize, кнопка «По размерам» в UI с per-size строками, расследование расхождения API vs БД (например nmId 859398279 «Брюки» Котовск API ~70 шт vs БД 8)

### Pending Todos

None yet.

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260408-syb | Создать модуль Сотрудники — БД, CRUD, таблица, фильтры, модалка | 2026-04-08 | efb9ca8 |  | [260408-syb-crud](./quick/260408-syb-crud/) |
| 260410-leh | Починить ширину колонок в /prices/wb и собрать GlobalRatesBar слева | 2026-04-10 | 142c62d |  | [260410-leh-wb-globalratesbar](./quick/260410-leh-wb-globalratesbar/) |
| 260410-mya | Резайз/wrap/персистентность столбцов /prices/wb + округление денег + фикс sticky прозрачности | 2026-04-10 | fc270d0 |  | [260410-mya-wrap-prices-wb-sticky](./quick/260410-mya-wrap-prices-wb-sticky/) |
| fast-260417 | Фикс support-sync: NEW→ANSWERED на повторной синхронизации (feedback/question) | 2026-04-17 | 13826b1 |  | inline |
| fast-260419 | View Transitions fade при переключении dark/light темы | 2026-04-19 | 081299d |  | inline |
| fix-260419-promo | WB promotions: fallback nmID/nmId/id при createMany | 2026-04-19 | d85298c |  | inline |
| fix-260419-pagi | Пагинация /products и /batches: сброс на page 1 + pageSize селектор | 2026-04-19 | 544ccdb |  | inline |
| 260420-oxd | /support/returns: ffmpeg thumbnail для VIDEO + sharp для IMAGE + WB CDN tm/ + width/height/decoding | 2026-04-20 | eceae9e |  | [260420-oxd-support-returns-ffmpeg-thumbnail-wb-cdn-](./quick/260420-oxd-support-returns-ffmpeg-thumbnail-wb-cdn-/) |
| 260421-iq7 | Товары: drag-and-drop порядок артикулов + barcodes → MarketplaceArticle + unique per marketplace | 2026-04-21 | 96fb4c7 | Verified | [260421-iq7-drag-and-drop-per](./quick/260421-iq7-drag-and-drop-per/) |
| 260422-oy5 | Per-user фильтр складов в /stock/wb (чекбоксы по кластерам, persist в БД) | 2026-04-22 | 5caf963 |  | [260422-oy5-per-user-stock-wb](./quick/260422-oy5-per-user-stock-wb/) |

### Blockers/Concerns

- Phase 6: Existing nginx config on VPS is unknown — run `nginx -T` before editing
- Phase 1: Auth.js v5 TypeScript session augmentation syntax differs from v4 — verify before writing RBAC checks
- Phase 5: ai-cs-zoiten repo has unknown API surface — may need discovery spike before integration
- Phase 7: UAT pending (10 HUMAN-UAT пунктов) — отложен по решению пользователя, вернуться после v1.1
- Phase 8: Нужен доступ к WB Feedbacks/Questions API — scope токена проверить (bit 5 Отзывы уже есть в WB_API_TOKEN)
- Phase 10: WB Chat API может блокироваться Node.js fetch() по TLS fingerprint — заготовить curl-fallback реактивно как в wb-api.ts v4
- Phase 14: WB Stocks API sunset 2026-06-23 — Wave 0 (Plan 14-01) curl smoke test нового endpoint `/api/analytics/v1/stocks-report/wb-warehouses` с текущим WB_API_TOKEN (scope Аналитика + Personal/Service token); при 401/403 — регенерация токена до coding
- Phase 14: WbWarehouse seed — нет официального API, список складов собирается вручную через DevTools Network tab на seller.wildberries.ru (Plan 14-02 Zero Wave с user-validation cluster names)
- Phase 14: Excel Иваново fixture — Plan 14-04 Zero Wave требует real sample файл от пользователя для golden test

## Session Continuity

Last session: 2026-04-28T10:54:36.156Z
Stopped at: Completed 16-01-PLAN.md
Resume file: None
