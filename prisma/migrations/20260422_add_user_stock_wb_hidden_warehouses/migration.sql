-- Per-user hidden WB warehouses on /stock/wb (quick 260422-oy5)
ALTER TABLE "User" ADD COLUMN "stockWbHiddenWarehouses" INTEGER[] NOT NULL DEFAULT '{}';
