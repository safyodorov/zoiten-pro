// prisma/seed.ts
import { PrismaClient, UserRole } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  const hashedPassword = await bcrypt.hash("stafurovonet", 12)

  const superadmin = await prisma.user.upsert({
    where: { email: "sergey.fyodorov@gmail.com" },
    update: {},
    create: {
      email: "sergey.fyodorov@gmail.com",
      name: "Sergey Fyodorov",
      password: hashedPassword,
      role: UserRole.SUPERADMIN,
      allowedSections: [],
      isActive: true,
    },
  })

  console.log(`Superadmin seeded: ${superadmin.email} (id: ${superadmin.id})`)

  // ── Zoiten brand ──────────────────────────────────────────────────
  const zoitenBrand = await prisma.brand.upsert({
    where: { name: "Zoiten" },
    update: {},
    create: { name: "Zoiten" },
  })
  console.log(`Brand seeded: ${zoitenBrand.name} (id: ${zoitenBrand.id})`)

  // ── Zoiten categories (Дом, Кухня, Красота и здоровье) ───────────
  const categoryNames = ["Дом", "Кухня", "Красота и здоровье"]
  for (const catName of categoryNames) {
    const category = await prisma.category.upsert({
      where: { name_brandId: { name: catName, brandId: zoitenBrand.id } },
      update: {},
      create: { name: catName, brandId: zoitenBrand.id },
    })
    console.log(`Category seeded: ${category.name} (id: ${category.id})`)
  }

  // ── Marketplaces (WB, Ozon, ДМ, ЯМ) ─────────────────────────────
  const marketplaces = [
    { name: "WB", slug: "wb" },   // Wildberries
    { name: "Ozon", slug: "ozon" }, // Ozon
    { name: "ДМ", slug: "dm" },   // Детский Мир
    { name: "ЯМ", slug: "ym" },   // Яндекс Маркет
  ]
  for (const mp of marketplaces) {
    const marketplace = await prisma.marketplace.upsert({
      where: { slug: mp.slug },
      update: {},
      create: { name: mp.name, slug: mp.slug },
    })
    console.log(`Marketplace seeded: ${marketplace.name} / ${marketplace.slug} (id: ${marketplace.id})`)
  }

  // ── Phase 14: AppSetting stock.turnoverNormDays ──────────────────
  await prisma.appSetting.upsert({
    where: { key: "stock.turnoverNormDays" },
    create: { key: "stock.turnoverNormDays", value: "37" },
    update: {},
  })
  console.log("AppSetting seeded: stock.turnoverNormDays = 37")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
