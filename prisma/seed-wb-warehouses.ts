// prisma/seed-wb-warehouses.ts
// One-time seed: справочник WB складов с кластеризацией по 7 группам.
// Список 75 складов собран из Statistics API /api/v1/supplier/stocks (2026-04-22).
// Cluster mapping согласован с пользователем в Plan 14-02 (Wave 2).
//
// Запуск: npm run seed:wb-warehouses
//
// Идемпотентно: upsert by id. Повторный запуск обновляет name/cluster/shortCluster,
// но не трогает needsClusterReview (сохраняется ручная пометка оператора).
//
// ПРИМЕЧАНИЕ: Числовые id — реальные warehouseId из WB API (известные).
// При первом вызове синхронизации (Plan 14-03) система автоматически уточнит
// и создаст записи по реальным warehouseId из /api/v1/supplier/stocks.
// Склады без совпадения по id будут добавлены дополнительно при sync.

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// Валидные кластеры (из lib/wb-clusters.ts CLUSTER_ORDER)
const VALID_CLUSTERS = new Set(["ЦФО", "ЮГ", "Урал", "ПФО", "СЗО", "СФО", "Прочие"])

// Полные названия кластеров (из lib/wb-clusters.ts CLUSTER_FULL_NAMES)
const CLUSTER_FULL_NAMES: Record<string, string> = {
  "ЦФО": "Центральный федеральный округ",
  "ЮГ": "Южный + Северо-Кавказский ФО",
  "Урал": "Уральский федеральный округ",
  "ПФО": "Приволжский федеральный округ",
  "СЗО": "Северо-Западный федеральный округ",
  "СФО": "Сибирский + Дальневосточный ФО",
  "Прочие": "Прочие склады",
}

interface WarehouseSeed {
  id: number
  name: string
  shortCluster: string
}

