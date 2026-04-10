---
phase: 07-prices-wb
plan: 05
subsystem: prices-wb
tags: [server-actions, zod, rbac, pricing, prisma-upsert]
requires:
  - app/actions/pricing.ts → prisma models (AppSetting, CalculatedPrice, Product, Subcategory, Category)
  - app/actions/pricing.ts → lib/rbac.ts requireSection("PRICES", ...)
  - lib/pricing-schemas.ts → zod@4.3.6
provides:
  - app/actions/pricing.ts (7 server actions для Phase 7)
  - lib/pricing-schemas.ts (pure Zod schemas + AppSettingKey whitelist)
affects:
  - tests/pricing-settings.test.ts (RED → GREEN, 7/7)
tech-stack:
  added: []
  patterns:
    - "'use server' + requireSection + revalidatePath (стандартный Phase 4 pattern)"
    - "Zod safeParse → ActionResult<T> union (ok: true | ok: false + error на русском)"
    - "Prisma upsert по compound unique (wbCardId_slot)"
    - "Pure schema module вне 'use server' — позволяет vitest тестировать без загрузки auth chain"
key-files:
  created:
    - app/actions/pricing.ts
    - lib/pricing-schemas.ts
  modified:
    - tests/pricing-settings.test.ts
decisions:
  - "Zod-схемы вынесены в lib/pricing-schemas.ts, а не живут в app/actions/pricing.ts (Next.js 15 'use server' файлы экспортируют только async функции)"
  - "Тест импортирует схемы из @/lib/pricing-schemas вместо @/app/actions/pricing — иначе vitest загружает весь auth chain и падает на next-auth"
  - "Prisma JSON field snapshot передаётся как `as never` — устоявшийся паттерн в проекте (см. app/api/wb-promotions-sync/route.ts:75)"
  - "appSettingValueSchema использует строгий regex /^-?\\d+(\\.\\d+)?$/ — отклоняет '2.0%' и пробелы без полагания на parseFloat()"
metrics:
  duration: 7min
  tasks_completed: 1
  files_touched: 3
  completed: 2026-04-10
---

# Phase 07 Plan 05: Pricing Server Actions Summary

**TL;DR:** Создан централизованный серверный слой `app/actions/pricing.ts` с 7 actions для управления глобальными ставками, расчётными ценами и override-полями товаров/подкатегорий/категорий; чистые Zod-схемы вынесены в `lib/pricing-schemas.ts` чтобы тесты могли их импортировать без auth chain.

## What Changed

### Созданные файлы

**`app/actions/pricing.ts`** (330 строк) — Phase 7 server actions:

| # | Action                     | RBAC               | Prisma операция                           | revalidatePath   |
| - | -------------------------- | ------------------ | ----------------------------------------- | ---------------- |
| 1 | `getPricingSettings()`     | `PRICES` (VIEW)    | `appSetting.findMany` + fallback defaults | —                |
| 2 | `updateAppSetting`         | `PRICES` (MANAGE)  | `appSetting.upsert` по ключу              | `/prices/wb`     |
| 3 | `saveCalculatedPrice`      | `PRICES` (MANAGE)  | `calculatedPrice.upsert` по `wbCardId_slot` | `/prices/wb`   |
| 4 | `updateProductOverride`    | `PRICES` (MANAGE)  | `product.update` (drrOverridePct / defectRateOverridePct) | `/prices/wb` |
| 5 | `updateSubcategoryDefault` | `PRICES` (MANAGE)  | `subcategory.update` (defaultDrrPct)      | `/prices/wb`     |
| 6 | `updateCategoryDefault`    | `PRICES` (MANAGE)  | `category.update` (defaultDefectRatePct)  | `/prices/wb`     |
| 7 | `updateProductDelivery`    | `PRICES` (MANAGE)  | `product.update` (deliveryCostRub)        | `/prices/wb`     |

Каждый action:
- Первая строка — `await requireSection(...)` внутри try/catch → `handleAuthError` нормализует UNAUTHORIZED/FORBIDDEN в русские сообщения.
- Zod `safeParse` → `{ ok: false, error: issues[0].message }` без throw.
- Внутри try/catch прокидывает `(e as Error).message` в user-facing результат.
- `revalidatePath("/prices/wb")` после любой успешной записи.

