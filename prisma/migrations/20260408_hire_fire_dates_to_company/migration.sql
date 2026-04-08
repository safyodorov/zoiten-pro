-- AlterTable: add hireDate and fireDate to EmployeeCompany
ALTER TABLE "EmployeeCompany" ADD COLUMN "hireDate" TIMESTAMP(3);
ALTER TABLE "EmployeeCompany" ADD COLUMN "fireDate" TIMESTAMP(3);

-- Migrate: copy Employee-level dates to all EmployeeCompany entries
UPDATE "EmployeeCompany" ec
SET "hireDate" = e."hireDate"
FROM "Employee" e
WHERE ec."employeeId" = e."id" AND e."hireDate" IS NOT NULL;

UPDATE "EmployeeCompany" ec
SET "fireDate" = e."fireDate"
FROM "Employee" e
WHERE ec."employeeId" = e."id" AND e."fireDate" IS NOT NULL;
