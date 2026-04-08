-- CreateEnum
CREATE TYPE "Department" AS ENUM ('OFFICE', 'WAREHOUSE');

-- AlterTable: add department to Employee
ALTER TABLE "Employee" ADD COLUMN "department" "Department";

-- AlterTable: move position from Employee to EmployeeCompany
ALTER TABLE "EmployeeCompany" ADD COLUMN "position" TEXT;

-- Migrate existing position data from Employee to EmployeeCompany
UPDATE "EmployeeCompany" ec
SET "position" = e."position"
FROM "Employee" e
WHERE ec."employeeId" = e."id" AND e."position" IS NOT NULL;

-- Drop position from Employee
ALTER TABLE "Employee" DROP COLUMN "position";
