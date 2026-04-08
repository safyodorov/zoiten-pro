-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- AlterTable: add gender and passNumbers array, migrate passNumber
ALTER TABLE "Employee" ADD COLUMN "gender" "Gender";
ALTER TABLE "Employee" ADD COLUMN "passNumbers" INTEGER[] DEFAULT '{}';

-- Migrate existing passNumber to passNumbers array
UPDATE "Employee" SET "passNumbers" = ARRAY["passNumber"] WHERE "passNumber" IS NOT NULL;

-- Drop old passNumber column
ALTER TABLE "Employee" DROP COLUMN IF EXISTS "passNumber";
