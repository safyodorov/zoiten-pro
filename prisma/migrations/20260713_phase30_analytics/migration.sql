-- Phase 30 (analytics): дашборд «Топ-30 SKU в нише».
-- ERP_SECTION.ANALYTICS (RBAC-раздел, ANL-12) + NicheRunStatus + таблица NicheRun
-- (immutable-снапшот прогона ниши через payloadJson, история ниш, ANL-05).
-- Применяется через `prisma migrate deploy` на VPS (execute-фаза, ОТДЕЛЬНО по сигналу — НЕ в этом цикле).
-- ANALYTICS НЕ используется в этой же миграции (PG: new enum value нельзя использовать в той же tx).

-- 1. Новое значение enum ERP_SECTION (идемпотентно)
ALTER TYPE "ERP_SECTION" ADD VALUE IF NOT EXISTS 'ANALYTICS';

-- 2. Статус-машина фонового прогона сбора
CREATE TYPE "NicheRunStatus" AS ENUM ('PENDING', 'COLLECTING', 'READY', 'PARTIAL', 'FAILED');

-- 3. NicheRun — один прогон анализа ниши (30 конкурентных SKU)
CREATE TABLE "NicheRun" (
  "id"             TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById"    TEXT,
  "dateFrom"       DATE NOT NULL,
  "dateTo"         DATE NOT NULL,
  "status"         "NicheRunStatus" NOT NULL DEFAULT 'PENDING',
  "skuCount"       INTEGER NOT NULL DEFAULT 0,
  "progressNote"   TEXT,
  "incompleteSkus" JSONB,
  "errorMessage"   TEXT,
  "payloadJson"    JSONB,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NicheRun_pkey" PRIMARY KEY ("id")
);

-- 4. Индекс статуса (запрос «активный прогон» + детекция «завис» в UI)
CREATE INDEX "NicheRun_status_idx" ON "NicheRun"("status");

-- 5. FK автора → User (SET NULL при удалении пользователя, паттерн проекта)
ALTER TABLE "NicheRun"
  ADD CONSTRAINT "NicheRun_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
