---
phase: 16-wb-stock-sizes
plan: W0
type: execute
wave: 0
depends_on: []
files_modified:
  - scripts/wb-stocks-diagnose.js
autonomous: true
requirements:
  - STOCK-30
gap_closure: false
must_haves:
  truths:
    - "scripts/wb-stocks-diagnose.js существует и запускается через `node scripts/wb-stocks-diagnose.js`"
    - "Скрипт делает curl на Statistics API и читает WbCardWarehouseStock через Prisma"
    - "Скрипт выгружает CSV `wb-stocks-diff-YYYY-MM-DD.csv` с колонками `nmId,warehouseName,apiTotal,dbTotal,diff,ratio` для всех несовпадений"
    # W8: truth «baseline CSV содержит хотя бы 1 row с diff != 0» удалён —
    # неверифицируемо в W0 без VPS env. Реальная UAT-проверка diff=0 после re-sync
    # перенесена в Plan 16-06 (16-HUMAN-UAT.md пункт 9).
  artifacts:
    - path: "scripts/wb-stocks-diagnose.js"
      provides: "Diagnostic CSV для контрольных nmId"
      min_lines: 70
  key_links:
    - from: "scripts/wb-stocks-diagnose.js"
      to: "WB Statistics API + WbCardWarehouseStock"
      via: "curl + Prisma findMany"
      pattern: "fetch.*statistics-api|prisma.wbCardWarehouseStock.findMany"
---

<objective>
Wave 0 — Diagnostic baseline ДО исправления sync-бага. Создать standalone Node.js
скрипт `scripts/wb-stocks-diagnose.js`, который:
1. Делает curl на WB Statistics API (`/api/v1/supplier/stocks?dateFrom=2019-06-20T00:00:00`)
   с токеном из `WB_API_TOKEN`.
2. Читает `WbCardWarehouseStock` через Prisma для контрольных nmId 859398279, 901585883.
3. Агрегирует обе стороны по `(nmId, warehouseName)` суммированием по всем techSize.
4. Сравнивает `apiTotal − dbTotal`, выгружает CSV `wb-stocks-diff-YYYY-MM-DD.csv`.

**Цель:** golden baseline ДО фикса, чтобы повторный запуск после Plan 16-06 (re-sync)
показал `diff=0` — объективное доказательство для UAT (STOCK-37 acceptance).

**Покрывает:** STOCK-30.

Purpose: Нет диагностического скрипта в репозитории. RESEARCH.md §«Sync Bug
Forensics» reproduced два разных бага в двух файлах; CSV-дамп показывает observed
mismatch и даёт baseline для verification после фикса.

Output: Скрипт `scripts/wb-stocks-diagnose.js` готов к запуску локально и на VPS.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/16-wb-stock-sizes/16-CONTEXT.md
@.planning/phases/16-wb-stock-sizes/16-RESEARCH.md

<interfaces>
<!-- Контракты, которые executor должен использовать. Извлечено из codebase. -->

From `prisma/schema.prisma` (WbCardWarehouseStock):
```prisma
model WbCardWarehouseStock {
  id          String      @id @default(cuid())
  wbCardId    String
  wbCard      WbCard      @relation(fields: [wbCardId], references: [id], onDelete: Cascade)
  warehouseId Int
  warehouse   WbWarehouse @relation(fields: [warehouseId], references: [id])
  quantity    Int         @default(0)
  updatedAt   DateTime    @updatedAt
  @@unique([wbCardId, warehouseId])  // НЕ менять в W0 — этим займётся Plan 16-01
}
```

From `lib/wb-api.ts:768`:
```typescript
const STATISTICS_API_STOCKS = "https://statistics-api.wildberries.ru/api/v1/supplier/stocks"
// dateFrom = "2019-06-20T00:00:00" — полный snapshot (не "now-1d")
```

From `tests/wb-stocks-per-warehouse.test.ts:50` (структура rows API):
```javascript
{
  warehouseName: "Невинномысск", nmId: 418725481, barcode: "2044018340398",
  quantity: 21, inWayToClient: 0, inWayFromClient: 0, quantityFull: 21,
  supplierArticle: "МоющийПылесосZoiten", techSize: "0",
}
```

