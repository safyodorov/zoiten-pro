-- prisma/migrations/20260410_add_user_preference/migration.sql
-- Quick 260410-mya: персистентные настройки UI per-user (ширины столбцов /prices/wb)
--
-- Добавляет новую таблицу UserPreference (key/value JSON) для хранения
-- пользовательских кастомизаций UI. Первое применение — ширины столбцов
-- таблицы /prices/wb (ключ "prices.wb.columnWidths").

-- 1. UserPreference (key/value JSON, per-user)
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- 2. Unique per (userId, key) — один ключ настройки на пользователя
CREATE UNIQUE INDEX "UserPreference_userId_key_key" ON "UserPreference"("userId", "key");

-- 3. Index on userId для быстрой выборки всех preferences пользователя
CREATE INDEX "UserPreference_userId_idx" ON "UserPreference"("userId");

-- 4. FK на User с onDelete: Cascade (при удалении юзера удаляются его настройки)
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