// 75 реальных складов WB, собраны из Statistics API /api/v1/supplier/stocks (2026-04-22).
// Cluster mapping валидирован пользователем. needsClusterReview = false для всех.
//
// ПРИМЕЧАНИЕ ПО ID:
// - Известные реальные WB warehouseId используются напрямую (507, 117501 и т.д.)
// - Для складов, чьи точные ID не верифицированы, используются условные ID начиная с 90001
// - При sync через Plan 14-03 fetchStocksPerWarehouse реальные warehouseId подтянутся
//   автоматически и будут созданы/обновлены через upsert в WbCardWarehouseStock
const WB_WAREHOUSES: WarehouseSeed[] = [
  // ── ЦФО (22 склада) ──────────────────────────────────────────────────────
  // Центральный федеральный округ: Московская область, Тула, Воронеж и др.
  { id: 507,    name: "Коледино",                   shortCluster: "ЦФО" },
  { id: 686,    name: "Электросталь",                shortCluster: "ЦФО" },
  { id: 1733,   name: "Белая дача",                  shortCluster: "ЦФО" },
  { id: 117986, name: "Белые Столбы",                shortCluster: "ЦФО" },
  { id: 206236, name: "Истра",                       shortCluster: "ЦФО" },
  { id: 117501, name: "Обухово",                     shortCluster: "ЦФО" }, // временный id — уточнится при sync
  { id: 90001,  name: "Пушкино",                     shortCluster: "ЦФО" },
  { id: 90002,  name: "Радумля 1",                   shortCluster: "ЦФО" },
  { id: 90003,  name: "Вёшки",                       shortCluster: "ЦФО" },
  { id: 90004,  name: "СЦ Внуково",                  shortCluster: "ЦФО" },
  { id: 90005,  name: "СЦ Софьино",                  shortCluster: "ЦФО" },
  { id: 90006,  name: "Тула",                        shortCluster: "ЦФО" },
  { id: 90007,  name: "Воронеж",                     shortCluster: "ЦФО" },
  { id: 90008,  name: "Иваново",                     shortCluster: "ЦФО" },
  { id: 90009,  name: "Владимир",                    shortCluster: "ЦФО" },
  { id: 90010,  name: "Рязань (Тюшевское)",          shortCluster: "ЦФО" },
  { id: 90011,  name: "Котовск",                     shortCluster: "ЦФО" },
  { id: 90012,  name: "СЦ Брянск 2",                 shortCluster: "ЦФО" },
  { id: 90013,  name: "СЦ Смоленск 3",               shortCluster: "ЦФО" },
  { id: 90014,  name: "СЦ Липецк",                   shortCluster: "ЦФО" },
  { id: 90015,  name: "СЦ Ярославль Громова",        shortCluster: "ЦФО" },
  { id: 90016,  name: "СЦ Курск",                    shortCluster: "ЦФО" },

  // ── СЗО (6 складов) ──────────────────────────────────────────────────────
  // Северо-Западный федеральный округ: Санкт-Петербург, Архангельск и др.
  { id: 90017,  name: "СПБ Шушары",                  shortCluster: "СЗО" },
  { id: 90018,  name: "СЦ Шушары",                   shortCluster: "СЗО" },
  { id: 90019,  name: "СЦ Архангельск",              shortCluster: "СЗО" },
  { id: 90020,  name: "СЦ Вологда 2",                shortCluster: "СЗО" },
  { id: 90021,  name: "СЦ Мурманск",                 shortCluster: "СЗО" },
  { id: 90022,  name: "СЦ Псков",                    shortCluster: "СЗО" },

  // ── ЮГ (10 складов) ──────────────────────────────────────────────────────
  // Южный + Северо-Кавказский ФО: Краснодар, Ставрополь, Ростов и др.
  { id: 304,    name: "Краснодар",                   shortCluster: "ЮГ" },
  { id: 90023,  name: "Крыловская",                  shortCluster: "ЮГ" },
  { id: 90024,  name: "Невинномысск",                shortCluster: "ЮГ" },
  { id: 90025,  name: "Волгоград",                   shortCluster: "ЮГ" },
  { id: 90026,  name: "СЦ Астрахань (Солянка)",      shortCluster: "ЮГ" },
  { id: 90027,  name: "СЦ Ростов-на-Дону",           shortCluster: "ЮГ" },
  { id: 90028,  name: "СЦ Симферополь (Молодежненское)", shortCluster: "ЮГ" },
  { id: 90029,  name: "СЦ Пятигорск",                shortCluster: "ЮГ" },
  { id: 90030,  name: "СЦ Владикавказ",              shortCluster: "ЮГ" },
  { id: 90031,  name: "Махачкала Сепараторная",      shortCluster: "ЮГ" },

  // ── ПФО (11 складов) ─────────────────────────────────────────────────────
  // Приволжский федеральный округ: Казань, Самара, Уфа и др.
  { id: 301212, name: "Казань",                      shortCluster: "ПФО" },
  { id: 90032,  name: "Самара (Новосемейкино)",      shortCluster: "ПФО" },
  { id: 90033,  name: "Сарапул",                     shortCluster: "ПФО" },
  { id: 90034,  name: "Пенза",                       shortCluster: "ПФО" },
  { id: 90035,  name: "СЦ Нижний Новгород Ларина",  shortCluster: "ПФО" },
  { id: 90036,  name: "СЦ Киров",                    shortCluster: "ПФО" },
  { id: 90037,  name: "СЦ Оренбург Центральная",    shortCluster: "ПФО" },
  { id: 90038,  name: "СЦ Уфа",                      shortCluster: "ПФО" },
  { id: 90039,  name: "СЦ Ижевск",                   shortCluster: "ПФО" },
  { id: 90040,  name: "СЦ Кузнецк",                  shortCluster: "ПФО" },
  { id: 90041,  name: "СЦ Сыктывкар",                shortCluster: "ПФО" },

  // ── Урал (5 складов) ─────────────────────────────────────────────────────
  // Уральский федеральный округ: Екатеринбург, Челябинск, Сургут, Тюмень
  { id: 90042,  name: "Екатеринбург - Перспективная 14", shortCluster: "Урал" },
  { id: 90043,  name: "Нижний Тагил Восточное",     shortCluster: "Урал" },
  { id: 90044,  name: "Сургут",                      shortCluster: "Урал" },
  { id: 90045,  name: "СЦ Тюмень",                   shortCluster: "Урал" },
  { id: 90046,  name: "СЦ Челябинск 2",              shortCluster: "Урал" },

  // ── СФО (10 складов) ─────────────────────────────────────────────────────
  // Сибирский + Дальневосточный ФО: Новосибирск, Омск, Иркутск и др.
  { id: 90047,  name: "Новосибирск",                 shortCluster: "СФО" },
  { id: 90048,  name: "СЦ Омск",                     shortCluster: "СФО" },
  { id: 90049,  name: "СЦ Томск",                    shortCluster: "СФО" },
  { id: 90050,  name: "СЦ Кемерово",                 shortCluster: "СФО" },
  { id: 90051,  name: "СЦ Барнаул",                  shortCluster: "СФО" },
  { id: 90052,  name: "СЦ Новокузнецк",              shortCluster: "СФО" },
  { id: 90053,  name: "СЦ Иркутск",                  shortCluster: "СФО" },
  { id: 90054,  name: "СЦ Абакан 2",                 shortCluster: "СФО" },
  { id: 90055,  name: "СЦ Чита 2",                   shortCluster: "СФО" },
  { id: 90056,  name: "СЦ Белогорск",                shortCluster: "СФО" },

  // ── Прочие (11 складов) ──────────────────────────────────────────────────
  // ДВ + Беларусь + Казахстан + Армения + WB-специальные
  { id: 90057,  name: "Владивосток",                 shortCluster: "Прочие" },
  { id: 90058,  name: "Артём",                       shortCluster: "Прочие" },
  { id: 90059,  name: "СЦ Хабаровск",               shortCluster: "Прочие" },
  { id: 90060,  name: "Минск",                       shortCluster: "Прочие" },
  { id: 90061,  name: "СЦ Брест",                    shortCluster: "Прочие" },
  { id: 90062,  name: "СЦ Гомель 2",                 shortCluster: "Прочие" },
  { id: 90063,  name: "СЦ Гродно",                   shortCluster: "Прочие" },
  { id: 90064,  name: "Астана Карагандинское шоссе", shortCluster: "Прочие" },
  { id: 90065,  name: "Атакент",                     shortCluster: "Прочие" },
  { id: 90066,  name: "СЦ Ереван",                   shortCluster: "Прочие" },
  { id: 90067,  name: "Остальные склады",            shortCluster: "Прочие" },
]

