// Сид поставщиков из scripts/suppliers-parsed.json в БД (Prisma).
// Идемпотентно: поставщик с таким же nameEnglish пропускается.
// Запуск на VPS: set -a; . /etc/zoiten.pro.env; set +a; node scripts/seed-suppliers.cjs
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, "suppliers-parsed.json"), "utf8")
);
// Визуальный матчинг Excel-строка → наш sku (из vision-агентов), см. product-matches.json
const matchByRow = JSON.parse(
  fs.readFileSync(path.join(__dirname, "product-matches.json"), "utf8")
);

function preferredContactOf(text) {
  const t = (text || "").toLowerCase();
  if (/wechat|вичат|вечат|вэйчат|微信|wei\s?xin/.test(t)) return "WECHAT";
  if (/alibaba|1688/.test(t)) return "ALIBABA";
  return "PHONE";
}

async function findBuyer(name) {
  if (!name) return null;
  const emp = await prisma.employee.findFirst({
    where: { firstName: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  return emp?.id ?? null;
}

async function findProduct(article) {
  if (!article) return null;
  const p = await prisma.product.findFirst({
    where: { article: { equals: article, mode: "insensitive" }, deletedAt: null },
    select: { id: true },
  });
  return p?.id ?? null;
}

(async () => {
  let created = 0,
    updated = 0,
    skipped = 0,
    links = 0,
    linksMatched = 0,
    contacts = 0,
    negs = 0;

  for (const s of data) {
    // Перезаписываем существующего (по nameEnglish): обновляем скаляры и
    // пересоздаём детей — чтобы повторный прогон применял обогащённые данные.
    const exists = await prisma.supplier.findFirst({
      where: { nameEnglish: s.nameEnglish, deletedAt: null },
      select: { id: true },
    });

    const buyerId = await findBuyer(s.buyer);

    // контакты
    const contactRows = [];
    s.managers.forEach((m, i) => {
      contactRows.push({
        type: "SUPPLIER_MANAGER",
        name: m.name || m.fullText || "Менеджер",
        phone: m.phone || null,
        preferredContact: preferredContactOf(m.fullText),
        description: m.fullText && m.fullText !== m.name ? m.fullText : null,
        isPrimary: i === 0, // ровно один primary среди менеджеров
      });
    });
    s.bosses.forEach((b, i) => {
      contactRows.push({
        type: "SUPPLIER_BOSS",
        name: b.name || b.fullText || "Руководитель",
        phone: b.phone || null,
        preferredContact: preferredContactOf(b.fullText),
        description: b.fullText && b.fullText !== b.name ? b.fullText : null,
        isPrimary: i === 0, // ровно один primary среди боссов
      });
    });

    // привязки товаров: сначала визуальный матч (по строке Excel), иначе по article
    const linkRows = [];
    const usedPids = new Set(); // дедуп: один productId на поставщика (unique constraint)
    for (const pl of s.productLinks) {
      let productId = null;
      const vm = matchByRow[pl.row];
      if (vm && vm.sku) {
        const p = await prisma.product.findUnique({
          where: { sku: vm.sku },
          select: { id: true },
        });
        productId = p?.id ?? null;
      }
      if (!productId) productId = await findProduct(pl.article);
      if (productId && usedPids.has(productId)) continue; // дубль строки Excel — пропускаем
      if (productId) {
        usedPids.add(productId);
        linksMatched++;
      }
      linkRows.push({
        productId,
        productNameFallback: productId ? null : pl.productNameFallback || pl.article || null,
        leadTimeDays: pl.leadTimeDays ?? null,
        leadTimeComment: pl.leadTimeComment ?? null,
        unitPrice: pl.unitPrice ?? null,
        currency: pl.currency ?? null,
        deliveryType: pl.deliveryType ?? null,
        deliveryComment: pl.deliveryComment ?? null,
        exclusivityStatus: !!pl.exclusivityStatus,
        exclusivityTerms: pl.exclusivityTerms ?? null,
        depositPct: pl.depositPct ?? null,
        balancePct: pl.balancePct ?? null,
        deferralTerms: pl.deferralTerms ?? null,
        inspectionAddress: pl.inspectionAddress ?? null,
      });
    }

    // переговоры (goals обязателен → коалесцируем)
    const negRows = s.negotiations.map((n) => ({
      date: new Date(n.date + "T00:00:00Z"),
      goals: n.goals || "(цель не указана в Excel)",
      summary: n.summary || null,
    }));

    const scalars = {
      nameForeign: s.nameForeign,
      nameEnglish: s.nameEnglish,
      buyerEmployeeId: buyerId,
      cooperationSummary: s.cooperationSummary || null,
    };
    const children = {
      contacts: contactRows.length ? { create: contactRows } : undefined,
      productLinks: linkRows.length ? { create: linkRows } : undefined,
      negotiations: negRows.length ? { create: negRows } : undefined,
    };

    if (exists) {
      // удаляем старых детей и пересоздаём (Negotiation* каскадятся)
      await prisma.$transaction([
        prisma.supplierContact.deleteMany({ where: { supplierId: exists.id } }),
        prisma.supplierProductLink.deleteMany({ where: { supplierId: exists.id } }),
        prisma.negotiation.deleteMany({ where: { supplierId: exists.id } }),
        prisma.supplier.update({ where: { id: exists.id }, data: { ...scalars, ...children } }),
      ]);
      updated++;
    } else {
      await prisma.supplier.create({ data: { ...scalars, ...children } });
      created++;
    }
    contacts += contactRows.length;
    links += linkRows.length;
    negs += negRows.length;
    console.log(
      `${exists ? "↻" : "+"} ${s.nameEnglish} | закупщик:${buyerId ? "✓" : "—"} | контактов:${contactRows.length} | товаров:${linkRows.length} | переговоров:${negRows.length}`
    );
  }

  console.log(
    `\nИТОГО: создано ${created}, обновлено ${updated}, пропущено ${skipped} | контактов ${contacts} | привязок ${links} (с productId: ${linksMatched}) | переговоров ${negs}`
  );
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("ОШИБКА:", e);
  await prisma.$disconnect();
  process.exit(1);
});
