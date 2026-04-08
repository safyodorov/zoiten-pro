-- CreateEnum
CREATE TYPE "PhoneType" AS ENUM ('PERSONAL', 'WORK');

-- CreateEnum
CREATE TYPE "EmailType" AS ENUM ('PERSONAL', 'WORK');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "position" TEXT,
    "birthDate" TIMESTAMP(3),
    "hireDate" TIMESTAMP(3),
    "fireDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeCompany" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "rate" DECIMAL(3,2) NOT NULL DEFAULT 1,
    "salary" INTEGER,
    "trudovoyDogovor" BOOLEAN NOT NULL DEFAULT false,
    "prikazPriema" BOOLEAN NOT NULL DEFAULT false,
    "soglasiePersDannyh" BOOLEAN NOT NULL DEFAULT false,
    "nda" BOOLEAN NOT NULL DEFAULT false,
    "lichnayaKartochka" BOOLEAN NOT NULL DEFAULT false,
    "zayavlenieUvolneniya" BOOLEAN NOT NULL DEFAULT false,
    "prikazUvolneniya" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EmployeeCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeePhone" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" "PhoneType" NOT NULL DEFAULT 'WORK',

    CONSTRAINT "EmployeePhone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeEmail" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "type" "EmailType" NOT NULL DEFAULT 'WORK',

    CONSTRAINT "EmployeeEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeePass" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "number" TEXT NOT NULL,

    CONSTRAINT "EmployeePass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeCompany_employeeId_companyId_key" ON "EmployeeCompany"("employeeId", "companyId");

-- AddForeignKey
ALTER TABLE "EmployeeCompany" ADD CONSTRAINT "EmployeeCompany_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompany" ADD CONSTRAINT "EmployeeCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePhone" ADD CONSTRAINT "EmployeePhone_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeEmail" ADD CONSTRAINT "EmployeeEmail_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePass" ADD CONSTRAINT "EmployeePass_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
