---
status: passed
verified: 2026-07-02
verifier: orchestrator (gsd-verifier дважды оборвался API-ошибкой; проверки выполнены в основной сессии)
---

# Verification — quick 260702-j52

## Automated checks

| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` — затронутые файлы | ✅ 0 ошибок (production-sync, recompute-production, purchases, stock-data, StockProductTable, stock.ts, procurement.ts, ProcurementTable) |
| tsc pre-existing (вне scope) | archiver/pdfkit/recharts types отсутствуют в локальном node_modules (chart-компоненты ads/cards/credits, zip/report routes) — не связаны с задачей; на VPS build type-check отключён (effdc75) |
| `vitest tests/production-sync.test.ts` | ✅ 6/6 (сумма, частичная приёмка, clamp, мульти-товар) |
| `vitest tests/stock-actions.test.ts` | ✅ 6/6 (updateProductionStock describe удалён) |
| Grep: `recomputeProductionForProducts` в purchases.ts | ✅ 5 вхождений (import + 4 прямых вызова в create/update/delete/savePurchaseItemStages) |
| Grep: `orderedQty: z.` в procurement.ts | ✅ отсутствует (Zod-схема без количества) |
| Grep: `saveQty\|handleQtyChange` в ProcurementTable | ✅ отсутствуют (qty read-only) |
| Grep: `updateProductionStock` в stock.ts / StockProductTable | ✅ удалён везде |
| Grep: ссылка `/procurement/purchases` в StockProductTable | ✅ есть (tooltip) |
| Grep: `productionBreakdown` + `purchaseItem.findMany` в stock-data | ✅ есть |
| Grep: runtime-импорт `@/lib/prisma` в production-sync.ts | ✅ отсутствует (только в комментарии; PrismaClient через DI) |
| Grep: `ivanovoStock` в purchases.ts | ✅ отсутствует (закрытие закупки не трогает Иваново) |

## Must-haves (truths)

1. ✅ Производство в /stock — авто из открытых закупок (PLANNED+ACTIVE), ручной ввод количества недоступен
2. ✅ Частичная приёмка (WAREHOUSE) сразу уменьшает Производство (recompute в savePurchaseItemStages)
3. ✅ COMPLETED убирает закупку из Производства; ivanovoStock не затронут
4. ✅ Tooltip с раскладкой по закупкам + ссылка на /procurement/purchases
5. ✅ Дата прихода (expectedDate) осталась ручной; plannedSalesPerDay нетронут
6. ✅ /purchase-plan: количество read-only, upsertProductIncoming без orderedQty; дата и план продаж редактируемы

## Human follow-ups

- [ ] Post-deploy: однократный пересчёт на проде — `cd /opt/zoiten-pro && DATABASE_URL=$(grep DATABASE_URL /etc/zoiten.pro.env | cut -d= -f2-) npx tsx scripts/recompute-production.ts`
- [ ] UAT: /stock (число + tooltip, дата редактируема, Иваново редактируемо), /purchase-plan (кол-во read-only), мутация закупки → число обновилось
