-- Гранулярные роли per раздел + plain text пароль для суперадмина

-- 1. Enum SectionRole
CREATE TYPE "SectionRole" AS ENUM ('VIEW', 'MANAGE');

-- 2. Plain password поле в User
ALTER TABLE "User" ADD COLUMN "plainPassword" TEXT;

-- 3. Таблица UserSectionRole
CREATE TABLE "UserSectionRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "section" "ERP_SECTION" NOT NULL,
    "role" "SectionRole" NOT NULL,

    CONSTRAINT "UserSectionRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserSectionRole_userId_section_key" ON "UserSectionRole"("userId", "section");

ALTER TABLE "UserSectionRole" ADD CONSTRAINT "UserSectionRole_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Перенос существующих allowedSections → UserSectionRole с ролью MANAGE
-- (текущие пользователи получают полный доступ к разделам куда им был открыт доступ)
INSERT INTO "UserSectionRole" ("id", "userId", "section", "role")
SELECT
    gen_random_uuid()::text,
    u."id",
    s."section",
    'MANAGE'::"SectionRole"
FROM "User" u
CROSS JOIN LATERAL unnest(u."allowedSections") AS s("section")
WHERE array_length(u."allowedSections", 1) > 0;