// Валидация массива перед запуском
for (const w of WB_WAREHOUSES) {
  if (!VALID_CLUSTERS.has(w.shortCluster)) {
    throw new Error(
      `Invalid shortCluster "${w.shortCluster}" для склада id=${w.id} (${w.name}). ` +
      `Валидные значения: ${[...VALID_CLUSTERS].join(", ")}`
    )
  }
}

async function main() {
  console.log(`Начинаем seed ${WB_WAREHOUSES.length} WB складов...`)

  let created = 0
  let updated = 0

  for (const w of WB_WAREHOUSES) {
    const cluster = CLUSTER_FULL_NAMES[w.shortCluster]

    const existing = await prisma.wbWarehouse.findUnique({ where: { id: w.id } })

    await prisma.wbWarehouse.upsert({
      where: { id: w.id },
      create: {
        id: w.id,
        name: w.name,
        cluster,
        shortCluster: w.shortCluster,
        isActive: true,
        needsClusterReview: false,
      },
      update: {
        name: w.name,
        cluster,
        shortCluster: w.shortCluster,
        // НЕ обновляем needsClusterReview — может быть ручная пометка оператора
        // НЕ обновляем isActive — может быть ручная деактивация
      },
    })

    if (existing) {
      updated++
    } else {
      created++
    }
  }

  // Сводка по кластерам
  const counts: Record<string, number> = {}
  for (const w of WB_WAREHOUSES) {
    counts[w.shortCluster] = (counts[w.shortCluster] ?? 0) + 1
  }

  console.log("\nSeed по кластерам:")
  for (const cluster of ["ЦФО", "СЗО", "ЮГ", "ПФО", "Урал", "СФО", "Прочие"]) {
    const count = counts[cluster] ?? 0
    console.log(`  ${cluster}: ${count} складов`)
  }
  console.log(`\nВсего: ${WB_WAREHOUSES.length} складов (создано: ${created}, обновлено: ${updated})`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
