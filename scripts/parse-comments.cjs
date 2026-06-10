// Парсит примечания к ячейкам (xl/comments1.xml) и привязывает к строке/колонке.
const fs = require("fs");
const xml = fs.readFileSync("scripts/_xlsx/xl/comments1.xml", "utf8");

// колонка A=0, B=1 ... → индекс
function colToIdx(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
const COLNAME = {
  0: "группа/арт", 1: "Артикул", 2: "ABC", 3: "Закупщик", 4: "Поставщик",
  5: "MOQ", 6: "Срок готовности", 7: "Цена карго", 8: "Цена белый",
  9: "Эксклюзив статус", 10: "Эксклюзив условия", 11: "График оплаты",
  12: "Оплата карго", 13: "Оплата белый", 14: "Менеджер", 15: "Босс",
  16: "Резюме сотр-ва", 17: "Переговоры: дата ближ", 18: "Цель",
  19: "Цель по цене", 20: "Перег1 дата", 21: "Перег1 резюме",
  22: "Перег2 дата", 23: "Перег2 резюме", 24: "Перег3 дата", 25: "Перег3 резюме",
  26: "Доп. инфо",
};

const out = [];
const blocks = xml.split(/<comment\b/).slice(1);
for (const b of blocks) {
  const ref = (b.match(/ref="([A-Z]+)(\d+)"/) || []);
  if (!ref.length) continue;
  const col = colToIdx(ref[1]);
  const row = parseInt(ref[2], 10) - 1; // 1-based в xlsx → 0-based как в sheet_to_json
  // собрать весь текст из <t>...</t>
  const texts = [...b.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]);
  let text = texts
    .join("")
    .replace(/&#10;/g, "\n").replace(/&#13;/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    // текст в примечаниях двойне-экранирован: после декодирования всплывают
    // литеральные теги вида <t xml:space="preserve"> и </t> — вычищаем их.
    .replace(/<\/?t\b[^>]*>/g, "")
    .replace(/<\/?r\b[^>]*>/g, "")
    .replace(/<rPr>[\s\S]*?<\/rPr>/g, "")
    .replace(/<\/?text\b[^>]*>/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // часто первая строка — имя автора + ":" — оставляем как есть
  out.push({ cell: ref[1] + ref[2], row, col, colName: COLNAME[col] || `col${col}`, text });
}
out.sort((a, b) => a.row - b.row || a.col - b.col);
fs.writeFileSync("scripts/comments-parsed.json", JSON.stringify(out, null, 2));
console.log("примечаний:", out.length);
out.forEach((c) => console.log(`\nR${c.row} [${c.colName}] ${c.cell}:\n  ${c.text.replace(/\n/g, "\n  ").slice(0, 400)}`));
