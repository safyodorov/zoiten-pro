---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Служба поддержки WB
status: ready_to_plan
stopped_at: Completed 28-cashflow-28-03-PLAN.md
last_updated: "2026-07-05T20:01:54.870Z"
progress:
  total_phases: 6
  completed_phases: 7
  total_plans: 22
  completed_plans: 22
  percent: 117
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-21)

**Core value:** Единая база товаров компании, от которой зависят все остальные процессы ERP
**Current focus:** Phase 28 — ПДДС — план движения денежных средств (/finance/cashflow)

## Current Position

Phase: 28 — ПДДС (/finance/cashflow) — ✅ ЗАВЕРШЕНА И ЗАДЕПЛОЕНА 2026-07-06 (prod HEAD bd14cf2)
- 3 плана исполнены, verification passed 21/21; код-ревью 18/18 находок закрыто (2 волны фиксов, вкл. critical CR-01 — двойной счёт первого дня в факт-линии); auth-смок /finance/cashflow = 200, journalctl чист; сид AppSetting finance.cashflow.* применён (payout 55% / лаг 1 нед / опекс 0 / порог 0).
- Эмпирика: выплаты WB приходят от ООО «РВБ» по понедельникам с лагом ~1 нед; net-to-bank ≈ 55% от выкупов (forPay 66% − реклама ~12%) — первое приближение, v2 = per-товар из юнит-экономики (движок принимает PayoutFn(date, buyoutsRub, byProduct?)).
- Ограничение v1 (в методологии): выплаты за довгоризонтные (июньские) выкупы не моделируются → притоки первых ~2 недель занижены, ранний «разрыв» может быть ложным.

Ожидает пользователя: UAT /finance/cashflow + ввести реальный опекс ₽/мес в панели допущений (сейчас 0 — зарплаты/аренда не учитываются в оттоках).
Next: по итогам UAT — хотфиксы; затем Phase 29 (кандидаты: ОПиУ — третий финансовый отчёт; либо per-товар payout v2 для ПДДС).

## Performance Metrics

**Velocity:**

