-- 260704-go2: фактически оплачено в рублях по валютным платежам
ALTER TABLE "PurchasePayment" ADD COLUMN "amountRub" DECIMAL(14,2);