**`lib/pricing-schemas.ts`** (89 строк) — pure Zod модуль:
- `APP_SETTING_KEYS` — кортеж 6 whitelisted ключей (`wbWalletPct`, `wbAcquiringPct`, `wbJemPct`, `wbCreditPct`, `wbOverheadPct`, `wbTaxPct`)
- `APP_SETTING_DEFAULTS` — fallback значения (2.0 / 2.7 / 1.0 / 7.0 / 6.0 / 8.0)
- `AppSettingKey` — literal union type
- `isValidAppSettingKey(key: string): key is AppSettingKey` — type guard для защиты от injection
- `appSettingValueSchema` — z.string() с regex `/^-?\d+(\.\d+)?$/` + `[0, 100]` refinement
- `slotSchema` — `z.number().int().min(1).max(3)`
- `saveCalculatedPriceSchema` — 9 полей + `snapshot: z.record(z.string(), z.any())`
- `updateProductOverrideSchema` — `productId` + `field` enum + `value [0, 100] | null`

### Изменённые файлы

**`tests/pricing-settings.test.ts`** — import path: `@/app/actions/pricing` → `@/lib/pricing-schemas`. Тесты логически идентичны. **7/7 GREEN**.

## RBAC Matrix

| Action                     | VIEWER (без PRICES) | VIEWER с PRICES:VIEW | MANAGER с PRICES:MANAGE | SUPERADMIN |
| -------------------------- | :-----------------: | :------------------: | :---------------------: | :--------: |
| `getPricingSettings`       |         403         |          OK          |           OK            |     OK     |
| `updateAppSetting`         |         403         |         403          |           OK            |     OK     |
| `saveCalculatedPrice`      |         403         |         403          |           OK            |     OK     |
| `updateProductOverride`    |         403         |         403          |           OK            |     OK     |
| `updateSubcategoryDefault` |         403         |         403          |           OK            |     OK     |
| `updateCategoryDefault`    |         403         |         403          |           OK            |     OK     |
| `updateProductDelivery`    |         403         |         403          |           OK            |     OK     |

SUPERADMIN всегда проходит (bypass в `requireSection`).

## Usage Examples

### Клиентский компонент `GlobalRatesBar` (план 07-07)

```typescript
"use client"
import { updateAppSetting, getPricingSettings } from "@/app/actions/pricing"
import { useDebouncedCallback } from "use-debounce"

const debouncedSave = useDebouncedCallback(async (key: string, value: string) => {
  const res = await updateAppSetting(key, value)
  if (!res.ok) toast.error(res.error)
}, 500)

// onChange input → debouncedSave("wbWalletPct", "2.5")
```

### RSC страница `/prices/wb` (план 07-08)

```typescript
import { getPricingSettings } from "@/app/actions/pricing"

export default async function PricesWbPage() {
  const rates = await getPricingSettings()
  if (!rates.ok) redirect("/dashboard")
  // rates.data = { wbWalletPct: 2, wbAcquiringPct: 2.7, ... }
}
```

### Модалка `PricingCalculatorDialog` (план 07-09)

```typescript
import {
  saveCalculatedPrice,
  updateProductOverride,
  updateSubcategoryDefault,
  updateProductDelivery,
} from "@/app/actions/pricing"

// Сохранить расчёт в слот 2:
await saveCalculatedPrice({
  wbCardId: card.id,
  slot: 2,
  name: "Скидка 40%",
  sellerPrice: 1200,
  drrPct: 8.5,
  defectRatePct: 3.0,
  deliveryCostRub: 30,
  snapshot: { /* полные входные параметры + 6 глобальных ставок */ },
})

// Обновить ДРР "только этот товар":
await updateProductOverride({
  productId: product.id,
  field: "drrOverridePct",
  value: 9.5,
})

// Обновить ДРР подкатегории:
await updateSubcategoryDefault(subcategoryId, 9.5)

// Обновить доставку товара:
await updateProductDelivery(productId, 45)
```

## Verification

**Automated:**
- `npx vitest run tests/pricing-settings.test.ts` → **7/7 passed** (Test Files: 1 passed, Tests: 7 passed, 215ms)
- `npx tsc --noEmit` → **clean** (0 errors)

**Manual counts:**
- `grep -c "export async function" app/actions/pricing.ts` → **7** (все actions)
- `grep "requireSection" app/actions/pricing.ts | wc -l` → **8** (1 import + 7 runtime calls)
- `grep "revalidatePath" app/actions/pricing.ts | wc -l` → **7** (1 import + 6 write-action calls; `getPricingSettings` не ревалидирует)
- `grep -c "export" lib/pricing-schemas.ts` → **8** (APP_SETTING_KEYS, AppSettingKey, APP_SETTING_DEFAULTS, isValidAppSettingKey, appSettingValueSchema, slotSchema, saveCalculatedPriceSchema, updateProductOverrideSchema)

## Deviations from Plan

### [Rule 3 – Blocking] Pure Zod schemas вынесены в `lib/pricing-schemas.ts`

