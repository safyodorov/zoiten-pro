---
phase: quick-260710-jgs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - prisma/migrations/20260710_wb_realization_weekly/migration.sql
  - lib/wb-cooldown.ts
  - lib/wb-realization-api.ts
  - lib/wb-realization-sync.ts
  - app/api/wb-realization-sync/route.ts
  - app/api/cron/wb-realization-weekly/route.ts
  - app/api/cron/dispatch/route.ts
  - components/finance/WeeklyFinReportControls.tsx
  - lib/finance-weekly/realization.ts
  - lib/finance-weekly/data.ts
  - lib/finance-weekly/types.ts
  - app/(dashboard)/finance/weekly/page.tsx
  - tests/wb-realization-classify.test.ts
  - tests/finance-weekly-realization.test.ts
autonomous: true
requirements: [W1-REALIZATION]

must_haves:
  truths:
    - "Модель WbRealizationWeekly существует, миграция hand-written, prisma generate чист"
    - "MANAGE-пользователь FINANCE может кнопкой «Реализация WB» на /finance/weekly импортировать отчёт реализации выбранной недели (clean-replace недели)"
    - "Крон-задача (вторник 05:50 МСК) зарегистрирована в dispatcher и синкает ПРОШЛУЮ ISO-неделю"
    - "classifyRealizationRow — pure функция, unit-тесты по одному кейсу на каждый бакет + unknown→deductionOther зелёные"
    - "При наличии строк реализации за неделю /finance/weekly берёт ИУ-факт: reviewWriteoffTotal, logisticsIuPerUnit, пулы storage/acceptance из реализации; manual — fallback; бейдж источника в редакторе пулов"
    - "promotionRub хранится, но НЕ участвует в расчёте; std-сценарий (логистика/хранение Оферты) не изменён — git diff lib/finance-weekly/engine.ts пуст"
    - "Ни одного реального вызова WB API из задач — только код"
  artifacts:
    - path: "prisma/migrations/20260710_wb_realization_weekly/migration.sql"
      provides: "CREATE TABLE WbRealizationWeekly + unique(weekStart,nmId)"
      contains: "WbRealizationWeekly"
    - path: "lib/wb-realization-api.ts"
      provides: "Клиент finance/v1/sales-reports + pure классификатор"
      exports: ["listSalesReports", "fetchSalesReportDetailed", "classifyRealizationRow", "parseMoney"]
      min_lines: 120
    - path: "lib/wb-realization-sync.ts"
      provides: "syncRealizationWeek(weekStart) — list→detailed→classify→aggregate→clean-replace"
      exports: ["syncRealizationWeek"]
    - path: "app/api/wb-realization-sync/route.ts"
      provides: "POST MANAGE(FINANCE) sync route, body {week}"
      exports: ["POST"]
    - path: "app/api/cron/wb-realization-weekly/route.ts"
      provides: "GET cron endpoint (x-cron-secret, Tuesday guard, прошлая ISO-неделя)"
      exports: ["GET"]
    - path: "lib/finance-weekly/realization.ts"
      provides: "Pure helpers агрегации/распределения реализации для data.ts"
    - path: "tests/wb-realization-classify.test.ts"
      provides: "Unit-тесты классификатора (8 бакетов + unknown)"
    - path: "tests/finance-weekly-realization.test.ts"
      provides: "Unit-тесты pure-хелперов wiring (распределение account-level, пулы per universe)"
  key_links:
    - from: "components/finance/WeeklyFinReportControls.tsx"
      to: "/api/wb-realization-sync"
      via: "fetch POST body {week: weekStartISO}"
      pattern: "wb-realization-sync"
    - from: "app/api/wb-realization-sync/route.ts"
      to: "lib/wb-realization-sync.ts"
      via: "syncRealizationWeek"
      pattern: "syncRealizationWeek"
    - from: "lib/wb-realization-sync.ts"
      to: "prisma.wbRealizationWeekly"
      via: "$transaction deleteMany({weekStart}) + createMany"
      pattern: "wbRealizationWeekly\\.(deleteMany|createMany)"
    - from: "app/api/cron/dispatch/route.ts"
      to: "app/api/cron/wb-realization-weekly/route.ts"
      via: "dynamic import + AppSetting wbRealizationWeeklyCronTime"
      pattern: "wb-realization-weekly"
    - from: "lib/finance-weekly/data.ts"
      to: "prisma.wbRealizationWeekly + lib/finance-weekly/realization.ts"
      via: "findMany({weekStart}) → aggregate → articles/pools"
      pattern: "wbRealizationWeekly\\.findMany"
    - from: "lib/wb-realization-api.ts"
      to: "lib/wb-cooldown.ts"
      via: "cooldown bucket 'finance-reports' (отдельный от 'finance')"
      pattern: "finance-reports"
