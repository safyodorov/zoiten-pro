const fs = require("fs");
const path = require("path");
const root = process.cwd().split(path.sep).join("/");
const c = JSON.parse(fs.readFileSync("scripts/match-clusters.json", "utf8"));
const exDir = root + "/scripts/excel-images/";
const dbDir = root + "/scripts/db-images/";
const agents = {
  A: ["Вакууматор"],
  B: ["Аэрогриль", "Кофемашина", "Чайник"],
  C: ["Паровая швабра", "Пароочиститель", "Пылесос моющий вертикальный"],
  D: ["Выпрямитель для волос", "Массажёр для ног"],
  E: ["Пылесос", "Пылесос сухой вертикальный"],
};
fs.mkdirSync("scripts/match-agents", { recursive: true });
for (const [a, subs] of Object.entries(agents)) {
  const payload = { subcategories: {} };
  for (const s of subs) {
    if (!c[s]) continue;
    payload.subcategories[s] = {
      excel: c[s].excel.map((e) => ({ path: exDir + e.file, article: e.article, supplier: e.supplier })),
      dbCandidates: c[s].db.map((d) => ({ path: dbDir + d.file, sku: d.sku, article: d.article, name: d.name })),
    };
  }
  fs.writeFileSync("scripts/match-agents/agent" + a + ".json", JSON.stringify(payload, null, 2));
  const ne = subs.reduce((n, s) => n + (c[s] ? c[s].excel.length : 0), 0);
  const nd = subs.reduce((n, s) => n + (c[s] ? c[s].db.length : 0), 0);
  console.log("agent" + a, subs.join("+"), "| excel", ne, "| db", nd);
}
