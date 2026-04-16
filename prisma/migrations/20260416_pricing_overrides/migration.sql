-- Feature: редактируемые параметры в модалке юнит-экономики.
-- Расширяем Product и CalculatedPrice новыми override-полями, чтобы логика
-- per-slot / per-product работала для всех 13 параметров калькулятора.

-- ── Product: 9 новых per-product override полей ────────────────────
ALTER TABLE "Product" ADD COLUMN "buyoutOverridePct"       DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN "clubDiscountOverridePct" DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN "walletOverridePct"       DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN "acquiringOverridePct"    DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN "commissionOverridePct"   DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN "jemOverridePct"          DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN "creditOverridePct"       DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN "overheadOverridePct"     DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN "taxOverridePct"          DOUBLE PRECISION;

-- ── CalculatedPrice: 10 новых per-slot override полей ──────────────
ALTER TABLE "CalculatedPrice" ADD COLUMN "buyoutPct"        DOUBLE PRECISION;
ALTER TABLE "CalculatedPrice" ADD COLUMN "clubDiscountPct"  DOUBLE PRECISION;
ALTER TABLE "CalculatedPrice" ADD COLUMN "walletPct"        DOUBLE PRECISION;
ALTER TABLE "CalculatedPrice" ADD COLUMN "acquiringPct"     DOUBLE PRECISION;
ALTER TABLE "CalculatedPrice" ADD COLUMN "commissionPct"    DOUBLE PRECISION;
ALTER TABLE "CalculatedPrice" ADD COLUMN "jemPct"           DOUBLE PRECISION;
ALTER TABLE "CalculatedPrice" ADD COLUMN "creditPct"        DOUBLE PRECISION;
ALTER TABLE "CalculatedPrice" ADD COLUMN "overheadPct"      DOUBLE PRECISION;
ALTER TABLE "CalculatedPrice" ADD COLUMN "taxPct"           DOUBLE PRECISION;
ALTER TABLE "CalculatedPrice" ADD COLUMN "costPrice"        DOUBLE PRECISION;
