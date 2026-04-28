---
phase: 16-wb-stock-sizes
plan: 04
subsystem: api
tags: [server-actions, prisma, zod, rbac, per-user-prefs, stock-wb]

# Dependency graph
requires:
  - phase: 16-wb-stock-sizes
    provides: "User.stockWbShowSizes Boolean column (Plan 16-01)"
  - phase: 16-wb-stock-sizes
    provides: "Extended WbStockRow types (Plan 16-03)"
provides:
  - "Server action saveStockWbShowSizes(value: boolean)"
  - "RSC чтение per-user stockWbShowSizes из session + prop drilling в StockWbTable"
  - "Unit-тесты для server action (5 cases)"
affects: [16-05, ui, stock-wb]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-user UI настройка через User.stockWbShowSizes (Boolean) — паттерн идентичен stockWbHiddenWarehouses (quick 260422-oy5)"
    - "Named Zod schema constant (ShowSizesSchema) на module level — НЕ inline в safeParse (B4)"

key-files:
  created:
    - "tests/stock-wb-actions.test.ts — unit-тесты server action"
  modified:
    - "app/actions/stock-wb.ts — добавлен saveStockWbShowSizes + ShowSizesSchema + SaveStockWbShowSizesResult"
    - "app/(dashboard)/stock/wb/page.tsx — extended select + initialShowSizes prop"

key-decisions:
  - "Named ShowSizesSchema constant — z.object({ value: z.boolean() }) объявлена top-level, не inline в safeParse"
  - "RBAC requireSection('STOCK') без MANAGE — user меняет свою preference"
  - "Возврат { ok: true } | { ok: false, error: string } — паттерн existing saveStockWbHiddenWarehouses"
  - "vi.hoisted паттерн моков (auth + prisma + revalidatePath + requireSection) — подход stock-actions.test.ts"

patterns-established:
  - "Per-user Boolean toggle через User.X Boolean @default(false) + server action z.object({ value: z.boolean() })"
  - "Изоляция constants Zod-схем как module-level const (не inline) для grep-able acceptance"

requirements-completed: [STOCK-35]

# Metrics
duration: 6min
completed: 2026-04-28
---

# Phase 16 Plan 04: Per-user toggle saveStockWbShowSizes Summary

**Server action saveStockWbShowSizes(value: boolean) + RSC prop drilling initialShowSizes для кнопки «По размерам» на /stock/wb (паттерн quick 260422-oy5)**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-28T11:26:55Z
- **Completed:** 2026-04-28T11:32:51Z
- **Tasks:** 2 (TDD: RED + GREEN + Task 2)
- **Files modified:** 3 (app/actions/stock-wb.ts, app/(dashboard)/stock/wb/page.tsx, tests/stock-wb-actions.test.ts)

## Accomplishments

- **Server action `saveStockWbShowSizes(value: boolean)`** в `app/actions/stock-wb.ts`:
  - Named Zod `ShowSizesSchema = z.object({ value: z.boolean() })` (B4 — top-level const, не inline)
  - RBAC `requireSection("STOCK")` без MANAGE (user меняет свою preference)
  - `prisma.user.update` с `data: { stockWbShowSizes: parsed.data.value }`
  - `revalidatePath("/stock/wb")` после успеха
  - Возвращает `{ ok: true } | { ok: false, error: string }`
- **RSC `app/(dashboard)/stock/wb/page.tsx`**:
  - Extended `prisma.user.findUnique` select полем `stockWbShowSizes: true`
  - `let initialShowSizes = false` declaration + `initialShowSizes = user?.stockWbShowSizes ?? false` read
  - Передаёт prop `initialShowSizes={initialShowSizes}` в `<StockWbTable />`
- **Unit-тесты `tests/stock-wb-actions.test.ts`** — 5 GREEN test cases:
  - `value=true → ok + prisma.user.update + revalidatePath`
  - `value=false → ok + prisma.user.update`
  - `unauthenticated (auth() returns null) → { ok: false, error: 'Не авторизован' }, no update`
  - `invalid input "yes" → { ok: false, error: 'Некорректные данные' }, no update`
  - `DB error (prisma rejects) → { ok: false, error: 'Connection refused' }, no revalidate`

## Task Commits

1. **Task 1 RED: failing tests for saveStockWbShowSizes** — `5e08364` (test)
2. **Task 1 GREEN: saveStockWbShowSizes server action** — `7c19a75` (feat)
3. **Task 2: page.tsx читает stockWbShowSizes + prop drilling** — `c96af9d` (feat)

## Files Created/Modified

- `app/actions/stock-wb.ts` — добавлены `ShowSizesSchema` (named const), `SaveStockWbShowSizesResult` type, `saveStockWbShowSizes(value)` server action
- `app/(dashboard)/stock/wb/page.tsx` — extended `select` + `let initialShowSizes` + `initialShowSizes` prop
- `tests/stock-wb-actions.test.ts` — новый файл, 5 unit-тестов с vi.hoisted моками (auth, prisma, requireSection, revalidatePath)