---

<objective>
W1 — импорт еженедельного отчёта реализации WB через новый Finance API
(`finance-api.wildberries.ru/api/finance/v1/sales-reports/list` + `/detailed`)
→ таблица `WbRealizationWeekly` → подключение ИУ-факта в /finance/weekly.

⚠ СУЖЕНИЕ СКОУПА (решение пользователя 2026-07-10, D-scope): работаем на ИУ — в отчёте
реализации НЕТ стандартной логистики/хранения для сценария «Оферта». Std-логистика и
std-хранение Оферты ОСТАЮТСЯ моделью (`calculatePricingStandard`) — НЕ трогать. Из отчёта
берём ТОЛЬКО ИУ-факт: баллы за отзывы, платная приёмка, штрафы, фактическое хранение,
возвратная логистика (delivery на ИУ = возвраты/брак), forPay (справочно), продвижение
(только хранение для сверки — в расчёт НЕ идёт, реклама уже из /adv/v1/upd).

Purpose: закрыть гэпы §3 дизайн-спеки (#3 отзывы, #10 приёмка/штрафы, #11 хранение-факт,
возвратная ИУ-логистика) фактом из финотчёта WB; фундамент для Баланса/ПДДС.
Output: модель+миграция, API-клиент с pure-классификатором + тесты, MANAGE sync-route +
кнопка + крон в dispatcher, wiring в lib/finance-weekly/data.ts с бейджем источника пулов.

ВАЖНО: сам API-вызов на прод из задач НЕ делать — только код. Первый реальный синк
запустит оркестратор после деплоя. НЕ деплоить (миграция применится через deploy.sh).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@docs/superpowers/specs/2026-07-08-weekly-finreport-design.md (§3 гэпы, §5 W1)
@lib/wb-finance-api.ts (образец finance-api клиента: 401/402/429, parseRetryAfter, cooldown)
@lib/wb-cooldown.ts (per-bucket cooldown)
@lib/finance-weekly/data.ts (loadWeeklyFinReportInputs — точка wiring)
@lib/finance-weekly/types.ts (WeeklyArticleInput, UniversePools)
@components/finance/WeeklyFinReportControls.tsx (тулбар — кнопка + бейджи)
@app/(dashboard)/finance/weekly/page.tsx (RSC, прокидывает props в Controls)
@app/api/wb-promotions-sync/route.ts (образец MANAGE-sync-route)
@app/api/cron/wb-sales-daily/route.ts (образец cron endpoint c clean-replace + lastRun)
@app/api/cron/dispatch/route.ts (регистрация крона: AppSetting Time/LastRun + dynamic import)
@prisma/migrations/20260710_wb_commission_snapshot/migration.sql (образец hand-written миграции)

<interfaces>
<!-- Ключевые контракты — использовать напрямую, кодовую базу не исследовать заново. -->

Из lib/wb-token.ts:
```typescript
export async function getWbToken(name: WbTokenName): Promise<string>
// "WB_FINANCE_TOKEN" уже в WB_TOKEN_NAMES (Персональный/Сервисный ТОЛЬКО)
```

Из lib/wb-cooldown.ts:
```typescript
export const WB_COOLDOWN_BUCKETS = [... , "finance"] as const // добавить "finance-reports"
export async function getWbCooldownSecondsRemaining(bucket: WbCooldownBucket): Promise<number>
export async function setWbCooldownUntil(bucket: WbCooldownBucket, retryAfterSec: number): Promise<Date>
```

Из lib/wb-api.ts:
```typescript
export class WbRateLimitError extends Error { constructor(context: string, retryAfterSec: number) }
```

