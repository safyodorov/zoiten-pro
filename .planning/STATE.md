---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Служба поддержки WB
status: Executing Phase 08
stopped_at: "Roadmap v1.1 создан — Phase 8..13 с success criteria и Traceability. Следующий шаг: `/gsd:plan-phase 8` для декомпозиции MVP Отзывы+Вопросы на планы."
last_updated: "2026-04-17T13:03:29.030Z"
progress:
  total_phases: 13
  completed_phases: 7
  total_plans: 33
  completed_plans: 30
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-17)

**Core value:** Единая база товаров компании, от которой зависят все остальные процессы ERP
**Current focus:** Phase 08 — support-mvp

## Current Position

Phase: 08 (support-mvp) — EXECUTING
Plan: 1 of 4

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

### Roadmap Evolution

- Phase 7 added: Управление ценами WB — калькулятор юнит-экономики с акциями и расчётными ценами (directory renamed to `07-prices-wb` for clarity)
- Milestone v1.1 added (2026-04-17): +40 requirements (SUP-01..SUP-40), +6 phases (Phase 8..13) — Служба поддержки WB (отзывы/вопросы → возвраты → чат → шаблоны/обжалование → профиль/мессенджеры → статистика)

### Pending Todos

None yet.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260408-syb | Создать модуль Сотрудники — БД, CRUD, таблица, фильтры, модалка | 2026-04-08 | efb9ca8 | [260408-syb-crud](./quick/260408-syb-crud/) |
| 260410-leh | Починить ширину колонок в /prices/wb и собрать GlobalRatesBar слева | 2026-04-10 | 142c62d | [260410-leh-wb-globalratesbar](./quick/260410-leh-wb-globalratesbar/) |
| 260410-mya | Резайз/wrap/персистентность столбцов /prices/wb + округление денег + фикс sticky прозрачности | 2026-04-10 | fc270d0 | [260410-mya-wrap-prices-wb-sticky](./quick/260410-mya-wrap-prices-wb-sticky/) |

### Blockers/Concerns

- Phase 6: Existing nginx config on VPS is unknown — run `nginx -T` before editing
- Phase 1: Auth.js v5 TypeScript session augmentation syntax differs from v4 — verify before writing RBAC checks
- Phase 5: ai-cs-zoiten repo has unknown API surface — may need discovery spike before integration
- Phase 7: UAT pending (10 HUMAN-UAT пунктов) — отложен по решению пользователя, вернуться после v1.1
- Phase 8: Нужен доступ к WB Feedbacks/Questions API — scope токена проверить (bit 5 Отзывы уже есть в WB_API_TOKEN)
- Phase 10: WB Chat API может блокироваться Node.js fetch() по TLS fingerprint — заготовить curl-fallback реактивно как в wb-api.ts v4

## Session Continuity

Last session: 2026-04-17T00:00:00.000Z
Stopped at: Roadmap v1.1 создан — Phase 8..13 с success criteria и Traceability. Следующий шаг: `/gsd:plan-phase 8` для декомпозиции MVP Отзывы+Вопросы на планы.
Resume file: None