## Decisions Made

- **Named ShowSizesSchema constant (B4):** Zod-схема объявлена как top-level `const ShowSizesSchema = z.object({ value: z.boolean() })`, не inline в safeParse. Это enforced acceptance criterion `grep -c "ShowSizesSchema" >= 2` (определение + использование) и обеспечивает grep-friendliness для будущих рефакторингов.
- **RBAC без MANAGE:** `requireSection("STOCK")` — user меняет свою preference, не админскую настройку (паттерн quick 260422-oy5).
- **vi.hoisted моки:** Использован паттерн `tests/stock-actions.test.ts` (Phase 14) — единый объект моков создаётся в `vi.hoisted()`, доступен в `vi.mock()` factories через замыкание.

## Deviations from Plan

None — план выполнен точно как написан. Все acceptance criteria выполнены:

- `grep -c "export async function saveStockWbShowSizes" app/actions/stock-wb.ts` == 1 ✓
- `grep -c "ShowSizesSchema" app/actions/stock-wb.ts` == 2 (определение + использование) ✓
- `grep -c "z.boolean()" app/actions/stock-wb.ts` == 1 ✓
- `grep -c "stockWbShowSizes: parsed.data.value" app/actions/stock-wb.ts` == 1 ✓
- `grep -c "saveStockWbHiddenWarehouses" app/actions/stock-wb.ts` == 2 (старый action + type — не сломан) ✓
- `tests/stock-wb-actions.test.ts` существует ✓
- `grep -c "saveStockWbShowSizes" tests/stock-wb-actions.test.ts` == 9 (>= 5) ✓
- `grep -c "it(" tests/stock-wb-actions.test.ts` == 5 ✓
- `npm run test -- tests/stock-wb-actions.test.ts` exit 0 (все 5 GREEN) ✓
- `grep -c "stockWbShowSizes: true" "app/(dashboard)/stock/wb/page.tsx"` == 1 ✓
- `grep -c "user?.stockWbShowSizes" "app/(dashboard)/stock/wb/page.tsx"` == 1 ✓
- `grep -c "initialShowSizes" "app/(dashboard)/stock/wb/page.tsx"` == 3 (>= 2) ✓
- `grep -c "stockWbHiddenWarehouses: true" "app/(dashboard)/stock/wb/page.tsx"` == 1 (старый select сохранён) ✓
- `grep -c "hiddenWarehouseIds={hiddenWarehouseIds}" "app/(dashboard)/stock/wb/page.tsx"` == 1 (старый prop сохранён) ✓

## Issues Encountered

**TypeScript error на initialShowSizes prop — ОЖИДАЕМО per plan note.**

`npx tsc --noEmit` показывает:

```
app/(dashboard)/stock/wb/page.tsx(52,9): error TS2322: ... Property 'initialShowSizes' does not exist on type 'IntrinsicAttributes & Props'.
```

Это явно описано в плане 16-04:

> Заметка: после Plan 16-05 `StockWbTable` Props примет `initialShowSizes: boolean`.
> Параллельность планов 04 и 05 поддерживается тем что:
> - Если выполняется ТОЛЬКО 04 — TypeScript error «property initialShowSizes does not exist on Props» — это ОК, так как 05 параллельно расширяет интерфейс

После landing Plan 16-05 (extends `interface Props` полем `initialShowSizes: boolean`) ошибка исчезнет.

Также `npx tsc --noEmit` показывает второй (не относящийся к 16-04) error в `app/api/wb-sync/route.ts` про `wbCardId_warehouseId` — это побочный эффект Plan 16-01 (новый unique key `(wbCardId, warehouseId, techSize)`) и будет исправлено в Plan 16-02 (sync code update).

## User Setup Required

None — изменения на уровне server action и RSC, не требуют env vars или внешней конфигурации.

## Next Phase Readiness

- **Plan 16-05** (UI кнопка «По размерам»): импортирует `saveStockWbShowSizes` из `app/actions/stock-wb` для optimistic toggle button + расширит `StockWbTable` Props полем `initialShowSizes: boolean`
- **Финальная сборка** (после landing Plan 16-05): page.tsx передаёт session-derived `initialShowSizes` в UI, кнопка вызывает action с optimistic update
- **Готов к параллельному выполнению** с Plan 16-05 (разные файлы, контракт — prop `initialShowSizes: boolean`)

## Self-Check: PASSED

**Files exist:**
- `app/actions/stock-wb.ts` — FOUND ✓
- `app/(dashboard)/stock/wb/page.tsx` — FOUND ✓
- `tests/stock-wb-actions.test.ts` — FOUND ✓

**Commits exist:**
- `5e08364` (test RED) — FOUND ✓
- `7c19a75` (feat GREEN) — FOUND ✓
- `c96af9d` (feat page.tsx) — FOUND ✓

**Tests:** 5/5 GREEN

---
*Phase: 16-wb-stock-sizes*
*Completed: 2026-04-28*
