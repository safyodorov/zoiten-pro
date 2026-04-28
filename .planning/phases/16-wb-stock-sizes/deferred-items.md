# Phase 16 — Deferred Items

Issues discovered during plan execution that are out of scope for the current plan.

## From Plan 16-03 (worktree-agent-a6c817d9)

### tsc error in `app/api/wb-sync/route.ts:240` — pre-existing, fixed by Plan 16-02

**Error:**
```
app/api/wb-sync/route.ts(240,21): error TS2353: Object literal may only specify known properties,
and 'wbCardId_warehouseId' does not exist in type 'WbCardWarehouseStockWhereUniqueInput'.
```

**Root cause:** Plan 16-01 changed the compound unique key on `WbCardWarehouseStock` from `(wbCardId, warehouseId)` to `(wbCardId, warehouseId, techSize)`. The Prisma generated key changed from `wbCardId_warehouseId` to `wbCardId_warehouseId_techSize`. Plan 16-02 (parallel wave 2 with this 16-03 plan) updates `app/api/wb-sync/route.ts` to use the new compound key.

**Status:** This worktree (`agent-a6c817d9`) was created from base before Plan 16-02 was merged. Plan 16-02's commits (e2a83e3, 8a331f6, 42cc86a, f7cdca6) live in a sibling worktree branch (`worktree-agent-a02e0c43` per git log) — they will be merged together into main alongside this plan.

**Action:** No action required from Plan 16-03 — Plan 16-02 fixes this. Once both plans' branches merge into main, the error resolves.

**Verification commands after merge:**
- `npx tsc --noEmit` → exit 0
- `npm run test` → all green
