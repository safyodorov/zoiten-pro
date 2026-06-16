---
phase: quick-260616-vjo
plan: "01"
subsystem: procurement
tags: [procurement, stages, date, stepper, purchases-table]
dependency_graph:
  requires: [260616-uhq]
  provides: [stage-date-field, stepper-date-display, expanded-row-metrics]
  affects: [procurement/purchases, procurement/purchases/[id]]
tech_stack:
  added: []
  patterns: [native-date-input, todayMoscow-helper, per-item-metrics-from-ordered-qty]
key_files:
  created:
    - prisma/migrations/20260616_purchase_stage_date/migration.sql
  modified:
    - prisma/schema.prisma
    - app/actions/purchases.ts
    - components/procurement/PurchaseItemStagesCard.tsx
    - app/(dashboard)/procurement/purchases/[id]/page.tsx
    - app/(dashboard)/procurement/purchases/page.tsx
    - components/procurement/PurchasesTable.tsx
decisions:
  - "Date stored as TIMESTAMP(3) nullable; displayed as yyyy-mm-dd via native input (no new deps)"
  - "todayMoscow() uses en-CA locale + Europe/Moscow timeZone — zero-dep approach from CLAUDE.md"
  - "Per-item metrics use ordered qty (PurchaseItem.quantity), not currentStageQty — consistent with purchase totals"
  - "sumRub shows both ₽ and foreign currency when currency != RUB; RUB-only otherwise"
metrics:
  duration_minutes: 12
  completed_at: "2026-06-16T19:51:38Z"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 6
---

# Quick 260616-vjo: Stage Dates + Expanded Row Metrics Summary

One-liner: Nullable date per purchase-stage progress (stepper display dd.mm.yyyy + date-picker + auto-today on click) plus sum/weight/volume metrics in expanded purchase rows.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Schema + migration + action | 8de3476 | schema.prisma, migration.sql, purchases.ts |
| 2 | Stepper — date per stage | dbff33a | PurchaseItemStagesCard.tsx, [id]/page.tsx |
| 3 | Expanded rows — sum+weight+volume | 3bc3c1c | page.tsx, PurchasesTable.tsx |

## What Was Built

### Task 1: Data layer

- `PurchaseItemStageProgress.date DateTime?` — nullable, no default
- Migration `20260616_purchase_stage_date/migration.sql` — single `ALTER TABLE ... ADD COLUMN "date" TIMESTAMP(3)`
- `StageEntrySchema` extended: `date: z.string().nullable().optional()` (backward-compatible)
- `savePurchaseItemStages` createMany now writes `date: parseDate(e.date)` using the pre-existing `parseDate` helper

### Task 2: Stepper UX

- `ItemStageData.stages` value type extended: `date: string | null`
- `Draft` type extended: `date: string` per stage cell
- `buildDraft` reads existing date from stage data
- `todayMoscow()` helper: `new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" })` — returns `yyyy-mm-dd`
- `handleStageClick`: fills `date=todayMoscow()` for all stages ≤ clicked where date is empty; clears date for stages after clicked
- `save()`: sends `date: cell.date.trim() || null` per entry
- Under each reached segment: `dd.mm.yyyy · N шт` in 9px text (inherits `text-white` from colored segment)
- Current-stage editor: `<input type="date">` column between Qty and Comment
- Hint text updated to mention auto-today

### Task 3: Expanded row metrics

- `page.tsx` per-item `items.map`: computes `sum`, `sumRub`, `itemWeightKg`, `itemVolumeM3` using ordered `i.quantity` and the same `rate` variable in scope
- `PurchaseItemMini` interface extended: `sum?`, `sumRub?`, `currency?`, `weightKg?`, `volumeM3?`
- Expanded sub-rows render: badge(stage) + qty + sum(₽+foreign or local) + formatWeight + formatVolume using existing helpers

## Deviations from Plan

None — plan executed exactly as written.

## Deployment Note

**REQUIRED**: Apply migration on VPS before deploying:
```
cd /opt/zoiten-pro && npx prisma migrate deploy
```
Or via `bash deploy.sh` if deploy.sh includes `prisma migrate deploy`. Without migration, the `date` column does not exist and saves will fail.

## Self-Check

- [x] `prisma/migrations/20260616_purchase_stage_date/migration.sql` — created
- [x] `prisma/schema.prisma` — has `date DateTime?`
- [x] `app/actions/purchases.ts` — has `date: parseDate` and schema extension
- [x] `components/procurement/PurchaseItemStagesCard.tsx` — has todayMoscow, type="date", isReached display
- [x] `app/(dashboard)/procurement/purchases/page.tsx` — has sumRub, itemVolumeM3
- [x] `components/procurement/PurchasesTable.tsx` — has sumRub?, formatVolume(it.volumeM3, formatWeight(it.weightKg
- [x] Commits: 8de3476, dbff33a, 3bc3c1c exist in git log

## Self-Check: PASSED
