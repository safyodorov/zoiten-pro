-- Связь User ↔ Employee + поля firstName/lastName

ALTER TABLE "User" ADD COLUMN "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN "lastName" TEXT;
ALTER TABLE "User" ADD COLUMN "employeeId" TEXT;

-- Уникальный индекс: один сотрудник = максимум один пользователь
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- FK на Employee с onDelete: SET NULL (если сотрудник удалён — связь обнуляется, User остаётся)
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Попытка распилить существующий name на firstName/lastName (best-effort)
-- Правило: первое слово → firstName, остальное → lastName
-- Два существующих пользователя остаются с текущим name как есть
UPDATE "User"
SET
    "firstName" = COALESCE(NULLIF(split_part("name", ' ', 1), ''), "name"),
    "lastName" = COALESCE(NULLIF(regexp_replace("name", '^\S+\s*', ''), ''), NULL)
WHERE "firstName" IS NULL;