Из lib/wb-finance-api.ts (образец обработки статусов):
```typescript
function parseRetryAfter(res: Response): number // Retry-After ?? X-Ratelimit-Retry ?? 60
// 429 → setWbCooldownUntil + WbRateLimitError; 402 → «оплата подписки»; 401 → «scope Финансы»
```

Из lib/finance-weekly/types.ts (НЕ менять структуру, только комментарий logisticsIuPerUnit):
```typescript
export interface WeeklyArticleInput {
  nmId: number; universe: "appliances" | "clothing"
  qtyOrders: number; grossPricePerUnit: number
  commIuPct: number; commStdPct: number; costPerUnit: number
  adSpendTotal: number
  reviewWriteoffTotal: number  // ← W1: факт из WbRealizationWeekly
  logisticsIuPerUnit: number   // ← W1: deliveryRub[nmId]/qty (возвратная логистика ИУ)
  logisticsStdPerUnit: number  // НЕ ТРОГАТЬ — модель calculatePricingStandard
  storagePerUnit?: number
}
export interface WeeklyPool { total: number; baseRevenue: number }
export interface UniversePools { deliveryToMp; creditInterest; overhead; acceptance; storage }
```

Из lib/finance-weekly/data.ts:
```typescript
export interface ManualPools { delivery; overheadAppl; acceptanceAppl; storageAppl;
  overheadCloth; acceptanceCloth; storageCloth }
export interface WeeklyFinReportPageData { weekStart; weekEnd; articles; meta; pools;
  constants; manualPools } // ← добавить hasRealization: boolean
// шаг 4-8: Promise.all батч загрузок — сюда добавить wbRealizationWeekly.findMany
// шаг 9: сборка articles (reviewWriteoffTotal: 0, logisticsIuPerUnit: 0 — заменить фактом)
// шаг 12: appliancesPools/clothingPools — storage/acceptance total из manualPools → заменить
```

Верифицированные факты WB API (24-RESEARCH, HIGH confidence, первоисточник dev.wildberries.ru):
- `POST https://finance-api.wildberries.ru/api/finance/v1/sales-reports/list` — ТОЛЬКО
  Персональный/Сервисный токен. 1 req/мин. Body: `{ dateFrom, dateTo }` RFC3339 МСК,
  `period: "daily"|"weekly"` (default weekly). Данные с 01.01.2025.
- Поля list-ответа — ДЕНЬГИ СТРОКИ: reportId, dateFrom, dateTo, createDate, currency,
  reportType, retailAmountSum, forPaySum, deliveryServiceSum, paidStorageSum,
  paidAcceptanceSum, deductionSum, penaltySum, paymentSchedule (строка), bankPaymentSum
- `POST .../sales-reports/detailed/{reportId}` — 1 req/мин, пагинация rrdId→HTTP 204 (конец),
  `fields[]` селектор. ⚠ daily reportId требует BigInt (weekly в практике меньше, но guard).
- Ключевые поля detailed-строки: forPay, retailAmount, retailPriceWithDisc, docTypeName,
  saleDt, rrDate, quantity, penalty, paidStorage, deduction, paidAcceptance, acquiringFee, srid
- Дискриминатор (спека 2026-07-10-weekly-finreport-reconcile-report.md): отзывы →
  bonus_type_name содержит «Баллы за отзывы»; продвижение → deduction/«Продвижение».
  Многие удержания приходят account-level БЕЗ nm_id → строка nmId=0.
