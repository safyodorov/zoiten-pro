---
phase: quick-260616-v5x
plan: "01"
subsystem: products
tags: [photo, wb-sync, override, prisma-migration]
dependency_graph:
  requires: [prisma-schema, wb-sync, products-actions, product-form]
  provides: [product-photo-auto-wb, photoOverridden-flag]
  affects: [products-crud, wb-sync, product-form-ui]
tech_stack:
  added: []
  patterns: [nameOverridden-mirror, resolveProductPhoto-tx-helper, batch-no-fk-photo-backfill]
key_files:
  created:
    - prisma/migrations/20260616_product_photo_overridden/migration.sql
  modified:
    - prisma/schema.prisma
    - app/actions/products.ts
    - app/actions/wb-cards.ts
    - app/api/wb-sync/route.ts
    - components/products/ProductForm.tsx
decisions:
  - "photoOverridden=false → photo auto-derived from first (min sortOrder) WB article; resolveProductPhoto called inside $transaction after articles recreated"
  - "wb-sync batch pass uses no-FK pattern (parseInt article→nmId) to avoid FK on WbCard; writes only when photo differs"
  - "createProductFromCards keeps existing photoUrl=firstCard.photoUrl behavior; photoOverridden:false explicit"
  - "duplicateProduct: photoOverridden:false + resolveProductPhoto (fills from WB if articles exist, else stays null)"
metrics:
  duration: "256s"
  completed: "2026-06-16"
  tasks: 3
  files: 5
---

# Phase quick-260616-v5x Plan 01: Product Photo Auto-WB Summary

**One-liner:** Auto-derive Product.photoUrl from first WB card (photoOverridden flag mirrors nameOverridden pattern), with batch wb-sync backfill to fix null-photo products.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Schema + migration Product.photoOverridden | f013210 | schema.prisma, migration.sql |
| 2 | resolveProductPhoto helper + create/update/duplicate | a930d63 | products.ts, wb-cards.ts |
| 3 | wb-sync batch backfill + ProductForm override UI | ff3ed0f | wb-sync/route.ts, ProductForm.tsx |

## What Was Built

**Product.photoOverridden** (Boolean @default(false)) — новое поле в модели Product, симметричное Product.nameOverridden из Phase 18.

**resolveProductPhoto(tx, productId)** — tx-aware helper в app/actions/products.ts:
- Если `photoOverridden=true` — no-op
- Иначе: ищет первый WB-артикул (sortOrder=0) → WbCard.photoUrl → пишет в Product.photoUrl только если отличается
- Вызывается в конце транзакции createProduct, updateProduct (ПОСЛЕ пересоздания articles), duplicateProduct — порядок критичен

**updateProduct photo logic:**
- `photoOverridden=true` → пишет `parsed.photoUrl` + `photoOverridden=true`
- `photoOverridden=false` → ставит `photoOverridden=false`, photoUrl перевыводится через resolveProductPhoto

**wb-sync batch backfill:**
- Собирает `cardPhotoByNmId: Map<nmId, photoUrl>` по ходу upsert-цикла
- После всех per-warehouse passes: находит все ProductArticle с `photoOverridden=false`, берёт min-sortOrder WB-артикул на продукт, обновляет photoUrl только при изменении
- Returns `productPhotosUpdated` в ответе — даёт видимость в логах

**ProductForm override UI:**
- Заголовок «Фото» показывает `(авто из первой карточки WB)` или `(загружено вручную)`
- Кнопка «Вернуть авто из WB» при `photoOverridden=true` → сбрасывает в `false+null` → при сохранении resolveProductPhoto заполнит из WbCard
- `onUploadComplete` в PhotoUploadField ставит `photoOverridden=true`
- `photoOverridden` в formSchema/defaultValues/ProductData interface

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files created/modified exist:
- prisma/schema.prisma — modified (photoOverridden field added)
- prisma/migrations/20260616_product_photo_overridden/migration.sql — created
- app/actions/products.ts — modified (resolveProductPhoto + 3 call sites + photoOverridden in schema)
- app/actions/wb-cards.ts — modified (photoOverridden: false explicit)
- app/api/wb-sync/route.ts — modified (cardPhotoByNmId map + batch backfill pass)
- components/products/ProductForm.tsx — modified (override UI)

### Commits exist:
- f013210 feat(quick-260616-v5x-01): add Product.photoOverridden field + migration
- a930d63 feat(quick-260616-v5x-01): resolveProductPhoto helper + integrate in create/update/duplicate
- ff3ed0f feat(quick-260616-v5x-01): wb-sync batch photo backfill + ProductForm override UI

## Self-Check: PASSED
