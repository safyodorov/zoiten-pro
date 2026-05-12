// scripts/wb-sync-characteristics.js (one-shot)
// Phase 17 backfill: заполняет WbCard.characteristics + WbCard.techSizes
// из WB Content API. Обходит HTTP /api/wb-sync (Auth.js session cookie не нужен).
//
// Запуск на VPS:
//   set -a; source /etc/zoiten.pro.env; set +a; node scripts/wb-sync-characteristics.js

const { PrismaClient, Prisma } = require("@prisma/client")

// NB: standalone скрипт — читает env напрямую (не через lib/wb-token).
// Для UI replace-flow см. lib/wb-token.ts. Quick 260512-jxh.
const WB_API_TOKEN = process.env.WB_API_TOKEN
if (!WB_API_TOKEN) {
  console.error("WB_API_TOKEN не установлен")
  process.exit(1)
}

const CONTENT_API = "https://content-api.wildberries.ru"

async function fetchAllCards() {
  const allCards = []
  let cursorUpdatedAt
  let cursorNmID = 0
  const limit = 100

  while (true) {
    const cursorObj = { limit, nmID: cursorNmID }
    if (cursorUpdatedAt) cursorObj.updatedAt = cursorUpdatedAt

    const body = {
      settings: { cursor: cursorObj, filter: { withPhoto: -1 } },
    }

    const res = await fetch(`${CONTENT_API}/content/v2/get/cards/list`, {
      method: "POST",
      headers: { Authorization: WB_API_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const t = await res.text()
      throw new Error(`Content API ${res.status}: ${t}`)
    }
    const data = await res.json()
    if (!data.cards || data.cards.length === 0) break

    allCards.push(...data.cards)
    if (data.cursor.total < limit) break
    cursorUpdatedAt = data.cursor.updatedAt
    cursorNmID = data.cursor.nmID
  }

  return allCards
}

async function main() {
  const prisma = new PrismaClient()
  try {
    console.log("[1/3] Fetching all cards from WB Content API...")
    const cards = await fetchAllCards()
    console.log(`     → ${cards.length} cards`)

    console.log("[2/3] Updating WbCard.characteristics + techSizes...")
    let updated = 0
    let skipped = 0
    const errors = []

    for (const card of cards) {
      try {
        const nmId = card.nmID
        if (!nmId) {
          skipped++
          continue
        }

        // techSizes: фильтруем "0" placeholder и пустые
        const techSizes = []
        for (const sz of card.sizes ?? []) {
          const ts = String(sz.techSize ?? "").trim()
          if (ts && ts !== "0" && !techSizes.includes(ts)) {
            techSizes.push(ts)
          }
        }

        const characteristics =
          card.characteristics == null
            ? Prisma.DbNull
            : card.characteristics

        // Только UPDATE — WbCard уже должна существовать (создаётся в /api/wb-sync)
        const result = await prisma.wbCard.updateMany({
          where: { nmId },
          data: {
            characteristics,
            techSizes,
          },
        })

        if (result.count === 0) {
          // карточки нет в БД — sync /api/wb-sync создаст её
          skipped++
        } else {
          updated++
        }
      } catch (e) {
        errors.push(`nmId ${card.nmID}: ${e.message}`)
      }
    }

    console.log(`[3/3] Done: ${updated} updated, ${skipped} skipped (нет в БД), ${errors.length} errors`)
    if (errors.length > 0) {
      console.log("Errors (первые 10):")
      errors.slice(0, 10).forEach((e) => console.log("  " + e))
    }

    // Quick verify
    const stats = await prisma.$queryRaw`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE "characteristics" IS NOT NULL) AS with_chars,
        COUNT(*) FILTER (WHERE array_length("techSizes", 1) > 0) AS with_sizes
      FROM "WbCard"
    `
    console.log("BD после sync:", stats[0])
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
