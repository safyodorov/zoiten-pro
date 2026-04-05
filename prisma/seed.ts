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
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
