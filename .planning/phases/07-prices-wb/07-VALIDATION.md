---
phase: 7
slug: prices-wb
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` (устанавливается в Wave 0 — текущий `package.json` не содержит test framework) |
| **Config file** | `vitest.config.ts` (Wave 0 создаёт) |
| **Quick run command** | `npm run test -- tests/pricing-math.test.ts` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~5-10 секунд (2 unit suites + 3 integration mocked) |

**Обоснование vitest:** проект на Next.js 15 + Vite-style tooling стандартно работает с vitest. Минимум 1 MB deps. Альтернатива — standalone tsx script без framework — отклонена потому что будущим фазам тесты всё равно потребуются.

---

## Sampling Rate

- **After every task commit:** `npm run test -- tests/pricing-math.test.ts` (< 2 сек — golden test + fallback chain)
- **After every plan wave:** `npm run test` (full suite: math + settings + api-mocked + excel parser — < 10 сек)
- **Before `/gsd:verify-work`:** Full suite должна быть зелёной
- **Max feedback latency:** 10 секунд

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-00-01 | 00-infra | 0 | VITEST-SETUP | install | `npm run test -- --version` | ❌ W0 creates | ⬜ pending |
| 07-00-02 | 00-infra | 0 | WB-PROMO-SMOKE | manual curl | `curl https://dp-calendar-api.wildberries.ru/api/v1/calendar/promotions?limit=1 -H "Authorization: $TOKEN"` | ❌ W0 | ⬜ pending |
| 07-00-03 | 00-infra | 0 | EXCEL-FORMULAS | manual read | Planner читает `C:/Users/User/Desktop/Форма управления ценами.xlsx` + 30 заголовков + golden test values → константы в `tests/pricing-math.test.ts` | ❌ W0 | ⬜ pending |
| 07-01-01 | 01-db | 1 | PRICES-01 (schema) | migration | `npx prisma migrate dev --name prices_wb` (dev), `npx prisma migrate deploy` (prod) | ❌ W1 | ⬜ pending |
| 07-01-02 | 01-db | 1 | PRICES-01 (seed defaults) | manual | SQL: `SELECT * FROM "AppSetting"` → 6 глобальных ставок | ❌ W1 | ⬜ pending |
| 07-02-01 | 02-math | 1 | PRICES-05 (golden) | unit | `npm run test -- tests/pricing-math.test.ts` | ❌ W0 stub, W1 impl | ⬜ pending |
| 07-02-02 | 02-math | 1 | PRICES-05 (zero-guard) | unit | `npm run test -- tests/pricing-math.test.ts::zero-guard` | ❌ W0 stub, W1 impl | ⬜ pending |
| 07-02-03 | 02-math | 1 | PRICES-05 (fallback chain) | unit | `npm run test -- tests/pricing-fallback.test.ts` | ❌ W0 stub, W1 impl | ⬜ pending |
| 07-03-01 | 03-wb-api | 2 | PRICES-10 (batches + rate limit) | integration (mocked) | `npm run test -- tests/wb-promotions-api.test.ts` | ❌ W0 stub, W2 impl | ⬜ pending |
| 07-03-02 | 03-wb-api | 2 | PRICES-10 (429 handling) | manual | Ручной вызов `/api/wb-promotions-sync` при rate limit hit | — | ⬜ pending |
| 07-03-03 | 03-wb-api | 2 | PRICES-12 (avgSalesSpeed7d) | manual | DB query после `/api/wb-sync`: `SELECT avgSalesSpeed7d FROM WbCard WHERE nmId = ...` | — | ⬜ pending |
| 07-04-01 | 04-actions | 3 | PRICES-06 (Zod settings) | unit | `npm run test -- tests/pricing-settings.test.ts` | ❌ W0 stub, W3 impl | ⬜ pending |
| 07-04-02 | 04-actions | 3 | PRICES-08 (CalculatedPrice upsert) | manual | 2× save на slot 1 → 1 запись, не дубль. SQL verify | — | ⬜ pending |
| 07-04-03 | 04-actions | 3 | PRICES-09 (override scope) | manual | Toggle «только товар» → Product.drrOverridePct; off → Subcategory.defaultDrrPct | — | ⬜ pending |
| 07-04-04 | 04-actions | 3 | PRICES-11 (Excel parser) | integration (real file) | `npm run test -- tests/excel-auto-promo.test.ts` (fixture в `tests/fixtures/`) | ❌ W0 stub, W3 impl | ⬜ pending |
| 07-05-01 | 05-page | 4 | PRICES-01 (only linked cards) | e2e manual | `/prices/wb` показывает только cards с зелёной галочкой | — | ⬜ pending |
| 07-05-02 | 05-page | 4 | PRICES-02 (rowSpan) | visual | 1 product с 3 WbCard → корректный rowSpan Photo+Summary | — | ⬜ pending |
| 07-05-03 | 05-page | 4 | PRICES-03 (sticky) | visual | Горизонтальный скролл → первые 4 колонки остаются | — | ⬜ pending |
| 07-06-01 | 06-modal | 5 | PRICES-04 (click → open) | visual | Клик по ценовой строке → модалка с initial values | — | ⬜ pending |
| 07-06-02 | 06-modal | 5 | PRICES-07 (realtime < 100ms) | visual | Input в Цена продавца → Прибыль обновляется мгновенно | — | ⬜ pending |
| 07-07-01 | 07-ozon | 6 | PRICES-13 (ComingSoon) | visual | `/prices/ozon` → `<ComingSoon sectionName="Управление ценами Ozon" />` | — | ⬜ pending |
| 07-08-01 | 08-rbac | 6 | PRICES-14 (RBAC MANAGE) | manual | VIEWER user → updateAppSetting → FORBIDDEN | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