From `scripts/wb-sync-stocks.js:5-15` (паттерн execSync curl):
```javascript
const { execSync } = require("node:child_process")
const { PrismaClient } = require("@prisma/client")

const TOKEN = process.env.WB_API_TOKEN
const cmd = `curl -sS -H "Authorization: ${TOKEN}" "${URL}"`
const raw = execSync(cmd, { encoding: "utf-8", maxBuffer: 200 * 1024 * 1024 })
```
</interfaces>

# Целевые nmId для проверки (из CONTEXT.md §specifics)

- **859398279** «Брюки классические мужские прямые», УКТ-000029 — 8 размеров (46/48/50/52/54/56/58/60).
  Известная аномалия Котовск API ≥61, БД 8.
- **901585883** «Костюм классический двойка», УКТ-000030 — 8 размеров.
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Создать scripts/wb-stocks-diagnose.js</name>
  <files>scripts/wb-stocks-diagnose.js</files>
  <read_first>
    - `scripts/wb-sync-stocks.js` (целиком; паттерн curl+Prisma, env loading, error handling)
    - `lib/wb-api.ts:755-846` (STATISTICS_API_STOCKS endpoint, формат response)
    - `prisma/schema.prisma:805-817` (WbCardWarehouseStock текущая схема — без techSize пока)
    - `.planning/phases/16-wb-stock-sizes/16-RESEARCH.md` §«Diagnostic скрипт (Wave 0)» (строки 988-1048) — готовый эскиз
    - `.planning/phases/16-wb-stock-sizes/16-CONTEXT.md` §specifics — контрольные nmId 859398279 и 901585883
  </read_first>
  <behavior>
    - Default входы: TARGET_NMIDS = [859398279, 901585883]; читать из `process.env.WB_STOCKS_DIAGNOSE_NMIDS` если задано (CSV)
    - Делать ОДИН curl на `https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=2019-06-20T00:00:00` (не batched per nmId — rate limit, см. CLAUDE.md)
    - Фильтр `apiRows.filter(r => TARGET_NMIDS.includes(r.nmId))` — ДО агрегации
    - apiAgg: Map<"nmId:warehouseName", number> = sum(quantity) по всем techSize в API rows
    - dbAgg: Map<"nmId:warehouseName", number> = sum(quantity) по всем records в БД (если в legacy schema несколько rows на (wbCardId, warehouseId) — sum)
    - CSV header: `nmId,warehouseName,apiTotal,dbTotal,diff,ratio`
    - Только rows где `diff != 0` попадают в CSV (apiTotal − dbTotal)
    - ratio = `dbTotal > 0 ? (apiTotal/dbTotal).toFixed(2) : "—"`
    - Имя файла: `wb-stocks-diff-${YYYY-MM-DD}.csv` в текущей рабочей директории
    - Console output: `Diff written: N rows to <filename>` (где N = csv.length-1)
    - При пустом diff: пишет CSV только с header + console «No diffs found — БД соответствует API»
    - exit code 0 при success (даже если diffs есть — это data, не ошибка)
  </behavior>
  <action>
    Создать файл `scripts/wb-stocks-diagnose.js` со следующим содержимым (CommonJS,
    как `wb-sync-stocks.js`):

    ```javascript
    #!/usr/bin/env node
    // scripts/wb-stocks-diagnose.js
    // Phase 16 (STOCK-30): Diagnostic — сравнение WB Statistics API snapshot ↔ БД
    // для контрольных nmId. Выгружает CSV с расхождениями.
    //
    // Запуск: node scripts/wb-stocks-diagnose.js
    // Опционально: WB_STOCKS_DIAGNOSE_NMIDS="111,222,333" node scripts/wb-stocks-diagnose.js
    //
    // Использует:
    //   - WB_API_TOKEN из env (или /etc/zoiten.pro.env на VPS)
    //   - Prisma client (DATABASE_URL из .env)
    //   - curl (system) — паттерн scripts/wb-sync-stocks.js

    const { execSync } = require("node:child_process")
    const fs = require("node:fs")
    const { PrismaClient } = require("@prisma/client")

    const TOKEN = process.env.WB_API_TOKEN
    if (!TOKEN) {
      console.error("ERROR: WB_API_TOKEN не задан в env. Установите перед запуском.")
      process.exit(1)
    }

    const DEFAULT_NMIDS = [859398279, 901585883]
    const targetEnv = process.env.WB_STOCKS_DIAGNOSE_NMIDS
    const TARGET_NMIDS = targetEnv
      ? targetEnv.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
      : DEFAULT_NMIDS

    if (TARGET_NMIDS.length === 0) {
      console.error("ERROR: TARGET_NMIDS пусто (некорректный WB_STOCKS_DIAGNOSE_NMIDS).")
      process.exit(1)
    }

    async function main() {
      console.log(`Diagnostic для nmId: ${TARGET_NMIDS.join(", ")}`)

      // 1. Snapshot из API (одним запросом — Statistics API rate limit ~1 req/min)
      const dateFrom = "2019-06-20T00:00:00"
      const url = `https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=${encodeURIComponent(dateFrom)}`
      const cmd = `curl -sS -H "Authorization: ${TOKEN}" "${url}"`
      console.log("Fetching WB Statistics API...")
      const raw = execSync(cmd, { encoding: "utf-8", maxBuffer: 200 * 1024 * 1024 })

      let apiRowsAll
      try {
        apiRowsAll = JSON.parse(raw)
      } catch (e) {
        console.error("ERROR: API response не является JSON:", e.message)
        console.error("Raw начало:", raw.slice(0, 500))
        process.exit(1)
      }

      if (!Array.isArray(apiRowsAll)) {
        console.error("ERROR: API response не массив. Type:", typeof apiRowsAll)
        process.exit(1)
      }

      const apiRows = apiRowsAll.filter((r) => TARGET_NMIDS.includes(r.nmId))
      console.log(`API: ${apiRows.length} rows для целевых nmId (всего ${apiRowsAll.length})`)

      // 2. Aggregate API per (nmId, warehouseName) — sum across techSize
      const apiAgg = new Map()
      for (const r of apiRows) {
        const key = `${r.nmId}:${r.warehouseName ?? ""}`
        apiAgg.set(key, (apiAgg.get(key) ?? 0) + (r.quantity ?? 0))
      }

      // 3. Read DB
      const prisma = new PrismaClient()
      const dbRows = await prisma.wbCardWarehouseStock.findMany({
        where: { wbCard: { nmId: { in: TARGET_NMIDS } } },
        include: {
          wbCard: { select: { nmId: true } },
          warehouse: { select: { name: true } },
        },
      })
      console.log(`DB: ${dbRows.length} rows для целевых nmId`)

      const dbAgg = new Map()
      for (const r of dbRows) {
        const key = `${r.wbCard.nmId}:${r.warehouse?.name ?? ""}`
        dbAgg.set(key, (dbAgg.get(key) ?? 0) + (r.quantity ?? 0))
      }

      // 4. Compute diff CSV
      const allKeys = new Set([...apiAgg.keys(), ...dbAgg.keys()])
      const csvRows = [["nmId", "warehouseName", "apiTotal", "dbTotal", "diff", "ratio"]]
      for (const key of allKeys) {
        const [nmIdStr, warehouseName] = key.split(":")
        const apiTotal = apiAgg.get(key) ?? 0
        const dbTotal = dbAgg.get(key) ?? 0
        const diff = apiTotal - dbTotal
        if (diff === 0) continue
        const ratio = dbTotal > 0 ? (apiTotal / dbTotal).toFixed(2) : "—"
        csvRows.push([nmIdStr, warehouseName, String(apiTotal), String(dbTotal), String(diff), ratio])
      }

      // 5. Write CSV
      const today = new Date().toISOString().slice(0, 10)
      const filename = `wb-stocks-diff-${today}.csv`
      fs.writeFileSync(filename, csvRows.map((row) => row.join(",")).join("\n") + "\n")

      const diffCount = csvRows.length - 1
      if (diffCount === 0) {
        console.log(`No diffs found — БД соответствует API. CSV (только header): ${filename}`)
      } else {
        console.log(`Diff written: ${diffCount} rows → ${filename}`)
      }

      await prisma.$disconnect()
    }

    main().catch((e) => {
      console.error("FATAL:", e)
      process.exit(1)
    })
    ```

    После создания запустить локально (если есть локальная PG) или передать на VPS
    через scp + ssh для baseline-запуска. Локальная сборка проверки в acceptance.

    КРИТИЧНО — НЕ запускать `npx prisma generate` сейчас (Plan 16-01 поменяет схему,
    регенерация в 16-01).
  </action>
  <verify>
    <automated>node -e "const fs=require('fs'); const c=fs.readFileSync('scripts/wb-stocks-diagnose.js','utf-8'); if(!c.includes('statistics-api.wildberries.ru')) throw 'no API URL'; if(!c.includes('TARGET_NMIDS')) throw 'no TARGET_NMIDS'; if(!c.includes('apiAgg')) throw 'no apiAgg'; if(!c.includes('wb-stocks-diff-')) throw 'no CSV name'; console.log('OK')"</automated>
  </verify>
  <acceptance_criteria>
    - `scripts/wb-stocks-diagnose.js` существует
    - `grep -c "statistics-api.wildberries.ru" scripts/wb-stocks-diagnose.js` >= 1
    - `grep -c "wbCardWarehouseStock.findMany" scripts/wb-stocks-diagnose.js` >= 1
    - `grep -c "859398279" scripts/wb-stocks-diagnose.js` >= 1 (контрольный nmId)
    - `grep -c "901585883" scripts/wb-stocks-diagnose.js` >= 1 (контрольный nmId)
    - `grep -c "WB_STOCKS_DIAGNOSE_NMIDS" scripts/wb-stocks-diagnose.js` >= 1 (env override)
    - `grep -c "wb-stocks-diff-" scripts/wb-stocks-diagnose.js` >= 1 (CSV имя)
    - `head -1 scripts/wb-stocks-diagnose.js` начинается с `#!/usr/bin/env node` ИЛИ `// scripts/wb-stocks-diagnose.js`
    - `wc -l scripts/wb-stocks-diagnose.js` >= 70
    - `node -c scripts/wb-stocks-diagnose.js` (или `node --check ...`) — синтаксис валиден без выполнения
  </acceptance_criteria>
  <done>
    Скрипт создан, синтаксически валиден, содержит обращения к Statistics API и Prisma,
    cпособен выгрузить CSV. Не запускается сейчас (нужен WB_API_TOKEN из VPS env);
    запуск на baseline дамп — manual step во время Plan 16-06 пользователем.
  </done>
</task>

</tasks>

<verification>
- `node --check scripts/wb-stocks-diagnose.js` — без ошибок синтаксиса
- Скрипт ссылается на: WB Statistics API URL, контрольные nmId 859398279/901585883,
  Prisma `wbCardWarehouseStock.findMany`, CSV-выгрузку
- Скрипт защищён от пустого WB_API_TOKEN, невалидного JSON ответа, не-массива
</verification>

<success_criteria>
- Скрипт способен запускаться через `node scripts/wb-stocks-diagnose.js` (после
  установки `WB_API_TOKEN` в env)
- Скрипт идемпотентен — повторный запуск перезаписывает CSV того же дня
- Не вносит изменений в схему/миграции/код приложения — Wave 0 исключительно
  читающий
</success_criteria>

<output>
После завершения создать `.planning/phases/16-wb-stock-sizes/16-W0-SUMMARY.md`
с описанием:
- Что создано (`scripts/wb-stocks-diagnose.js`)
- Как запускать (локально / VPS env, env vars)
- Ожидаемое поведение ДО Plan 16-02 фикса (baseline diff != 0 хотя бы для
  одного row контрольных nmId)
- Roadmap-attribution: STOCK-30
</output>
