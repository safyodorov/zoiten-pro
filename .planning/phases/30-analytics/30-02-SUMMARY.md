# Phase 30 — Plan 02 Summary (Wave 0: схема БД)

**Status:** ✅ executed (schema authored + validated). ⏳ `prisma generate` + `migrate deploy` — отдельно (execute-env / VPS, НЕ в этом цикле).
**Executed:** 2026-07-13 (branch `gsd/phase-30-analytics`, planning/local only — no push, no deploy, migration NOT applied to any DB).

## Что сделано
- `prisma/schema.prisma`:
  - `enum ERP_SECTION` += **`ANALYTICS`** (после FINANCE) — фундамент RBAC-раздела (ANL-12).
  - `enum NicheRunStatus { PENDING COLLECTING READY PARTIAL FAILED }` — статус-машина фонового сбора.
  - `model NicheRun` (ANL-05) + back-relation `User.nicheRuns NicheRun[]`.
- `prisma/migrations/20260713_phase30_analytics/migration.sql` — рукописная (ALTER TYPE ADD VALUE + CREATE TYPE + CREATE TABLE + index + FK), по прецеденту phase23/weekly-snapshot. `ANALYTICS` не используется в самой миграции (PG-ограничение).

## Финальные имена полей NicheRun (источник истины для 30-07 / 30-08 / 30-11 / 30-12)
| Поле | Тип | Назначение |
|------|-----|-----------|
| `id` | String @id cuid | PK прогона |
| `createdAt` | DateTime @default(now()) | когда запущен |
| `createdById` / `createdBy` | String? / User? (SetNull) | автор прогона |
| `dateFrom` / `dateTo` | DateTime @db.Date | окно (= период byDay файлов = ось MPSTATS) |
| `status` | NicheRunStatus @default(PENDING) | PENDING→COLLECTING→READY/PARTIAL/FAILED |
| `skuCount` | Int @default(0) | сколько SKU (норма 30) |
| `progressNote` | String? | прогресс для polling («MPSTATS 12/30») |
| `incompleteSkus` | Json? | `[{nmId, reason}]` для PARTIAL (правило полноты, ANL-07) |
| `errorMessage` | String? | причина FAILED (сбой в топ-10) |
| `payloadJson` | Json? | `NicheRunPayload` (lib/analytics/types.ts) — null пока не READY/PARTIAL |
| `updatedAt` | DateTime @updatedAt | последнее обновление статуса |

`@@index([status])` — для запроса «активный прогон» / детекции «завис».

## Verification
- `grep`-гейты Task 1/2: все ✓ (ANALYTICS, model NicheRun, enum NicheRunStatus, User back-relation, ALTER TYPE, CREATE TABLE).
- `npx prisma validate` (DATABASE_URL-заглушка, без подключения к БД): **`The schema is valid 🚀`**.
- ⏳ Не выполнено локально (нет node_modules / БД): `npx prisma generate` (типы клиента) и `prisma migrate deploy` — сделать при настройке execute-окружения / на VPS.

## Downstream
Разблокирует: 30-07 (collector пишет NicheRun), 30-08 (startNicheRun/status-route), 30-11 (RSC читает payloadJson), 30-12 (PDF из payloadJson), 30-13 (RBAC ANALYTICS).