- Total plans completed: 33
- Average duration: -
- Total execution time: -

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 28 | 3 | - | - |

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
| Phase 16-wb-stock-sizes P05 | 4min | 3 tasks | 1 files |
| Phase 16-wb-stock-sizes P06 | 4min | 1 tasks | 2 files |
| Phase 21-credits P01 | 99s | 2 tasks | 2 files |
| Phase 21-credits P02 | 60s | 2 tasks | 3 files |
| Phase 21-credits P03 | 240 | 2 tasks | 4 files |
| Phase 21-credits P06 | 8 minutes | 3 tasks | 4 files |
| Phase 21-credits P05 | 256s | 3 tasks | 6 files |
| Phase 21-credits P07 | 288s | 3 tasks | 4 files |
| Phase 20-procurement P00 | 4min | 3 tasks | 3 files |
| Phase 20 P01 | 4min | 2 tasks | 2 files |
| Phase 20-procurement P02 | 1 min | 2 tasks | 5 files |
| Phase 20-procurement P03 | 1 min | 1 tasks | 1 files |
| Phase 20-procurement P04 | 2min | 2 tasks | 4 files |
| Phase 20 P05 | 8min | 3 tasks | 12 files |
| Phase 20-procurement P06 | 6min | 3 tasks | 8 files |
| Phase 22-bank-accounts P01 | 167s | 2 tasks | 2 files |
| Phase 22-bank-accounts P02 | 3min | 2 tasks | 5 files |
| Phase 22-bank-accounts P03 | 330 | 2 tasks | 8 files |
| Phase 22-bank-accounts P04 | 202s | 2 tasks | 4 files |
| Phase 22-bank-accounts P05 | 18min | 4 tasks | 5 files |
| Phase 23-cash-payments P01 | 5min | 2 tasks | 2 files |
| Phase 23-cash-payments P02 | 79s | 2 tasks | 5 files |
| Phase 23-cash-payments P03 | 10m | 2 tasks | 9 files |
| Phase 23 P04 | 20m | 3 tasks | 6 files |
| Phase 24-finance-balance P01 | 10min | 3 tasks | 11 files |
| Phase 25-v2-h2-2026 P01 | 25 | 2 tasks | 4 files |
| Phase 28-cashflow P28-01 | 324s | 3 tasks | 5 files |
| Phase 28 P28-02 | 364s | 3 tasks | 4 files |
| Phase 28 P28-03 | 402s | 3 tasks | 6 files |

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
- [Phase 16-wb-stock-sizes]: Plan 16-05 — B5 split-pattern: структурное JSX изменение (Fragment wrap + rowSpan) и render в отдельных task'ах через TODO-маркер; балансировка скобок изолируется per task
- [Phase 16-wb-stock-sizes]: Plan 16-05 — Размерная row column-структура идентична per-nmId (О/З/Об/Д per cluster + per-warehouse expanded), но З/Об/Д = null = «—» (per-size orders не доступны в БД, deferred до v2)
- [Phase 16-wb-stock-sizes]: Plan 16-05 — React.Fragment key переехал с TableRow на Fragment (требование React: key на корневом элементе map callback'а после wrap)
- [Phase 16-wb-stock-sizes]: Plan 16-05 — hideSc / hiddenWarehouseIds применяются к visibleClusterWarehouses в expanded view размерной row — visual filter only, идентично per-nmId
- [Phase 16-wb-stock-sizes]: Plan 16-06 — Pre-UAT автоматизирован: deploy + re-sync + diagnostic выполнены агентом ДО checkpoint. Diagnostic full-set (87 nmId, 2237 пар) → diff=0, sync bug Phase 16-02 эмпирически устранён в проде.
- [Phase 21-credits]: Lender (не Bank): справочник кредиторов U-03 — JetLend краудлендинг, не банк; везде Lender/lenderId
- [Phase 21-credits]: D-09: статус кредита computed из LoanPayment records, не хранится полем в БД
- [Phase 21-credits]: D-19: Decimal(14,2) для денег, Decimal(6,3) для годовой ставки процента (28.000)
- [Phase 21-credits]: Landmark icon for Credits sidebar entry; position after SALES (/sales-plan)
- [Phase 21-credits]: ISO 8601 week algorithm через «четверг текущей недели» — year/week по году четверга
- [Phase 21-credits]: prisma generate required after Plan 21-01 (schema added models but client not regenerated)
- [Phase 21-credits]: Plan 06: LoanBalanceChart adds optional starting point (amount) for full balance curve context
- [Phase 21-credits]: LoanModal: zodResolver as any (zod 4.x + RHF 7.72 compat, same as PricingCalculatorDialog)
- [Phase 21-credits]: Левый sticky-блок без rowSpan — 2 строки на кредит (Тело с инфо + % с плейсхолдерами) согласно CLAUDE.md mixed-rowSpan pattern
- [Phase 21-credits]: generateBucketSequence итерация по cursor с шагом день/неделю/месяц с дедупликацией через Set — правильный охват крайних бакетов
- [Phase 20-procurement]: Plan 20-00: D-02 isPrimary pinned via PURE helper @/lib/supplier-primary (resolvePrimaryWrites) — server action pulls next-auth, vitest can't load it; 20-05 must extract enforcement
- [Phase 20-procurement]: Plan 20-00: fetchCbrRates mocked via vi.stubGlobal('fetch') — CBR uses plain Node fetch (no TLS workaround unlike WB v4)
- [Phase 20]: Plan 20-01: 6th enum PaymentType (DEPOSIT|BALANCE) created for PurchasePayment.type (plan correction over reusing SupplierContactType)
- [Phase 20]: Plan 20-01: ERP_SECTION untouched (PROCUREMENT already exists, no ALTER); business uniqueness (isPrimary/participant/OTHER-custom) enforced in server actions not DB
- [Phase 20]: Plan 20-01: Purchase.supplierId + PurchaseItem.productId ON DELETE RESTRICT (protect history); SupplierProductLink.productId SET NULL; partial unique WHERE productId IS NOT NULL
- [Phase 20-procurement]: Plan 20-02: /procurement guarded via single SECTION_PATHS prefix entry; temp /purchase-plan renamed «План закупок (временный)», not deleted (kept as separate nav item until data migration)
- [Phase 20-procurement]: Plan 20-03: lib/procurement-math.ts — pure import-free helper (D-08 deposit+3d / balance+leadTime / percent↔amount Math.round(n*100)/100 / Σ quantity×unitPrice), client+server SoT for createPurchase + modal; bodies verbatim from RESEARCH Pattern 6
- [Phase 20-procurement]: Plan 20-04: lib/cbr-rates.ts plain Node fetch (no curl — CBR has no TLS-fingerprint block unlike WB v4); getLatestRate returns Prisma.Decimal; dispatcher cbr branch dynamic-imports ../../cbr-rate-sync/route (route at app/api, not app/api/cron); 12:00 MSK forward-only, idempotent upsert via @@unique[date,code]
- [Phase 20-procurement]: Plan 20-05: isPrimary enforcement extracted to pure lib/supplier-primary.ts (resolvePrimaryWrites, last-wins) — vitest cannot load server action next-auth chain; createSupplier runs it after create, updateSupplier before upsert
- [Phase 20-procurement]: Plan 20-05: supplier cascading filters named SupplierFilters (not ProcurementFilters) — name collision with existing /purchase-plan do-not-touch MVP; contacts/links/negotiations edited on detail-page tabs, SupplierModal handles only base fields
- [Phase 20-procurement]: Plan 20-06: createPurchase auto-generates exactly one DEPOSIT(ordinal 1)+one BALANCE(ordinal 1) in one $transaction via procurement-math; payment params resolved from selected items' SupplierProductLink (fallback 30/70/45)
- [Phase 20-procurement]: Plan 20-06: procurement-math is single source of payment math — same recompute fns server (createPurchase/savePurchasePayments) + client (PurchasePaymentsCard live percent↔amount); OVERDUE computed live at read time, never cached; PLANNED-only hard delete (D-21); no Supplier mutation
- [Phase 20-procurement]: Plan 20-06: PurchaseModal owns shared types (SupplierOption/ProductOption/ProductLinkMap/PurchaseForModal) imported by page+table+detail-actions; productLinkMap computed RSC (Decimal→number) passed to client for unitPrice prefill; PurchaseDetailActions client wrapper keeps detail page RSC
- [Phase 22-bank-accounts]: Decimal(18,2) for BankTransaction.amount; fingerprint @unique for idempotent re-import; Company.inn nullable @unique; Lender.bankId nullable FK with SetNull; BankTransaction.accountId CASCADE, counterpartyId/importBatchId SET NULL
- [Phase 22-bank-accounts]: Building2 icon for BANK section (Landmark taken by CREDITS)
- [Phase 22-bank-accounts]: BANK stub page minimal — full table deferred to 22-05; UserSectionRole provisioning deferred to 22-05 after deploy
- [Phase 22-bank-accounts]: VTB header-driven: buildHeaderMap(row[6]) — not positional — handles 10-col RUB and 12-col CNY sheets
- [Phase 22-bank-accounts]: Fingerprint = sha256(accountNumber|date|direction|amount|docNumber|counterpartyInn|normalizePurpose(purpose)) — no row position index
- [Phase 22-bank-accounts]: OWNING_BANK constant with real BICs (vtb 044525411 / psb 044525555 / sber 044525225) determines owning bank deterministically; counterparty banks upserted separately by their own BIC
- [Phase 22-bank-accounts]: persist.ts has zero next-auth/next/* imports — usable from seed script 22-05 with its own PrismaClient instance
- [Phase 22-bank-accounts]: BankTxRow: flat serializable object (Decimal->number, Date->ISO string on server) — RSC client boundary
- [Phase 22-bank-accounts]: CategoryCell rollback: prev value saved before optimistic update, restored on !result.ok
- [Phase 22]: Bank dashboard anchor = MAX(balanceDate) with fallback to MAX(tx.date); CNY flows ignored for v1
- [Phase 23-cash-payments]: CashDirection отдельный enum (INCOME/EXPENSE), не переиспользование TxDirection — семантика кассы отличается от банка
- [Phase 23-cash-payments]: fingerprint String? @unique (nullable) — ручные записи без дедупа; импортированные SHA-256 по (sheet|date|direction|amount|purpose|responsibleNameRaw)
- [Phase 23-cash-payments]: Decimal(14,2) для CashEntry.amount (паттерн Credits Phase 21) — рубли, 14 знаков достаточно; не 18,2 как BankTransaction
- [Phase 23-cash-payments]: Wallet icon chosen for CASH sidebar entry (Landmark=Credits, Building2=Bank)
- [Phase 23-cash-payments]: categorize() match-order independent of display sortOrder: Пополнение кассы before Зарплата/авансы prevents avanс-shadow on 'аванс на склад'
- [Phase 23-cash-payments]: normalizeResponsibleSurname: ё→е ONLY for SURNAME_FIXES lookup key, return value preserves ё; persist.ts uses (prisma as any) cast for vitest-safe type-only import
- [Phase 23]: base-ui Dialog uses render= prop (not asChild) — DialogTrigger pattern in CashEntryForm
- [Phase 23]: CashTable totals + truncation indicator rendered above sticky scroll container as separate block
- [Phase 24-finance-balance]: SECTION_PATHS key /finance/ trailing slash — не ломает публичный /finance-models
- [Phase 24-finance-balance]: Plan 24-01 выполнен и закоммичен в изолированный git worktree (branch phase-24-finance) — main НЕ трогался, параллельная разработка пользователя не задета

### Roadmap Evolution

- Phase 7 added: Управление ценами WB — калькулятор юнит-экономики с акциями и расчётными ценами (directory renamed to `07-prices-wb` for clarity)
- Milestone v1.1 added (2026-04-17): +40 requirements (SUP-01..SUP-40), +6 phases (Phase 8..13) — Служба поддержки WB (отзывы/вопросы → возвраты → чат → шаблоны/обжалование → профиль/мессенджеры → статистика)
- Milestone v1.2 added (2026-04-21): +29 requirements (STOCK-01..STOCK-29), +1 phase (Phase 14 = 7 plans) — Управление остатками (schema + WB per-warehouse + Excel Иваново + Производство + /stock + /stock/wb с кластерами)
- Phase 15 added (2026-04-22): Per-warehouse и per-cluster скорость заказов для /stock/wb — расширение Phase 14: Orders API per-warehouse + WbCardWarehouseOrders таблица + реальные З/Об/Д per-кластер вместо единого avgSalesSpeed7d
- Phase 16 added (2026-04-22): Размерная разбивка остатков WB в /stock/wb + фикс sync bug — расширение схемы WbCardWarehouseStock с techSize, кнопка «По размерам» в UI с per-size строками, расследование расхождения API vs БД (например nmId 859398279 «Брюки» Котовск API ~70 шт vs БД 8)
- Phase 19 added (2026-05-19): Управление рекламой WB — собственная БД рекламных расходов (WbAdvertCampaign, WbAdvertTarget, WbAdvertStatDaily, WbAdvertBalanceSnapshot), отдельный WB_ADS_TOKEN, daily cron в 3:00 МСК, view-only UI /ads/wb с per-product таблицей + expandable charts + каскадные фильтры. Контекст: .planning/research/ads-sheets/FINDINGS.md
- Phase 20 added (2026-05-20): Управление закупками — Поставщики (БД с контактами/переговорами/per-product параметрами), Закупки (статусы планируемые/текущие/завершённые, multi-payment депозит/баланс с курсами ЦБ РФ), План закупок (детали TBD). Контекст: .planning/phases/20-procurement/20-CONTEXT.md. Планирование запущено 2026-05-20 параллельно с активной Phase 19 (реклама), реализация после Phase 19.
- Phase 21 added (2026-06-08): Кредиты — визуализация и учёт кредитов компании. Новая БД Loan + LoanPayment (орг / банк / № КД / сумма / ставка % / срок / дата выдачи / график тело+проценты). UI: список кредитов → детальная карточка с графиком → сводный горизонтальный график выплат с разбивкой день/неделя/месяц. Источник данных: Кредиты.xlsx (Лист1 дневной график тела долга + балансы; Лист2 метаданные + помесячные основной долг+проценты). Добавлена как Phase 21 вручную (gsd-tools насчитал 1000 из-за backlog 999.1).
- Phase 22 added (2026-06-10): Банковские счета — БД банковских операций по всем компаниям группы. Новая БД BankAccount + BankTransaction + справочники Bank (по БИК) + Counterparty (дедуп по ИНН), расширение Company реквизитами (ИНН/КПП/ОГРН) + nullable FK Lender→Bank. Импорт выписок из Excel с 3 адаптерами форматов (ВТБ multi-sheet/мультивалюта, ПСБ, СберБизнес) + защита от дублирования при пересечении периодов (composite fingerprint). Read-only просмотр + базовая категоризация под будущий ДДС. Новый ERP_SECTION.BANK. Scope этапа 1: БД+импорт+дедуп+просмотр, БЕЗ связей с закупками/кредитами/ДДС. Источник: папка Выписки/ (9 XLSX за 01.01–10.06.2026). Контекст: .planning/phases/22-bank-accounts/22-CONTEXT.md. Добавлена вручную как 22 (gsd-tools насчитал 14 из-за stale milestone-парсинга ROADMAP). ВЫПОЛНЕНА+развёрнута 2026-06-10 (1910 операций, дашборд с остатками, слияние компаний по ИНН).
- Phase 23 added (2026-06-10): Наличные расчёты — касса группы из Офис Бюджет.xlsx (Юля+Павел) за 2024-2026. CashEntry + CashCategory (≈24, авто-разнесение по ключевым словам) + CashDirection(INCOME/EXPENSE); ответственный→Employee (пусто→Иванова); приход+расход (баланс); удобная форма ручного ввода. Раздел ведёт Иванова Юлия (MANAGE). ERP_SECTION.CASH. Контекст: .planning/phases/23-cash-payments/23-CONTEXT.md. Добавлена вручную как 23 (gsd-tools насчитал 14).
- Phase 24 added (2026-07-02): Финансовая отчётность: Баланс (управленческий учёт) — первый из трёх отчётов (Баланс → ОДДС → ОПиУ). Баланс на 01.07.2026 и далее на каждую дату: активы (деньги банк+касса, дебиторка WB через API — исследовать, товарные остатки WB/в пути/Иваново, предоплаты поставщикам), пассивы (кредиты, отложенные налоговые обязательства расчётно 7% НДС + 1% налог на доходы с корректировкой по бухгалтерии). ОДДС и ОПиУ — последующие фазы. Добавлена вручную как 24 (gsd-tools снова насчитал 14). Закоммичено 2026-07-03 — параллельная разработка на паузе (указание пользователя).
- Phase 25 added (2026-07-04): План продаж v2 — рабочий план H2-2026. Переделка одноразового симулятора /sales-plan в рабочий план продаж 01.07–31.12.2026: три ряда (наш план / наш факт / план по ИУ = 2 380 805 ₽/день, итог 438 068 120 ₽), помесячные уровни с детализацией в день, приходы из Китая по партиям, виртуальные закупки (учитываются только в плане — генератор «пора заказывать» + opt-out), версионирование/фиксация, план/факт за неделю/месяц/квартал/полугодие/горизонт, контракт lib/sales-plan/pdds-feed.ts под следующую фазу ПДДС. Новые модели: SalesPlanMonthLevel, SalesPlanDayOverride, VirtualPurchase, SalesPlanVersion/Day, Purchase.plannedArrivalDate. Секция остаётся SALES. Дизайн — ресёч-воркфлоу (11 агентов, адверсариальная критика 13 дыр → ремонт): .planning/phases/25-v2-h2-2026/25-RESEARCH.md + CRITIC-VERDICT.md. 4 решения пользователя зафиксированы (метрика ИУ=выкупы, кабинет WB_API_TOKEN, итог=горизонт H2, даты приходов createdAt+45 fallback). План внедрения — 6 деплоябельных под-этапов (§9). Добавлена через gsd-sdk phase.add (v1.41.1) как 25. Следующий шаг: /gsd-plan-phase 25.
- Phase 25 DONE + UAT approved (2026-07-05): 10/10 планов развёрнуто. Два follow-up фикса факта: (1) quick 260705-f1p — источник факта по ДАТЕ РЕАЛИЗАЦИИ (WbSalesDaily из WB Statistics Sales API) вместо когортной воронки (фикс «1,8М вместо 3,3–3,9М/день»); (2) fast-260705 — факт = НЕТТО (выкупы − возвраты) = кабинетный «Фактический оборот». Prod HEAD dc387ea.
- Phase 26 added (2026-07-05): План продаж — рабочая правка уровней. По итогам UAT-обсуждения с пользователем: (A) автопротяжка месячного уровня вперёд (галка «распространить дальше», записывает только в месяцы без собственного ручного уровня) + сброс ручных→авто поштучно и массово; (B) явное предупреждение в матрице, когда целевой уровень срезан/обнулён из-за стока/поздних приходов (причина + дата ближайшего прихода); (C) динамический roll-forward виртуальных отгрузок — ACCEPTED и SUGGESTED с orderDate<today сдвигаются вперёд + ежедневный крон-пересчёт, чтобы план сам отражал «нет товара — нет продаж». Расширение /sales-plan под ручную рабочую модель. Добавлена вручную как 26.

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
| 260512-gvy | support-sync: lock WB /questions + /feedbacks при 429>60s через AppSetting('wb{Questions,Feedbacks}LockedUntil') | 2026-05-12 | 4a50d97 | Verified | [260512-gvy-support-sync-respect-x-ratelimit-retry-o](./quick/260512-gvy-support-sync-respect-x-ratelimit-retry-o/) |
| 260512-jxh | WB API токены — настройки CRUD: model WbApiToken в БД, JWT decoder, validation (decode→scope→probe), cache TTL 5s, UI tab в /admin/settings для superadmin (+ fix iat optional / oid coerce) | 2026-05-12 | 5eb9e18 | Verified | [260512-jxh-wb-api-crud-api-ssh](./quick/260512-jxh-wb-api-crud-api-ssh/) |
| 260513-dlr | support-sync/cooldown lock buffer: lock_unlock_at = now + max(retry, 900s cron interval) + 120s — фикс бесконечной петли 429, где WB retry=720s < cron 900s | 2026-05-13 | 526be35 |  | [260513-dlr-support-sync-lock-buffer-to-outlive-cron](./quick/260513-dlr-support-sync-lock-buffer-to-outlive-cron/) |
| 260513-khv | Per-endpoint cooldown locks: refactor wbCooldownUntil → 9 per-bucket keys (statistics-stocks/orders/sales, prices, tariffs, analytics, content, feedbacks, questions) + lazy migration legacy key — ban Statistics не блокирует Prices/Cards/Tariffs | 2026-05-13 | e56156b |  | [260513-khv-per-endpoint-cooldown-locks-refactor-wbc](./quick/260513-khv-per-endpoint-cooldown-locks-refactor-wbc/) |
| 260513-phu | UX в data-таблицах: shared `useResizableColumns` hook (DB persist) для /prices/wb + /stock + /stock/wb + always-on Tooltip с полным title + click-to-copy артикул + brand-line под product name в /prices/wb | 2026-05-13 | 7d9b1db |  | [260513-phu-ux-data-resizable-columns-persist-stock-](./quick/260513-phu-ux-data-resizable-columns-persist-stock-/) |
| 260514-kzg | /stock/wb «По размерам»: backfill всех размеров из WbCard.techSizes (не только тех у кого есть stocks/orders) + красная подсветка выпавших размеров (stockQty===0) | 2026-05-14 | ac7b75a |  | [260514-kzg-stock-wb-wb](./quick/260514-kzg-stock-wb-wb/) |
| 260514-mci | /cards/wb улучшения: рейтинг карточки + рейтинг склейки (sync через Feedbacks API), фильтр по Ярлыку, sort по Остатку | 2026-05-15 | 7b40673 |  | [260514-mci-cards-wb](./quick/260514-mci-cards-wb/) |
| 260515-jq6 | /cards/wb UX: sticky header + name tooltip + click-to-copy артикул | 2026-05-15 | 9d32acf |  | [260515-jq6-cards-wb-ux-sticky-header-name-tooltip-c](./quick/260515-jq6-cards-wb-ux-sticky-header-name-tooltip-c/) |
| 260515-kes | Soft-delete WbCard + 30-day grace при пропаже из WB Content API (safety guard 50%) |  |  |  | [260515-kes-soft-delete-wbcard-30-day-grace-wb-conte](./quick/260515-kes-soft-delete-wbcard-30-day-grace-wb-conte/) |
| 260515-m5o | /cards/wb expandable row: bar chart заказов за 28 дней + средние 7д/30д; WbCardOrdersDaily + daily cron 05:00 МСК + backfill с 2026-04-01 | 2026-05-15 | 90c86a5 | Needs Review | [260515-m5o-cards-wb-expandable-row-4-7-wbcardorders](./quick/260515-m5o-cards-wb-expandable-row-4-7-wbcardorders/) |
| 260515-o4o | /cards/wb expand v2: ComposedChart bar+line, sellerPrice/buyerPrice в WbCardOrdersDaily, retroactive backfill, dispatcher cron 05:00+05:10 МСК (настраиваемый), Settings таб «Расписание», dark-aware orange/cyan palette | 2026-05-15 | 63dc576 | Needs Review | [260515-o4o-cards-wb-expand-v2-2x-narrower-design-po](./quick/260515-o4o-cards-wb-expand-v2-2x-narrower-design-po/) |
| 260515-phv | /cards/wb fix: реальные исторические цены через Statistics Orders priceWithDisc+finishedPrice (avg per nmId/date) + forward-fill на дни без заказов (plateau вместо gap) + dual-gate /api/wb-orders-backfill + cleanup retroactive button/endpoint/helper | 2026-05-15 | 6e25b4a | Needs Review | [260515-phv-cards-wb-fix-real-historical-prices-via-](./quick/260515-phv-cards-wb-fix-real-historical-prices-via-/) |
| 260518-fg5 | /prices/wb expandable row с графиками заказов per-nmId (как в /cards/wb): клик по Сводке раскрывает панель с WbCardOrdersChart per артикул, фильтр nmId по stock>0 OR sales>0 за 28д, переиспользование chart-компонента из /cards/wb | 2026-05-18 | db4128c |  | [260518-fg5-prices-wb-expandable-row-cards-wb-per-nm](./quick/260518-fg5-prices-wb-expandable-row-cards-wb-per-nm/) |
| 260518-gg3 | Доработки графиков: single-expand /prices/wb (string\|null toggle); chart polish — dot.r=1.5, header «арт.» вместо «nm», ru-RU тысячи в tooltip и «Цена сейчас»; per-nmId легенда в expand-панели — Остаток/Дни/Рейтинг связки/Кол-во оценок + горизонтальная лента 10 последних FEEDBACK-тикетов (звёзды + цветовая шкала + hover tooltip с текстом) | 2026-05-18 | 760085a |  | [260518-gg3-cards-wb-prices-wb-1-single-expand-price](./quick/260518-gg3-cards-wb-prices-wb-1-single-expand-price/) |
| 260518-h6p | Лента отзывов в expand-панели /prices/wb — две строки per nmId: «По связке (imtId)» сверху + «По товару (nmId)» снизу; топ-10 в каждой; пустые строки скрываются; один SupportTicket.findMany по объединённому nmId списку всех связок | 2026-05-18 | b250b8f |  | [260518-h6p-prices-wb-expand-per-nmid-imtid-nmid-nmi](./quick/260518-h6p-prices-wb-expand-per-nmid-imtid-nmid-nmi/) |
| 260518-hz7 | Фикс WB feedbacks sync: формат «Достоинства/Недостатки» теряется — добавлен helper formatFeedbackBody (text + pros + cons с метками), syncFeedbacks использует helper + self-heal для существующих INBOUND-message, one-shot backfill endpoint /api/cron/feedbacks-backfill-pros-cons (x-cron-secret, idempotent, days param) | 2026-05-18 | dbc43ba |  | [260518-hz7-wb-feedbacks-sync-lib-support-sync-ts-su](./quick/260518-hz7-wb-feedbacks-sync-lib-support-sync-ts-su/) |
| 260518-igw | Три доработки: (1) pinned-отзывы WB — diagnostic raw API подтвердил отсутствие поля → feature deferred с TODO; (2) UI rework /prices/wb expand — вертикальные lanes отзывов справа от графика (chart + metadata + связка + товар); (3) BUG FIX orders sync — WB Statistics Orders flag=0 фильтрует по lastChangeDate (не date) → daily cron теперь rolling 7-day re-sweep вместо yesterday-only, `/api/wb-orders-backfill?days=N` для targeted backfill | 2026-05-18 | fc38275 |  | [260518-igw-pinned-wb-ui-rework-prices-wb-vertical-b](./quick/260518-igw-pinned-wb-ui-rework-prices-wb-vertical-b/) |
| 260616-uhq | Закупки UX этапов товара: (1) PurchaseItemStagesCard → горизонтальный stepper с click-to-fill цепочкой кол-ва (вместо ручного ввода в каждую ячейку); (2) раскрываемые строки в PurchasesTable с бейджем текущего этапа + кол-во per товар; (3) shared lib/purchase-stages.ts (порядок/метки/цвета/хелперы) как единый источник. Локальный tsc не прогнан — на этой машине нет node_modules | 2026-06-16 | 813b456 |  | [260616-uhq-purchase-item-stages-ux](./quick/260616-uhq-purchase-item-stages-ux/) |
| 260616-vjo | Этапы закупки v2: (1) PurchaseItemStageProgress.date (миграция 20260616_purchase_stage_date) + savePurchaseItemStages принимает date; (2) stepper показывает дату+кол-во под каждым достигнутым этапом + date-picker, клик авто-проставляет дату=сегодня МСК по цепочке; (3) раскрытые строки таблицы — сумма/вес/объём per товар (от заказанного кол-ва) + статус. Требует prisma migrate deploy на VPS | 2026-06-16 | dcc767f |  | [260616-vjo-stages-dates-qty](./quick/260616-vjo-stages-dates-qty/) |
| fast-260617 | Раскрытые строки закупки: сумма/вес/объём выровнены по колонкам осн. таблицы, фото товара ×2, статус+кол-во слева от Суммы | 2026-06-17 | 118997f |  | inline (PurchasesTable.tsx) |
| fast-260617b | кг и м³ в таблице закупок — целые с округлением вверх (Math.ceil) | 2026-06-17 | ee9ed9d |  | inline (PurchasesTable.tsx) |
| fast-260617c | Дата текущего этапа рядом со статусом товара в раскрытых строках (page.tsx stages.date → currentStageDate) | 2026-06-17 | 6d0ca98 |  | inline (PurchasesTable.tsx, purchases/page.tsx) |
| 260616-v5x | Авто-фото товара из первой WB-карточки + флаг override (по образцу nameOverridden): Product.photoOverridden (миграция 20260616_product_photo_overridden) + resolveProductPhoto helper в create/update/duplicate + batch-перевывод в /api/wb-sync (бэкафилл «глючных» null-фото) + UI override в ProductForm («Вернуть авто из WB»). Фикс: фото не менялось при смене порядка артикулов и при синхронизации. Требует prisma migrate deploy на VPS | 2026-06-16 | 92679be |  | [260616-v5x-product-photo-auto-wb](./quick/260616-v5x-product-photo-auto-wb/) |
| fast-260702 | CLAUDE.md: обязательные правила деплоя (fetch в начале сессии, push в конце, деплой только через nohup + df -h) — после инцидента 2026-07-02 (stale local −435 коммитов, упавший билд стёр прод-сборку) | 2026-07-02 | d8d00e4 |  | inline (CLAUDE.md) |
| 260702-j52 | Производство в /stock и /purchase-plan автоматически из закупок: lib/production-sync.ts (Σ max(0, quantity − WAREHOUSE.qty) по PLANNED+ACTIVE), recompute в 4 server actions закупок, ручной ввод количества закрыт везде (tooltip-раскладка по закупкам в /stock), ivanovoStock не тронут. Post-deploy: npx tsx scripts/recompute-production.ts | 2026-07-02 | e638665 |  | [260702-j52-stock-productincoming-purchase-stages](./quick/260702-j52-stock-productincoming-purchase-stages/) |
| 260703-qze | Разбить строку «Дебиторка Wildberries» в /finance/balance на две строки: «Баланс WB (к перечислению)» = balanceCurrentRub + «Незакрытая неделя (продажи)» = weeklyTailRub; subtotal группы не меняется (current+tail=totalRub). Только lib/balance-data.ts + мок в tests/balance-sheet.test.ts. Локальный vitest не прогнан — нет node_modules; тест зелёный в worktree исполнителя (5/5) + ревью диффа | 2026-07-03 | 6e40dcd |  | [260703-qze-receivables-split-current-tail](./quick/260703-qze-receivables-split-current-tail/) |
| fast-260703 | fix: дебиторка WB = current (убрать двойной счёт weeklyTail). Расследование (эмпирика Sales API + офиц. докой WB) показало: current обновляется в реальном времени и УЖЕ включает выкупы текущей недели; weeklyTail = те же выкупы → задвоение ~10.4М на 02.07. totalRub=current в finance-snapshot.ts, строка = balanceCurrentRub в balance-data.ts (откат split 260703-qze), тест. Findings: .planning/debug/wb-receivables-double-count.md. Post-deploy: UPDATE FinanceReceivablesSnapshot totalRub=balanceCurrentRub | 2026-07-03 | 5daee3e |  | inline (finance-snapshot.ts, balance-data.ts, tests/balance-sheet.test.ts) + .planning/debug/wb-receivables-double-count.md |
| fast-260703b | feat: справка «Как считается баланс» — кнопка на /finance/balance (видна всем) → диалог с построчной методологией статей + выделен блок про Дебиторку=current. Канонический текст в docs/finance-balance-methodology.md | 2026-07-03 | c05e695 |  | inline (BalanceMethodologyDialog.tsx, finance/balance/page.tsx, docs/finance-balance-methodology.md) |
| fast-260704 | fix: модалка «Как считается» ~3× шире на десктопе (max-w-2xl → sm:max-w-6xl; max-w-2xl без sm: не перебивал базовый sm:max-w-sm 384px) | 2026-07-04 | bc45ad6 |  | inline (BalanceMethodologyDialog.tsx) |
| 260704-cvz | Раскрываемые (drill-down) строки в балансе /finance/balance: 6 товарных строк (WB склад/в пути к-от клиента/Иваново/в пути из Китая/Авансы) → Категория→Подкатегория→Товар; «Банковские счета (₽)» → по счёту; «Остаток по кредитам» → Кредитор→Кредит. Обе даты+Δ, сортировка desc на каждом уровне. BalanceLine.children + buildProductTree в balance-data.ts (аллокация закупок по qty×unitPrice; 1 product.findMany), client-рефактор BalanceSheetTable (expandedKeys, chevron, рекурсивный рендер, compare по полному path-ключу). Инвариант Σдетей=amountRub; итоги/капитал не меняются. Локально vitest нет (нет node_modules) — верификация ревью+сборка | 2026-07-04 | 8f50ebf |  | [260704-cvz-balance-drilldown-rows](./quick/260704-cvz-balance-drilldown-rows/) |

| fast-260704b | feat: в drill-down баланса добавлен уровень «Направление» первым — иерархия товарных строк стала Направление→Категория→Подкатегория→Товар. Направление=Product→Brand→Direction (nullable→«Без направления»). buildProductTree +внешний dir-уровень, product.findMany +brand.direction, тест-мок +brand.direction. Клиент не тронут | 2026-07-04 | 973e674 |  | inline (balance-data.ts, tests/balance-sheet.test.ts) |
| 260704-fzt | Баланс закупок Заход 1/2: (A) классификация закупок на 3 строки вместо 2 — Авансы (PRODUCTION/INSPECTION) / Товар готовый к отгрузке (SHIPMENT, был багом в «в пути») / Товар в пути (TRANSIT); (B) fetchCbrRatesForDate (архив cbr-xml-daily) + scripts/backfill-cbr-rates.ts — исторические курсы ЦБ март–июнь (CurrencyRate forward-only с 09.06 занижал ранние платежи); (C) методология обновлена; (D) тесты. Post-deploy: npx tsx scripts/backfill-cbr-rates.ts. Заход 2 (поле «Оплачено ₽ факт» на платеже) — TODO | 2026-07-04 | 0c1aea9 |  | [260704-fzt-balance-purchase-3lines-cbr-backfill](./quick/260704-fzt-balance-purchase-3lines-cbr-backfill/) |

| 260704-go2 | Баланс закупок Заход 2/2: поле «Оплачено ₽ (факт)» на платеже (PurchasePayment.amountRub Decimal? + миграция) с приоритетом в балансе (Авансы/Готов/В пути — факт без paidApproximate) и в таблице закупок (столбец «Оплачено»). UI-инпут в PurchasePaymentsCard для не-RUB платежей (placeholder = ≈CNY×курс). Пусто → CNY×курс как раньше. Миграция применяется deploy.sh (prisma migrate deploy) | 2026-07-04 | bfd6585 |  | [260704-go2-payment-actual-rub](./quick/260704-go2-payment-actual-rub/) |
| 260705-f1p | Факт выкупов по дате реализации для ИУ/Сводного (Phase 25 follow-up): модель WbSalesDaily (no-FK) + fetchSalesDaily из WB Statistics Sales API (priceWithDisc=цена продавца до СПП, saleID 'S'=выкуп/'R'=возврат, по дате реализации) + cron wb-sales-daily 04:30 + backfill ?days. Сводный /sales-plan (факт/ИУ/KPI/график) → redemption-факт (settledThrough today−2); воронка остаётся для per-товар когортного плана. Фикс: «Факт за период» показывал 1,8М (воронка по дате заказа, незрелые когорты) вместо ~3,3-3,9М/день. Миграция 20260705_wb_sales_daily + backfill ?days=30 — деплой | 2026-07-05 | c001787 |  | [260705-f1p-wbsalesdaily-sales-api](./quick/260705-f1p-wbsalesdaily-sales-api/) |
| fast-260705 | fix: Факт Сводного /sales-plan = НЕТТО (Фактический оборот = выкупы − возвраты). loadFactDaily redemption company+product = buyoutsRub + returnsRub (returnsRub<0, уже в WbSalesDaily); подписи метрики «Фактический оборот». Совпадает с кабинетом WB (июль 1–4 нетто 12,24М vs кабинет 12,21М, Δ0,26%). Без миграции — только код | 2026-07-05 | dc387ea |  | inline (lib/sales-plan/data.ts + PlanFact{SummaryCards,Matrix,Controls}.tsx) |

| 260705-o9x | UI-правки /sales-plan по внешнему дизайн-ревью (Claude design, 2026-07-05): 20 правок P0/P1/P2 — dark-тема ABC-бейджей и графиков (oklch-хардкоды → var(--chart-1/2/iu), новый токен --chart-iu), sticky-футер «Итого» per-td, z-30 frozen-заголовков, единая семантика цветов (red-500→destructive, green→emerald), dashed-affordance инлайн-ячеек, ring-2 акцент KPI-5, кнопка Редактировать через buttonVariants (БЕЗ asChild — base-ui), unsettled-бары приглушены per-Cell, УКТ→SKU, контекстные empty states, ⚠→◇ у suggested-VP, hit-area. Ревью сверено с кодом до исполнения (1 корректировка: asChild). Gate: tsc 0, build OK, 31 тест GREEN. UI-only — движок/actions/БД не тронуты | 2026-07-05 | 145a8fa |  | [260705-o9x-sales-plan-design-review-ui](./quick/260705-o9x-sales-plan-design-review-ui/) |

| fast-260705b | fix: hotfix buttonVariants в RSC (products/page.tsx 500 в рантайме — client-функция из "use client" модуля не вызывается на сервере; build пропускает на динамических страницах) → статические классы. + fix: scoped-регенерация VP плодила дубли — regenerateVirtualPurchasesInternal(productIds) чистил только productIds, а генерил предложения ВСЕМ товарам → каждая смена ABC/тумблера добавляла полный комплект всем позициям (7644 VP, до 180/товар при лимите 6). Фикс scopedProducts + полная перегенерация на проде: 7644→258, max 6/товар | 2026-07-05 | 5705ed4 + 2b17d49 |  | inline (products/page.tsx, app/actions/sales-plan.ts) |

| fast-260705c | fix: каскад виртуальных закупок — для товара уже в дефиците пробой (< today+leadTime) не лечится приходом → каждая итерация предлагала одинаковую партию одной датой (несколько заказов с приходом 19.08 на УКТ-000003). Фикс: курсор minSearchDate — следующий пробой строго после прихода предыдущей партии. Регрессионный тест (даты строго возрастают). Прод: УКТ-000003 = 3 партии 19.08/20.10/21.12, max 3/товар | 2026-07-05 | a4fff87 |  | inline (lib/sales-plan/virtual-purchases.ts + tests/sales-plan-virtual.test.ts) |

| fast-260705d | UX: параметры модели /sales-plan «Товары» — русские подписи (Lead time→Срок поставки, Покрытие VP→Покрытие закупки, Лаг WB→Лаг приёмки WB, Выкуп/Возврат T+→Срок выкупа/возврата) + hover-tooltip на каждый параметр (что это и на что влияет; семантика сверена с engine/arrivals/suggester). Паттерн PromoTooltip (base-ui render-prop span, cursor-help + dotted underline) | 2026-07-05 | (см. git) |  | inline (ModelParamsBar.tsx) |

| 260705-seb | /sales-plan «Товары» v2 по UAT: (D-1) ETA приходов с floor по текущему этапу закупки — «Готов к отгрузке» → today+транзит, ранние этапы → today+срок поставки, max(createdAt+45, floor), manual/TRANSIT не тронуты (+4 arrivals-теста); (D-3) факт per-товар → по дате реализации нетто (redemptionByProduct); (D-4) pro-rata: pct = факт/план прошедших дней активной версии, план месяца = версия(прошлое)+движок(остаток) — довершено оркестратором после ревью (5f0ce0d); (D-5) ячейки «407 · 61 шт» в тыс ₽ без П/Ф/К/М, штуки во всех месяцах, легенда, «Итог, тыс ₽». Post-deploy: transitDays 20→40 + regenerate VP | 2026-07-05 | 5f0ce0d |  | [260705-seb-arrivals-stage-eta-cells](./quick/260705-seb-arrivals-stage-eta-cells/) |

| fast-260705e | UX «Товары»: плашки [план]/[факт] в ячейках месяца и футере + «тыс ₽» у сумм + ширина колонок месяцев 110→170 + подстрочник edit-ячейки без К/М. Итерация 2 по фидбеку: план и факт одним шрифтом (text-sm), план-плашка жёлто-оранжевая (amber), факт-плашка зелёная (факт ≥ план) / красная (факт < план; сравнение по pro-rata pct при наличии версии, иначе напрямую) | 2026-07-05 | (см. git) |  | inline (ProductPlanTable.tsx, ProductPlanCell.tsx) |

| 260705-tlc | Большая модалка товара в /sales-plan «Товары» (клик по строке): БЕЗ табов, max-w-7xl. ComposedChart весь горизонт H2 по дням (план шт/день chart-2 bars + факт шт/день chart-1 bars из WbCardOrdersDaily (fallback WbSalesDaily нетто) + линия Сток(расч) chart-iu правая ось + «сегодня» + вертикальные отметки приходов с qty, реальные/виртуальные). Grid 6 месяцев: заказы/день + цена ₽ с REALTIME-пересчётом графика (computeSalesPlan client) + «План H2: тыс ₽ · шт»; сохранение saveMonthLevels (null=сброс на авто). Приходы списком + стокаут/потери. «Правка по дням» сохранена как <details>. Новый action getProductPlanHorizon (SALES read). ParamsTab удалён | 2026-07-05 | 2aae7b0 |  | [260705-tlc-product-plan-modal-v2](./quick/260705-tlc-product-plan-modal-v2/) |

| 260706-jmt | /sales-plan «Сводный» редизайн наглядности: plan-fact += planRubFull/planRubToDate/iuRubFull/iuRubToDate/forecastRub/elapsed·totalDays + kpi.planHorizonFullRub (existing поля не тронуты, +6 тестов); график — текущий месяц в ПОЛНОМ масштабе (факт сплошной + прогноз штриховкой + метка «N/M дн»), «нарастающим» по умолчанию; карточки — блоки «Темп на сегодня» / «Прогноз до 31.12» (План весь период 325М, до ИУ −102М), убрана «−95% от плана»; таблица — план/ИУ полный месяц + строка «Прогноз», сравнения прогноз−план/ИУ, pro-rata в tooltip. tsc чисто, 93/93 sales-plan тестов | 2026-07-06 | 96e2b3e, bfea34c |  | [260706-jmt-redesign-sales-plan-svodny-chart-cards-t](./quick/260706-jmt-redesign-sales-plan-svodny-chart-cards-t/) |

| fast-260706 | /sales-plan «Сводный» — два графика вместо тумблера: сверху «По периодам» (не нарастающий), ниже «Нарастающий итог», оба всегда видны; убран тумблер «Нарастающим итогом» из PlanFactControls | 2026-07-06 | (см. git) |  | inline (page.tsx + PlanFactControls.tsx) |

| 260706-q5a | Индекс сезонности в План продаж → Товары: помесячный множитель ставки (× план + виртуальные закупки). Модель SalesPlanSeasonality (versionId?/scope/scopeId/month/indexPct, NULLS NOT DISTINCT); pure lib/sales-plan/seasonality.ts — resolveIndexByMonth (приоритет подкат→кат→напр→глоб) + пере-якорение effective=stored(m)/stored(тек)×100; engine rate×index/100; actions save/reset + снапшот в fixSalesPlanVersion; SeasonalityBar над таблицей. Спека docs/superpowers/specs/2026-07-06. tsc чисто, тесты 100/100, задеплоен (миграция применена) | 2026-07-06 | fb9e982, 5e21816, da31a47 |  | [260706-q5a-seasonality-index-in-sales-plan-tovary-p](./quick/260706-q5a-seasonality-index-in-sales-plan-tovary-p/) |

| fast-260707d | Редактирование сохранённых планов: кнопка «Изменить» в PlanVersionBar (название+комментарий выбранной версии) → action updateSalesPlanVersionMeta (SALES MANAGE, метаданные, не снапшот); комментарий показывается при наведении на название (title в баннере просмотра + опциях select, 💬-маркер); note проброшен в PlanVersion + оба page-загрузчика | 2026-07-07 | (см. git) |  | inline (PlanVersionBar + EditPlanVersionDialog + actions/sales-plan + 2 pages) |
| fast-260707c | Название плана в формате «Название · Дата»: в FixPlanVersionDialog поле «Название плана» (только имя, дефолт «План»), дата добавляется автоматически + live-превью итога; раньше label был только датой «План от DD.MM.YYYY» | 2026-07-07 | (см. git) |  | inline (FixPlanVersionDialog.tsx) |
| fast-260707b | Два фикса /sales-plan: (1) переключение вкладок Сводный/Товары/Пора заказывать теперь сохраняет выбранную версию — SalesPlanTabs прокидывает ?version в href (раньше сбрасывалось на рабочий); (2) баг ввода в Товары (edit): число сбрасывалось на каждой клавише — useEffect resync inputValue только при !editing (value производный от черновика перебивал ввод через parseFloat, каретка прыгала) | 2026-07-07 | (см. git) |  | inline (SalesPlanTabs.tsx + ProductPlanCell.tsx) |
| fast-260707 | Сезонность: каскадный выбор области — Направление › Категория › Подкатегория (каждый сужает следующий; «все» на уровне = полный список у child, быстрый flat-выбор сохранён); scope = самый глубокий выбранный уровень (ничего = Глобально); чипы активных наборов заполняют каскад; категориям проброшен directionId через бренд | 2026-07-07 | (см. git) |  | inline (SeasonalityBar.tsx + products/page.tsx) |
| 260707-iax | Начисленные проценты по кредитам (computed, no-DB): computeAccruedInterest — pro-rata между платежами графика (lib/loan-math.ts, 8 тестов, TDD); surfaced в /credits (колонка «Начислено, ₽», карточка дашборда, карточка детали); /finance/balance «Кредиты и займы» расщеплён на «Остаток тела» + «Начисленные проценты» с drill-down Кредитор→Кредит из той же lenderMap. tsc чисто, golden-сьюты (loan-math/pricing-math/plan-fact/engine/balance-sheet) 108/108, задеплоено | 2026-07-07 | 4e419f2, 8fd6519, 54f8b87, f187a77 |  | [260707-iax-credit-accrued-interest](./quick/260707-iax-credit-accrued-interest/) |
| fast-260707e | Методология баланса: пункт «Кредиты и займы» в BalanceMethodologyDialog теперь описывает обе строки — «Остаток тела» и «Начисленные проценты» (pro-rata по графику с даты последнего платежа); раньше только тело. tsc чисто, задеплоено | 2026-07-07 | 49f0749 |  | inline (BalanceMethodologyDialog.tsx) |
| 260707-k9g | Фаза A плановых цен в /prices/wb: WbCard.plannedSellerPrice/plannedSellerDiscountPct (nullable, миграция) + строка «Плановая» сразу после «Текущая» (жёлто-оранжевая плашка + бейдж, дефолт=текущей, деривация через deriveBefore); savePlannedPrice (RBAC MANAGE, null→сброс) + кнопки в PricingCalculatorDialog; lib/sales-plan/data.ts база плана продаж = plannedProductPrice ?? avgPriceRub (движок/immutable-версии не тронуты). Фаза B (std-комиссия/хранение/логистика/тарифы box/ИЛ) НЕ реализована. tsc чисто, 127/127 pricing-math+sales-plan тестов, задеплоено (миграция применена) | 2026-07-07 | e6a6a34, d3dd879, fa18423 |  | [260707-k9g-a-prices-wb-planned-price-row-persistenc](./quick/260707-k9g-a-prices-wb-planned-price-row-persistenc/) |
| 260707-m5v | Фаза B v1 второго фин-реза «на стандартных условиях» в /prices/wb (срез §5 отложён): WbBoxTariff + fetchBoxTariffs/syncBoxTariffs (/tariffs/box → флэт-эффективные ставки в AppSetting.wbBoxTariffEffective) + кнопка «Тарифы складов» + крон 05:20 МСК; calculatePricingStandard в pricing-math (Л_туда/Л_эфф с амортизацией возврата при невыкупе/Хранение, golden первого блока не тронут, std-golden запинен на пересчитанном ≈1045.24₽); 3 столбца Прибыль-std/ROI-std/Re-std в таблице + второй блок в модалке юнит-экономики; 2 новых ставки в GlobalRatesBar (Возврат-логистика ₽ до 1000, Индекс локализации ×) через per-key appSettingValueSchemaForKey (bond [0,100] для процентных не ослаблен). tsc чисто, 945/987 тестов (42 пред-существующих чужих падения support/CRM/wb-sync), задеплоено (миграция WbBoxTariff применена) | 2026-07-07 | fc7238a, f7e383c, b4dbacd |  | [260707-m5v-b-prices-wb](./quick/260707-m5v-b-prices-wb/) |
| 260708-f23 | Фаза B v2 — реальные per-склад ставки acceptance/coefficients (короб) + срез §5 по стоку бытовая/одежда + возврат-продавцу в /prices/wb: WbAcceptanceCoef + fetchAcceptanceCoefficients/fetchReturnTariffs (parseWbNumLoose) + syncBoxTariffs расширен (upsert коробов + wbReturnToSellerRub + срез); lib/wb-eff-coef.ts:computeEffCoefForDirection (pure взвешивание Σ(qty×ставка)/Σqty per направление, coveragePct/unmatched, 6 unit-тестов) → AppSetting.wbEffCoef.appliances/clothing; calculatePricingStandard v2 (Л_туда/Хранение из base+доп-литр эфф-ставок, коэф склада УЖЕ вшит — без ×delivCoefPct/storageCoefPct как в v1, +строка Возврат продавцу); std-golden v2 nmId 800750522 пересчитан (profitStd≈894.24₽/ROI≈40.57%/Re≈11.54%), golden первого блока не тронут; page.tsx резолвит эфф-ставки по направлению (brand.direction.hasSizes), v2-хардкод fallback (94.3/28.7/0.16/0.16, НЕ устаревшие v1 46/14/0.07 — фикс потенциального занижения вдвое). tsc чисто, 952/994 тестов (те же 42 пред-существующих чужих падения), задеплоено (миграция 20260708_wb_acceptance_coef применена) | 2026-07-08 | a860291, 85ac197, 7e77a8e |  | [260708-f23-b-v2-acceptance-api](./quick/260708-f23-b-v2-acceptance-api/) |

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

Last session: 2026-07-05T20:01:54.862Z
Stopped at: Completed 24-finance-balance-24-01-PLAN.md
Resume file: None