**Critical setup блоки — должны быть выполнены ДО любого кода Wave 1+:**

- [ ] **Vitest installation** — `npm i -D vitest @vitest/ui`, добавить `scripts.test = "vitest run"`, `scripts["test:watch"] = "vitest"`
- [ ] **vitest.config.ts** — минимальная конфигурация с `test.include = ["tests/**/*.test.ts"]`, `test.environment = "node"`
- [ ] **tests/fixtures/auto-promo-sample.xlsx** — скопировать из `C:/Users/User/Downloads/Товары для исключения из акции_Весенняя распродажа_ бустинг продаж (автоматические скидки)_09.04.2026 16.37.31.xlsx`
- [ ] **tests/pricing-math.test.ts** — stub с golden test case nmId 800750522:
  ```typescript
  import { describe, it, expect } from "vitest"
  import { calculatePricing } from "@/lib/pricing-math"

  describe("calculatePricing — golden test nmId 800750522", () => {
    it("returns profit ≈ 567.68 rub for known inputs", () => {
      const result = calculatePricing({
        priceBeforeDiscount: 25833,
        sellerDiscountPct: 70,
        wbDiscountPct: 25,
        clubDiscountPct: 0,
        commFbwPct: 32.58,
        drrPct: 10,
        walletPct: 2,
        acquiringPct: 2.7,
        jemPct: 1,
        costPrice: 2204,
        defectRatePct: 2,
        deliveryCostRub: 30,
        creditPct: 7,
        overheadPct: 6,
        taxPct: 8,
      })
      expect(result.sellerPrice).toBeCloseTo(7749.9, 1)
      expect(result.priceAfterWbDiscount).toBeCloseTo(5812.425, 2)
      expect(result.profit).toBeCloseTo(567.68, 1)
      expect(result.returnOnSalesPct).toBeCloseTo(7, 0)
      expect(result.roiPct).toBeCloseTo(26, 0)
    })
  })
  ```
- [ ] **tests/pricing-fallback.test.ts** — stub: override > default > hardcoded chain
- [ ] **tests/pricing-settings.test.ts** — stub: Zod rejects 200% walletPct
- [ ] **tests/wb-promotions-api.test.ts** — stub: mock `fetch`, assert 600ms delays
- [ ] **tests/excel-auto-promo.test.ts** — stub: read fixture, parse 6 columns

---

## Manual-Only Verifications

Эти проверки нельзя автоматизировать — требуют визуальной/ручной валидации.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| rowSpan выглядит правильно | PRICES-02 | Визуальный layout, требует реального рендера | Зайти на `/prices/wb`, найти Product с 2+ WbCard, убедиться что Фото+Сводка объединены на все строки |
| Sticky колонки при horizontal scroll | PRICES-03 | CSS layout behavior | Скролл вправо → первые 4 колонки не уходят |
| Клик по строке → модалка с correct initial | PRICES-04 | Интеракция + визуальный state | Клик на «Акция X» строку → модалка открывается с planPrice как initial sellerPrice |
| Realtime пересчёт < 100ms | PRICES-07 | Performance + UX | Изменить input Цена продавца → Прибыль обновляется мгновенно (без debounce) |
| Tooltip на названии акции | PRICES-15 | Hover интеракция | Навести курсор на название акции → всплывает description + advantages |
| Подсветка Прибыль/Re/ROI | PRICES-16 | Визуальный | Проверить: прибыль ≥0 — зелёный, <0 — красный |
| Auto-promo Excel upload end-to-end | PRICES-11 | Requires real WB report file + select promotion | Загрузить реальный Excel из кабинета WB → auto-акция появляется в таблице с planPrice |
| WB Promotions sync rate limit | PRICES-10 | Real API с rate limits | Вручную вызвать `/api/wb-promotions-sync` → 83+ акций загружаются без 429 |
| Глобальные ставки сохраняются между сессиями | PRICES-06 | State persistence | Изменить walletPct → обновить страницу → значение восстановлено |

---

## Flaky Tests

Не ожидается в Wave 0 (unit + mocked).

Возможные flaky в будущем (после Wave 3+):
- `tests/wb-promotions-api.test.ts` при реальных API вызовах (не mocked) — зависит от WB rate limits
- E2E тесты если будут добавлены (зависят от БД state)

---

## Coverage Gaps

Отсутствует автоматическое покрытие:
- **Visual regression** — rowSpan, sticky, responsive layout не тестируются unit-тестами
- **React component tests** — нет @testing-library/react (можно добавить в Wave 0 Option B)
- **E2E** — нет Playwright/Cypress (не в scope Phase 7)

**Мейн стратегия:** comprehensive unit coverage для pure функций (pricing-math), mocked integration для WB API, manual visual для UI interactions. Phase 7 UI покрывается визуальной проверкой в `/gsd:verify-work`.

---

## Dependencies

**New dev dependencies для Wave 0:**

```bash
npm i -D vitest @vitest/ui
```

- `vitest@^2.x` — runner + assertion library (1 MB)
- `@vitest/ui@^2.x` — опционально, UI dashboard для debug (200 KB)

**Existing production dependencies используемые в тестах:**
- `xlsx` — для excel parser тестов (уже установлен)
- `zod` — для settings validation тестов (уже установлен)

---

*Validation strategy: Phase 7 prices-wb*
*Generated: 2026-04-09*