- 402 Payment Required существует — обрабатывать. reportDetailByPeriod умирает 15.07.2026 —
  НЕ использовать.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Модель WbRealizationWeekly + миграция + lib/wb-realization-api.ts + тесты классификатора</name>
  <files>prisma/schema.prisma, prisma/migrations/20260710_wb_realization_weekly/migration.sql, lib/wb-cooldown.ts, lib/wb-realization-api.ts, tests/wb-realization-classify.test.ts</files>
  <behavior>
    tests/wb-realization-classify.test.ts (pure, без Prisma/Next импортов в тестируемых функциях):
    - classifyRealizationRow: по одному кейсу на КАЖДЫЙ бакет:
      * supplier_oper_name «Логистика» → { bucket: "delivery", amountRub: delivery-поле }
      * «Хранение» → storage
      * «Платная приёмка» → acceptance
      * «Штраф» → penalty (amount из penalty-поля)
      * bonus_type_name «Аванс за услугу Баллы за отзывы» → reviewPoints (amount из deduction)
      * supplier_oper_name/bonus_type_name содержит «Продвижение» (или «ВБ.Продвижение») → promotion (из deduction)
      * «Продажа» → forPay (amount из ppvz_for_pay/forPay); «Возврат» → forPay с ОТРИЦАТЕЛЬНЫМ вкладом forPay (как отдаёт WB) — фиксируем поведением: amount = как в поле, знак не инвертируем
      * неизвестная операция с ненулевым deduction → deductionOther
    - parseMoney: "1234,56" → 1234.56; "1234.56" → 1234.56; 10 → 10; null/"" / мусор → 0
    - normalizeRealizationRow: читает и snake_case и camelCase варианты (nm_id/nmId,
      supplier_oper_name/supplierOperName, bonus_type_name/bonusTypeName, delivery_rub/deliveryRub/deliveryService,
      paid_storage/paidStorage, paid_acceptance/paidAcceptance, ppvz_for_pay/forPay); отсутствие nmId → 0
    - accumulateRealizationRows: массив классифицированных строк → Map&lt;nmId, buckets&gt;
      (один тест: 2 nmId + 1 account-level строка nmId=0, суммы складываются по бакетам)
  </behavior>
  <action>
    1. prisma/schema.prisma — добавить модель (рядом с WbSalesDaily, тот же паттерн nmId без FK):
    ```prisma
    model WbRealizationWeekly {
      id                String   @id @default(cuid())
      weekStart         DateTime @db.Date // ISO-понедельник недели отчёта
      nmId              Int      // 0 = account-level строки без nm_id
      forPayRub         Float    @default(0) // к перечислению (справочно)
      deliveryRub       Float    @default(0) // логистика ИУ-факт: возвраты/брак
      storageRub        Float    @default(0)
      acceptanceRub     Float    @default(0)
      penaltyRub        Float    @default(0)
      reviewPointsRub   Float    @default(0) // баллы за отзывы
      promotionRub      Float    @default(0) // ВБ.Продвижение — ТОЛЬКО сверка, в расчёт НЕ идёт
      deductionOtherRub Float    @default(0)
      reportIds         String[] // id обработанных отчётов WB (string — BigInt guard)
      createdAt         DateTime @default(now())
      updatedAt         DateTime @updatedAt

      @@unique([weekStart, nmId])
      @@index([weekStart])
    }
    ```
    2. Hand-written миграция prisma/migrations/20260710_wb_realization_weekly/migration.sql
       по образцу 20260710_wb_commission_snapshot: CREATE TABLE (DATE, DOUBLE PRECISION,
       TEXT[], TIMESTAMP(3)) + UNIQUE INDEX (weekStart,nmId) + INDEX (weekStart).
       Без backfill. `npx prisma generate` (локальной PG нет — migrate НЕ запускать,
       применится deploy.sh).
    3. lib/wb-cooldown.ts — добавить bucket `"finance-reports"` в WB_COOLDOWN_BUCKETS
       (комментарий: W1 sales-reports, 1 req/мин, ОТДЕЛЬНЫЙ от 'finance' balance).
       В resolveBucketFromUrl: внутри ветки finance-api.wildberries.ru — если url содержит
       "/api/finance/v1/sales-reports" → "finance-reports", иначе "finance".
    4. lib/wb-realization-api.ts — новый клиент (образец обработки статусов — lib/wb-finance-api.ts):
       - Pure-хелперы (экспорт, БЕЗ side-effects — тестируются без сети):
         * `parseMoney(v: unknown): number` — number как есть; string → replace(",",".") → parseFloat; иначе 0
         * `normalizeRealizationRow(raw)` → { nmId, supplierOperName, docTypeName, bonusTypeName,
           forPay, deliveryRub, storageRub, penaltyRub, acceptanceRub, deductionRub, quantity } —
           читает оба нейминга (snake/camel, см. behavior), деньги через parseMoney
         * `type RealizationBucket = "forPay"|"delivery"|"storage"|"acceptance"|"penalty"|"reviewPoints"|"promotion"|"deductionOther"`
         * `classifyRealizationRow(row: NormalizedRealizationRow): { bucket: RealizationBucket; amountRub: number }`
           — порядок проверок (lowercase includes):
           bonusTypeName содержит «баллы за отзывы» → reviewPoints (deductionRub);
           supplierOperName/bonusTypeName содержит «продвижение» → promotion (deductionRub);
           supplierOperName содержит «логистик» → delivery (deliveryRub, fallback deductionRub);
           «хранен» → storage (storageRub, fallback deductionRub);
           «приемк»/«приёмк» → acceptance (acceptanceRub, fallback deductionRub);
           «штраф» → penalty (penaltyRub, fallback deductionRub);
           «продажа»/«возврат»/«корректн» (или docTypeName «Продажа»/«Возврат») → forPay (forPay);
           иначе → deductionOther (deductionRub; если 0 — penaltyRub+storageRub+acceptanceRub)
         * `accumulateRealizationRows(rows): Map<number, Record<RealizationBucket, number>>`
       - Сетевая часть (НЕ вызывать в тестах и при выполнении задач!):
         * `listSalesReports(dateFrom: string, dateTo: string): Promise<SalesReportListItem[]>` —
           POST https://finance-api.wildberries.ru/api/finance/v1/sales-reports/list,
           body JSON { dateFrom, dateTo } (RFC3339 МСК, `${iso}T00:00:00+03:00`), Authorization: token.
           Ответ: деньги-СТРОКИ → parseMoney; reportId → String(...). BigInt-guard: парсить через
           res.text() + `text.replace(/"reportId"\s*:\s*(\d+)/g, '"reportId":"$1"')` перед JSON.parse.
           Вернуть { reportId: string, dateFrom: string, dateTo: string, forPaySum: number, ... }.
         * `fetchSalesReportDetailed(reportId: string): Promise<unknown[]>` —
           POST .../sales-reports/detailed/{reportId}, пагинация: body { rrdId: cursor, limit: 100000 },
           HTTP 204 → конец; иначе массив строк, cursor = rrdId последней строки; между страницами sleep 61s.
         * Общий приватный `callFinanceReports(path, body)`: cooldown-check bucket "finance-reports"
           (getWbCooldownSecondsRemaining > 0 → WbRateLimitError), токен getWbToken("WB_FINANCE_TOKEN"),
           статусы: 429 → parseRetryAfter → setWbCooldownUntil("finance-reports", retry) → на ПЕРВОМ 429
           один retry после ожидания retry-after (памятка: blind-retry запрещён — ровно 1 повтор по header);
           402 → «WB Finance API 402 — проверьте оплату подписки WB API»;
           401 → «WB Finance API 401 — токен без scope «Финансы» или не Персональный/Сервисный
           (sales-reports недоступен на базовом токене)»; прочие !ok → HTTP+text.
         * Экспорт `FINANCE_REPORTS_SLEEP_MS = 61_000` — пауза между ЛЮБЫМИ последовательными
           вызовами sales-reports (rate limit 1 req/мин).
       - Шапку-комментарий lib/wb-finance-api.ts обновить: sales-reports больше не deferred —
         реализован в lib/wb-realization-api.ts (одна строка, код не трогать).
    5. tests/wb-realization-classify.test.ts — по behavior выше; импортировать ТОЛЬКО pure-экспорты.
  </action>
  <verify>
    <automated>npx prisma generate && npx tsc --noEmit && npx vitest run tests/wb-realization-classify.test.ts</automated>
  </verify>
  <done>
    Модель + миграция созданы, prisma generate/tsc чисты, тесты классификатора зелёные
    (все 8 бакетов + unknown→deductionOther + parseMoney + normalize + accumulate).
    Коммит: `feat(quick-260710-jgs): WbRealizationWeekly + клиент sales-reports + классификатор`
    (git add -A).
  </done>
