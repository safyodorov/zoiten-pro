---
phase: 07-prices-wb
plan: 08
status: complete
completed: 2026-04-10
duration: ~inline (dopolneno after executor hit rate limit)
commits:
  - 72783b8
requirements:
  - PRICES-05
  - PRICES-06
  - PRICES-09
  - PRICES-11
  - PRICES-13
---

# 07-08 — RSC страница /prices/wb

## Что сделано

Временная заглушка `app/(dashboard)/prices/wb/page.tsx` из плана 07-06 заменена на полноценную RSC страницу (395 строк).

### Архитектура загрузки

1. **RBAC guard** — `requireSection("PRICES")` (VIEW достаточно, запись через server actions с MANAGE).
2. **Параллельная загрузка** (`Promise.all`):
   - 6 глобальных ставок (`AppSetting` where key ∈ RATE_KEYS)
   - Активные `WbPromotion` (endDateTime >= now) + `nomenclatures`
   - `MarketplaceArticle` для WB marketplace, с вложенным Product (cost + subcategory + category)
3. **nmId → Product map** — через `parseInt(article.article, 10)`
4. **`WbCard.findMany` + `CalculatedPrice.findMany`** — для собранного списка nmId / wbCardIds

### Построение PriceRow (4 типа)

Для каждого `WbCard` в `Product` группе:

| Тип | Источник | Особенности |
|-----|----------|-------------|
| `current` | `WbCard.priceBeforeDiscount` + `sellerDiscount` | Текущая цена из последней синхронизации |
| `regular` | `WbPromotion` (type ≠ auto) + `WbPromotionNomenclature.planPrice` | Сортируется DESC по sellerPriceBeforeDiscount |
| `auto` | `WbPromotion` (type = auto) + `planPrice` из Excel | Сортируется DESC |
| `calculated` | `CalculatedPrice` (slot 1, 2, 3) | Сортируется ASC по slot; per-calc overrides (drrPct/defectRatePct/deliveryCostRub) с fallback |

### Fallback chain (реализован серверно)

- `drrPct`: `product.drrOverridePct` → `subcategory.defaultDrrPct` → default 0
- `defectRatePct`: `product.defectRateOverridePct` → `category.defaultDefectRatePct` → default 0
- `deliveryCostRub`: `product.deliveryCostRub` → default 0
- Глобальные ставки (wallet/acquiring/jem/credit/overhead/tax): `AppSetting` → `DEFAULT_RATES`

### Агрегаты по Product

- `totalStock` — сумма `stockQty` по всем карточкам
- `totalAvgSalesSpeed` — сумма `avgSalesSpeed7d` по всем карточкам
- `totalRowsInProduct` — для rowSpan в `PriceCalculatorTable`

### Рендер

```tsx
<GlobalRatesBar initialRates={rates} />
<WbSyncButton /> <WbSyncSppButton />
<PriceCalculatorTable groups={groups} />
```

Сортировка `groups` по `product.name` (ru locale) для детерминизма.

## Artifacts created/modified

- `app/(dashboard)/prices/wb/page.tsx` — 395 строк (заменён)

## Key decisions

1. **Промоакции фильтруются на БД-уровне** (`endDateTime >= now`) — серверная фильтрация вместо клиентской.
2. **`baseRowFields` DRY** — общий объект для всех PriceRow типов, чтобы не повторять 10 input-полей.
3. **`currentPriceBeforeDiscount` fallback = 0** — если WbCard не синхронизирован, строка отрисуется с нулевыми полями (не падает).
4. **TODO-комментарии для 07-10** — явные маркеры в JSX где будут кнопки `WbPromotionsSyncButton`, `WbAutoPromoUploadButton` и Alert пустого состояния акций.

## Key-links verified

- `page.tsx` → `GlobalRatesBar` (✓ import)
- `page.tsx` → `PriceCalculatorTable` (✓ import, groups prop)
- `page.tsx` → `calculatePricing` + `resolveDrrPct` + `resolveDefectRatePct` + `resolveDeliveryCostRub` (✓ import)
- `page.tsx` → `prisma.appSetting`, `prisma.wbPromotion`, `prisma.marketplaceArticle`, `prisma.wbCard`, `prisma.calculatedPrice` (✓ все модели из 07-01 доступны)

## Verification

- `npx tsc --noEmit` — **clean** (0 ошибок)
- RBAC: `requireSection("PRICES")` присутствует (stringmatch)
- Все 4 типа PriceRow создаются через `calculatePricing()` с правильными inputs

## Deviations

**Завершение inline (не через executor):** Первый запуск агента упёрся в rate limit после ~2 мин работы. Файл был написан (395 строк), но коммит и SUMMARY.md не успели создаться. Код проверен на TypeScript корректность, отсутствие новых ошибок, соответствие контракту `PriceCalculatorTable.PriceRow` из плана 07-07, и закоммичен вручную в коммит `72783b8`.

## Next

- **07-09** — модалка `PricingCalculatorDialog` (клиентский realtime пересчёт + save в CalculatedPrice). Требует обёртки `PriceCalculatorTableWrapper` для state модалки.
- **07-10** — добавление `WbPromotionsSyncButton` и `WbAutoPromoUploadButton` в шапку этой страницы (TODO-маркеры на местах).
