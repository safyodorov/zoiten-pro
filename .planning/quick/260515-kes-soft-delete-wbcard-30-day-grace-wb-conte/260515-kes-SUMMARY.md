# Quick Task 260515-kes — Soft-delete WbCard + 30-day grace

**Date:** 2026-05-15
**Trigger:** user 313610959 («что нам делать с удаленными карточками, может их тоже удалять из базы»)
**Confirmed:** 313610959 удалён в WB cabinet (Content API не отдаёт даже с explicit nmID filter), но висит в нашей БД с updatedAt=2026-05-13 и stale данными.

## Архитектура

При каждом `/api/wb-sync`:
1. **Mark deleted:** все nmId которых нет в API response, и у которых `deletedAt IS NULL` → `deletedAt = now()`.
2. **Revive:** все nmId которые есть в API, и у которых `deletedAt IS NOT NULL` → `deletedAt = null` (карточка вернулась).
3. **Hard delete:** все nmId с `deletedAt < now() - 30 days` → `DELETE FROM WbCard` (cascade FK на CalculatedPrice, WbCardWarehouseStock, WbCardWarehouseOrders).

**Safety guard:** если API вернул <50% от текущего активного количества карточек → пропускаем mark-deleted с warning в логи. Защита от частичного sweep при WB API глитче (не хотим mass-удалить активные).

UI: queries в `/cards/wb`, `/prices/wb`, `/stock/wb` теперь имеют `where.deletedAt = null` фильтр. Soft-deleted не видны нигде.

## Файлы

- `prisma/schema.prisma` — `WbCard.deletedAt DateTime?` + `@@index([deletedAt])`
- `prisma/migrations/20260515_wb_card_soft_delete/migration.sql` — ALTER TABLE + CREATE INDEX
- `app/api/wb-sync/route.ts` — блок soft-delete logic в конце основного цикла
- `app/(dashboard)/cards/wb/page.tsx` — фильтр `deletedAt: null` в where + brandCategoryPairs + labels
- `app/(dashboard)/prices/wb/page.tsx` — фильтр в WbCard.findMany
- `lib/stock-wb-data.ts` — фильтр в WbCard.findMany

## Verification

- `npx prisma validate` — schema valid
- `npx tsc --noEmit` — clean
- `npx vitest run` — 17/17 pass

## Deploy

```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"
```

Миграция применится через `prisma migrate deploy`.

## UAT после deploy

- [ ] /cards/wb — 313610959 больше не виден.
- [ ] Запустить «Синхронизировать с WB» — в логах увидеть `[wb-sync soft-delete] marked=N revived=0 hardDeleted=0`.
- [ ] SQL: `SELECT "nmId", "deletedAt" FROM "WbCard" WHERE "deletedAt" IS NOT NULL` — увидеть 313610959 и компанию с deletedAt timestamp.
- [ ] Через 30 дней — все эти карточки исчезнут навсегда (cascade clean-up).

## Edge cases handled

- **Частичный sync** — safety guard защищает от mass-delete.
- **Карточка вернулась** — revive автоматический.
- **Cascade FK** — CalculatedPrice/WbCardWarehouseStock/WbCardWarehouseOrders подчистятся при hard-delete.
- **Existing pages** — фильтр в page queries скрывает удалённые ДО hard-delete.