</task>

<task type="auto">
  <name>Task 2: Sync-route + кнопка «Реализация WB» + крон в dispatcher</name>
  <files>lib/wb-realization-sync.ts, app/api/wb-realization-sync/route.ts, app/api/cron/wb-realization-weekly/route.ts, app/api/cron/dispatch/route.ts, components/finance/WeeklyFinReportControls.tsx</files>
  <action>
    1. lib/wb-realization-sync.ts — `syncRealizationWeek(weekStart: Date): Promise<{ reports: number; rows: number; written: number }>`
       (общая логика для route и cron; weekStart = UTC-понедельник 00:00:00Z):
       - weekEnd = weekStart + 6д; listSalesReports(weekStartISO, weekEndISO) с period weekly (default);
       - фильтр отчётов, пересекающих неделю: report.dateFrom <= weekEndISO && report.dateTo >= weekStartISO
         (обычно ровно 1 недельный отчёт Пн–Вс); если 0 → throw
         «Отчёт реализации за неделю {weekStartISO} ещё не сформирован WB (появляется в понедельник после закрытия)»;
       - для каждого отчёта: sleep(FINANCE_REPORTS_SLEEP_MS) перед fetchSalesReportDetailed
         (1 req/мин!), строки → normalizeRealizationRow → classifyRealizationRow →
         accumulateRealizationRows (строки без nm_id → nmId=0);
       - clean-replace недели в $transaction (образец wb-sales-daily): deleteMany({ weekStart })
         + createMany(rows: per nmId все 8 бакетов → поля модели: forPay→forPayRub,
         delivery→deliveryRub, storage→storageRub, acceptance→acceptanceRub, penalty→penaltyRub,
         reviewPoints→reviewPointsRub, promotion→promotionRub, deductionOther→deductionOtherRub;
         reportIds = массив String reportId обработанных отчётов).
    2. app/api/wb-realization-sync/route.ts — POST (образец wb-promotions-sync):
       runtime nodejs, maxDuration 600 (rate limit 1/мин → минуты);
       requireSection("FINANCE", "MANAGE") → catch → 403;
       body { week: string } — валидация /^\d{4}-\d{2}-\d{2}$/ → 400, нормализация к
       ISO-понедельнику UTC (helper как в page.tsx normalizeToIsoMonday);
       syncRealizationWeek → 200 { ok: true, week, reports, rows, written };
       WbRateLimitError → 429 { error: «WB Finance API rate limit, повторите через N сек» };
       прочие → 500 { error: message }.
    3. app/api/cron/wb-realization-weekly/route.ts — GET (образец wb-sales-daily):
       x-cron-secret guard → 401; runtime nodejs, maxDuration 600;
       Tuesday-guard: MSK-день недели (new Date(Date.now()+3*3600_000).getUTCDay() === 2) —
       иначе { ok: true, skipped: "not-tuesday" } БЕЗ обновления lastRun;
       ?week=YYYY-MM-DD override (для ручного backfill), иначе ПРОШЛАЯ ISO-неделя:
       понедельник текущей MSK-недели минус 7 дней;
       syncRealizationWeek → upsert AppSetting wbRealizationWeeklyLastRun = getMskTodayString()
       (ТОЛЬКО при успехе) → { ok: true, week, ... }; ошибки → 500 { ok: false, error }.
    4. app/api/cron/dispatch/route.ts — зарегистрировать (паттерн проекта):
       ключи "wbRealizationWeeklyCronTime" + "wbRealizationWeeklyLastRun" в findMany-in;
       default время "05:50" (вторник 05:50 МСК — после ночных синков, отчёт закрытой недели
       появляется в понедельник; Tuesday-guard внутри endpoint'а, dispatcher дёргает ежедневно);
       блок shouldFireCron + dynamic import "../wb-realization-weekly/route" + fired.push
       (`realization:${res.status}`) — вставить после блока box-tariffs (05:20 < 05:50).
    5. components/finance/WeeklyFinReportControls.tsx — кнопка «Реализация WB» в ряд выбора
       недели (после «Тек. неделя», рендер только canManage):
       useTransition + toast.loading («Импорт отчёта реализации… (до 2-3 мин, rate limit WB)»)
       — образец WbPromotionsSyncButton; fetch POST /api/wb-realization-sync,
       body JSON { week: weekStartISO }; успех → toast.success(`Реализация: ${written} строк
       за неделю`) + router.refresh(); ошибка → toast.dismiss + toast.error(data.error).
       Native button в стиле соседних кнопок недели (px-2 py-1 border rounded), disabled при isPending.
    ⚠ НЕ вызывать /api/wb-realization-sync и WB API в рамках задачи — только код.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run tests/wb-realization-classify.test.ts tests/wb-prices-cron-dispatch.test.ts</automated>
  </verify>
  <done>
    Route/cron/dispatcher/кнопка написаны и типизированы; dispatch-тест (если затрагивает
    ключи) зелёный; ни одного реального API-вызова. Коммит:
    `feat(quick-260710-jgs): sync-route Реализация WB + кнопка + крон вторник 05:50`.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Wiring ИУ-факта в lib/finance-weekly/data.ts + бейдж источника пулов + тесты</name>
  <files>lib/finance-weekly/realization.ts, lib/finance-weekly/data.ts, lib/finance-weekly/types.ts, app/(dashboard)/finance/weekly/page.tsx, components/finance/WeeklyFinReportControls.tsx, tests/finance-weekly-realization.test.ts</files>
  <behavior>
    tests/finance-weekly-realization.test.ts (pure, импорт только lib/finance-weekly/realization.ts):
    - splitRealizationRows(rows): { byNmId: Map, accountLevel } — строка nmId=0 уходит в
      accountLevel, остальные в byNmId (тест: 2 nmId + account-level)
    - distributeByRevenue(total, revenueByNmId): Map&lt;nmId, доля₽&gt; — пропорционально выручке;
      Σ долей = total (±0.01); пустая/нулевая база → все доли 0 (guard, не NaN)
    - buildRealizationPools(byNmId, accountLevel, universeByNmId, applBase, clothBase):
      { storageAppl, storageCloth, acceptanceAppl, acceptanceCloth } —
      storage per universe = Σ storageRub своих nmId + accountLevel.storageRub × (universeBase/combinedBase);
      acceptance per universe = Σ (acceptanceRub + penaltyRub) аналогично;
      combinedBase=0 → account-level доля 0 (тест с числами, проверка обеих вселенных)
    - reviewWriteoffFor(nmId): reviewPointsRub[nmId] + доля account-level reviewPoints по выручке
    - logisticsIuPerUnit: deliveryRub/qty, qty=0 → 0 (guard)
  </behavior>
  <action>
    1. lib/finance-weekly/realization.ts — pure-модуль (ноль Prisma/Next импортов, паттерн
       attribution.ts): тип `RealizationBuckets` (8 числовых полей *Rub), функции из behavior.
       Вход — сериализуемые structures (rows: { nmId, forPayRub, deliveryRub, storageRub,
       acceptanceRub, penaltyRub, reviewPointsRub, promotionRub, deductionOtherRub }[]).
    2. lib/finance-weekly/data.ts:
       - В Promise.all (шаг 4-8) добавить `prisma.wbRealizationWeekly.findMany({ where: { weekStart } })`;
       - `hasRealization = realizationRows.length > 0`; splitRealizationRows → byNmId/accountLevel;
       - Выручка для распределения account-level reviewPoints: revenueByNmId из candidates
         (rub per nmId, обе вселенные) — построить ПОСЛЕ сборки candidates, применить в цикле
         сборки articles (двухпроходно: сначала candidates+revenue map, потом articles);
       - В сборке articles (шаг 9), при hasRealization:
         * `reviewWriteoffTotal` = reviewWriteoffFor(nmId) (иначе 0 как сейчас);
         * `logisticsIuPerUnit` = (byNmId.get(nmId)?.deliveryRub ?? 0) / qty с guard qty>0
           (иначе 0); обновить комментарий: «ИУ-факт: возвратная логистика (брак/возвраты)
           из WbRealizationWeekly; без реализации = 0 (зашита в комиссию)»;
       - Пулы (шаг 12), при hasRealization: buildRealizationPools(...) →
         storage/acceptance total per universe ЗАМЕЩАЮТ manualPools.storage*/acceptance*
         (manualPools остаётся fallback при hasRealization=false; поля delivery/overhead*
         manual НЕ трогаются — они не из реализации);
       - promotionRub/forPayRub/deductionOtherRub НИКУДА не идут (только хранение) —
         зафиксировать комментарием;
       - WeeklyFinReportPageData += `hasRealization: boolean` (и в обоих early-return'ах false);
       - Удалить устаревший TODO(W1) у logisticsStdPerUnit? НЕТ — заменить текст:
         std остаётся моделью НАВСЕГДА (решение 2026-07-10: на ИУ нет std-факта в отчёте);
         сам calculatePricingStandard-блок НЕ менять.
    3. lib/finance-weekly/types.ts — только комментарии к reviewWriteoffTotal/logisticsIuPerUnit
       (источник W1 = WbRealizationWeekly); структуру интерфейсов НЕ менять.
    4. app/(dashboard)/finance/weekly/page.tsx — прокинуть `hasRealization={data.hasRealization}`
       в WeeklyFinReportControls.
    5. components/finance/WeeklyFinReportControls.tsx — prop `hasRealization: boolean`;
       в редакторе пулов рядом с label'ами «Приёмка / штрафы» и «Хранение» (обе группы) —
       минимальный бейдж-текст: hasRealization ? «из реализации» : «вручную»
       (span text-[10px] text-muted-foreground; при hasRealization можно добавить
       title «Значение пула взято из отчёта реализации WB; ручное поле — fallback»).
       Инпуты НЕ дизейблить (manual остаётся редактируемым fallback'ом).
    6. tests/finance-weekly-realization.test.ts — по behavior.
    ⚠ lib/finance-weekly/engine.ts НЕ ТРОГАТЬ ВООБЩЕ (гейт: git diff пуст).
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run tests/finance-weekly-realization.test.ts tests/wb-realization-classify.test.ts tests/finance-weekly-engine.test.ts tests/finance-weekly-plan-fact.test.ts tests/finance-weekly-attribution.test.ts tests/finance-weekly-credit-accrual.test.ts tests/pricing-math.test.ts && git diff --exit-code lib/finance-weekly/engine.ts</automated>
  </verify>
  <done>
    Существующие 5 файлов finance-weekly/pricing (83 теста) + 2 новых файла зелёные;
    engine.ts diff пуст; tsc чист. Коммит:
    `feat(quick-260710-jgs): ИУ-факт реализации в /finance/weekly (отзывы, логистика, пулы) + бейдж источника`.
    Затем `git push origin main`.
  </done>
</task>

</tasks>

<verification>
- `npx prisma generate` — чисто (новая модель валидна)
- `npx tsc --noEmit` — чисто
- `npx vitest run tests/wb-realization-classify.test.ts tests/finance-weekly-realization.test.ts tests/finance-weekly-engine.test.ts tests/finance-weekly-plan-fact.test.ts tests/finance-weekly-attribution.test.ts tests/finance-weekly-credit-accrual.test.ts tests/pricing-math.test.ts` — всё зелёное
- `git diff --exit-code lib/finance-weekly/engine.ts` — пусто (std-сценарий не тронут)
- Полный suite НЕ гейт (~42 известных чужих падения — НЕ чинить)
- grep-чеки key_links: `wb-realization-sync` в WeeklyFinReportControls; `wbRealizationWeekly.findMany` в data.ts; `wb-realization-weekly` в dispatch/route.ts; `finance-reports` в wb-cooldown.ts и wb-realization-api.ts
- Ни одного реального вызова WB API из задач; НЕ деплоить (оркестратор: deploy.sh применит миграцию, затем первый синк)
</verification>

<success_criteria>
- WbRealizationWeekly (@@unique weekStart+nmId, nmId=0 = account-level) + hand-written миграция
- Клиент list/detailed: деньги-строки → parseMoney, reportId → string (BigInt-guard), пагинация rrdId→204, cooldown bucket 'finance-reports' (отдельный от 'finance'), 1 retry на 429 по Retry-After, 401 → понятная ошибка про scope/тип токена
- classifyRealizationRow pure + тесты: 8 бакетов + unknown→deductionOther
- POST /api/wb-realization-sync (FINANCE MANAGE, body {week}, clean-replace недели) + кнопка «Реализация WB» (canManage, week из URL, лоадер/тост) + крон вторник 05:50 МСК в dispatcher (прошлая ISO-неделя, Tuesday-guard)
- data.ts: при наличии реализации — reviewWriteoffTotal (nmId + account-level доля по выручке), logisticsIuPerUnit=deliveryRub/qty (guard qty=0), пулы storage/acceptance per universe замещают manual (manual = fallback); бейдж источника в редакторе пулов; promotionRub только хранится; std-сценарий не изменён
- 3 атомарных коммита (git add -A), push origin main; деплой и первый реальный синк — вне скоупа (оркестратор)
</success_criteria>

<output>
После завершения создать `.planning/quick/260710-jgs-w1-wb-sales-reports-n-iu/260710-jgs-SUMMARY.md`
</output>