- **Found during:** Task 1 verification
- **Issue:** План говорил экспортировать `appSettingValueSchema` и `isValidAppSettingKey` напрямую из `app/actions/pricing.ts`. Но Next.js 15 `"use server"` файлы могут экспортировать только async функции (синхронные экспорты вызывают build error). Дополнительно: даже если бы это компилировалось, vitest не может загружать `app/actions/pricing.ts`, потому что цепочка импортов `prisma → rbac → auth → next-auth` падает на `next/server` resolution в non-Next runtime.
- **Fix:**
  1. Создан `lib/pricing-schemas.ts` с чистыми Zod-схемами, whitelisted ключами, type guard, defaults.
  2. `app/actions/pricing.ts` импортирует схемы из `@/lib/pricing-schemas` и использует их для `safeParse`.
  3. `tests/pricing-settings.test.ts` импортирует `appSettingValueSchema` и `isValidAppSettingKey` из `@/lib/pricing-schemas` вместо `@/app/actions/pricing`.
- **Why it's correct:** Source of truth для схем — один модуль (`lib/pricing-schemas.ts`). Actions и тесты импортируют одни и те же instance'ы — нет дрифта. Это стандартный Next.js pattern "shared pure utilities in lib/".
- **Files modified:** `app/actions/pricing.ts`, `lib/pricing-schemas.ts` (new), `tests/pricing-settings.test.ts`
- **Commit:** 1f71190

### [Rule 3 – Blocking] Zod 4 API change: `z.record()` требует 2 аргумента

- **Found during:** `npx tsc --noEmit` первый прогон
- **Issue:** План использовал `z.record(z.any())` для `saveCalculatedPriceSchema.snapshot`, но в zod@4.3.6 `z.record()` требует `(keySchema, valueSchema)`.
- **Fix:** `z.record(z.string(), z.any())` в `lib/pricing-schemas.ts`
- **Commit:** 1f71190

### [Rule 3 – Blocking] Prisma JSON InputJsonValue strict typing

- **Found during:** `npx tsc --noEmit` первый прогон
- **Issue:** Prisma 6 `Json` поля ожидают `InputJsonValue` (рекурсивный тип), а `Record<string, any>` из Zod не type-compatible → `TS2322: Type 'Record<any, unknown>' is not assignable to type 'JsonNull | InputJsonValue'`.
- **Fix:** Cast `snapshot: parsed.data.snapshot as never` в create/update ветках `calculatedPrice.upsert`. Это устоявшийся паттерн в проекте — см. `app/api/wb-promotions-sync/route.ts:75` где `rangingJson: (d.ranging ?? undefined) as never` с комментарием «Prisma Json field: передаём как unknown чтобы обойти strict типы InputJsonValue».
- **Commit:** 1f71190

### [Rule 2 – Missing validation] Regex guard в `appSettingValueSchema`

- **Found during:** Task 1 написание
- **Issue:** Оригинальная схема в плане полагалась только на `parseFloat(s)` и `!Number.isNaN`, но `parseFloat("2.0%")` возвращает `2` (не NaN), что проходит валидацию, а тест `"2.0%" → success=false` требует отклонения.
- **Fix:** Добавлен `z.refine()` c regex `/^-?\d+(\.\d+)?$/` перед проверкой диапазона — строгое ограничение формата на «только число».
- **Commit:** 1f71190

## Deferred Issues

Нет. Все 7 тестов GREEN, TypeScript clean.

## Known Stubs

Нет. Все actions полностью реализованы с валидацией, RBAC guard'ами и revalidatePath.

## Files Summary

```
created:
  app/actions/pricing.ts      (~330 lines, 7 server actions)
  lib/pricing-schemas.ts      (~89 lines, pure Zod module)

modified:
  tests/pricing-settings.test.ts  (import path → @/lib/pricing-schemas)
```

## Dependencies Unlocked

- **Plan 07-07** (GlobalRatesBar): может импортировать `updateAppSetting` + `getPricingSettings`, использовать debounce 500ms на изменение input.
- **Plan 07-08** (RSC page `/prices/wb`): `getPricingSettings()` → initial render 6 ставок.
- **Plan 07-09** (PricingCalculatorDialog): `saveCalculatedPrice`, `updateProductOverride`, `updateSubcategoryDefault`, `updateCategoryDefault`, `updateProductDelivery` — полный набор для модалки с чекбоксом «только этот товар».
- **Plan 07-10+** (тесты integration): могут использовать `lib/pricing-schemas` напрямую без загрузки server runtime.

## Self-Check

- [x] `app/actions/pricing.ts` — FOUND (1f71190)
- [x] `lib/pricing-schemas.ts` — FOUND (1f71190)
- [x] `tests/pricing-settings.test.ts` — MODIFIED (1f71190)
- [x] Commit `1f71190` — FOUND в git log
- [x] vitest — 7/7 passed
- [x] tsc --noEmit — 0 errors

## Self-Check: PASSED
