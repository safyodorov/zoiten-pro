// Парсер "БД поставщики.xlsx" → структурированный JSON под схему Supplier.
// Запуск: node scripts/parse-suppliers-xlsx.cjs  → пишет scripts/suppliers-parsed.json
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const SRC = process.argv[2] || path.join(process.cwd(), "БД поставщики.xlsx");
const OUT = path.join(__dirname, "suppliers-parsed.json");

const wb = XLSX.readFile(SRC);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

// Примечания к ячейкам (xl/comments1.xml) — в них развёрнутые резюме переговоров,
// полные резюме сотрудничества и адреса. Грузим из scripts/comments-parsed.json
// (создаётся scripts/parse-comments.cjs). Ключ: "row|col" (0-based как в sheet_to_json).
const commentsByCell = {};
try {
  const cmts = JSON.parse(fs.readFileSync(path.join(__dirname, "comments-parsed.json"), "utf8"));
  for (const c of cmts) commentsByCell[`${c.row}|${c.col}`] = c.text;
} catch {
  console.warn("⚠ comments-parsed.json не найден — запусти parse-comments.cjs (примечания не будут перенесены)");
}

const clean = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\r/g, "").replace(/\s+\n/g, "\n").trim();
  return s === "" ? null : s;
};
const collapse = (v) => {
  const s = clean(v);
  return s ? s.replace(/\s+/g, " ").trim() : null;
};

// Excel serial → ISO date (1900 date system)
function excelDate(n) {
  if (typeof n !== "number" || n < 20000 || n > 80000) return null;
  const ms = Math.round((n - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

// "30% предоплата, 70% перед отгрузкой" → {deposit:30, balance:70}
function parsePayment(s) {
  if (!s) return { deposit: null, balance: null };
  const pcts = (String(s).match(/(\d+(?:[.,]\d+)?)\s*%/g) || []).map((x) =>
    parseFloat(x.replace(/[^0-9.,]/g, "").replace(",", "."))
  );
  if (pcts.length >= 2) return { deposit: pcts[0], balance: pcts[1] };
  if (pcts.length === 1) return { deposit: pcts[0], balance: 100 - pcts[0] };
  return { deposit: null, balance: null };
}

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const COL = {
  group: 0, article: 1, abc: 2, buyer: 3, supplier: 4, moq: 5, lead: 6,
  priceCargo: 7, priceWhite: 8, exclStatus: 9, exclTerms: 10, supplyTerms: 11,
  payCargo: 12, payWhite: 13, manager: 14, boss: 15, coop: 16,
  negNextDate: 17, negGoal: 18, negPriceGoal: 19,
  d1: 20, s1: 21, d2: 22, s2: 23, d3: 24, s3: 25, extra: 26,
};

const suppliers = new Map(); // key: normalized nameForeign
let curGroup = "";
let unassigned = 0;

for (let i = 6; i < rows.length; i++) {
  const r = rows[i];
  if (!r) continue;
  const nonNull = r.filter((x) => x !== null && String(x).trim() !== "").length;
  // строка-заголовок группы: заполнена только колонка 0
  if (r[COL.group] && nonNull <= 1) {
    curGroup = clean(r[COL.group]);
    continue;
  }
  const supRaw = collapse(r[COL.supplier]);
  const article = clean(r[COL.article]);
  if (!supRaw && !article) continue; // пустая строка
  // "Общий" / "A" — псевдо-поставщики (пометки/заголовки без реального источника)
  if (!supRaw || supRaw.toLowerCase() === "общий" || /^[a-zа-я]$/i.test(supRaw)) {
    unassigned++;
    continue;
  }

  const key = supRaw.toLowerCase();
  if (!suppliers.has(key)) {
    suppliers.set(key, {
      rawName: clean(r[COL.supplier]), // с переносами строк
      buyer: clean(r[COL.buyer]),
      cooperationSummary: clean(r[COL.coop]),
      managers: new Map(),
      bosses: new Map(),
      productLinks: [],
      negotiations: [],
      coopComments: new Set(), // развёрнутые резюме сотр-ва из примечаний
      addresses: new Set(), // адреса офис/производство из примечаний к колонке Поставщик
      _negSeen: new Set(),
      _rowIndex: i,
    });
  }
  const sup = suppliers.get(key);
  // примечание к ячейке текущей строки i по колонке col
  const cmtAt = (col) => commentsByCell[`${i}|${col}`] || null;
  if (!sup.buyer && clean(r[COL.buyer])) sup.buyer = clean(r[COL.buyer]);
  if (!sup.cooperationSummary && clean(r[COL.coop]))
    sup.cooperationSummary = clean(r[COL.coop]);
  // развёрнутое резюме сотрудничества (примечание к колонке «Резюме сот-ва»)
  const coopCmt = cmtAt(COL.coop);
  if (coopCmt) sup.coopComments.add(coopCmt);
  // адрес (примечание к колонке «Поставщик»)
  const addrCmt = cmtAt(COL.supplier);
  if (addrCmt) sup.addresses.add(addrCmt);

  // контакты (дедуп по имени)
  const mgr = clean(r[COL.manager]);
  if (mgr && !sup.managers.has(mgr.replace(/\s+/g, " "))) {
    const phoneMatch = mgr.match(/(\+?\d[\d\s-]{6,}\d)/);
    sup.managers.set(mgr.replace(/\s+/g, " "), {
      name: mgr.split(/\n/)[0].trim(),
      fullText: mgr.replace(/\n/g, " ").trim(),
      phone: phoneMatch ? phoneMatch[1].replace(/\s+/g, " ").trim() : null,
    });
  }
  const boss = clean(r[COL.boss]);
  if (boss && !sup.bosses.has(boss.replace(/\s+/g, " "))) {
    const phoneMatch = boss.match(/(\+?\d[\d\s-]{6,}\d)/);
    sup.bosses.set(boss.replace(/\s+/g, " "), {
      name: boss.split(/\n/)[0].trim(),
      fullText: boss.replace(/\n/g, " ").trim(),
      phone: phoneMatch ? phoneMatch[1].replace(/\s+/g, " ").trim() : null,
    });
  }

  // График оплаты (deposit/balance) лежит в col11 "Условия поставки, отсрочки".
  // col12/13 "Условия оплаты" = СПОСОБ оплаты (вичат / банк), а не проценты.
  const scheduleRaw = clean(r[COL.supplyTerms]);
  const pay = parsePayment(scheduleRaw);
  const payMethodCargo = clean(r[COL.payCargo]);
  const payMethodWhite = clean(r[COL.payWhite]);

  const priceCargo = num(r[COL.priceCargo]);
  const priceWhite = num(r[COL.priceWhite]);
  const deliveryType =
    priceCargo != null ? "CARGO" : priceWhite != null ? "WHITE" : null;
  const unitPrice = priceCargo != null ? priceCargo : priceWhite;

  const exclStatusRaw = (clean(r[COL.exclStatus]) || "").toLowerCase();
  const exclusivityStatus = exclStatusRaw.startsWith("ест");

  const moq = num(r[COL.moq]);
  const abc = clean(r[COL.abc]);
  const leadComment = [
    moq != null ? `MOQ: ${moq} шт` : null,
    abc ? `ABC: ${abc}` : null,
  ].filter(Boolean).join("; ") || null;
  const whiteCmt = cmtAt(COL.priceWhite); // примечание к «Цена белый»
  const deliveryComment = [
    payMethodCargo ? `Оплата (карго): ${payMethodCargo}` : null,
    payMethodWhite ? `Оплата (белый): ${payMethodWhite}` : null,
    priceCargo != null && priceWhite != null ? `Белая цена: ${priceWhite} ¥` : null,
    whiteCmt ? `Заметка по белой цене: ${whiteCmt}` : null,
  ].filter(Boolean).join("; ") || null;
  const schedCmt = cmtAt(COL.supplyTerms); // примечание к «График оплаты»

  const pl = {
    row: i,
    article,
    group: curGroup,
    productNameFallback: [curGroup, article].filter(Boolean).join(" ").trim() || null,
    leadTimeDays: num(r[COL.lead]) != null ? Math.round(num(r[COL.lead])) : null,
    leadTimeComment: leadComment,
    unitPrice,
    currency: unitPrice != null ? "CNY" : null,
    deliveryType,
    deliveryComment,
    exclusivityStatus,
    exclusivityTerms: clean(r[COL.exclTerms]),
    depositPct: pay.deposit,
    balancePct: pay.balance,
    deferralTerms: [scheduleRaw, schedCmt ? `(заметка: ${schedCmt})` : null]
      .filter(Boolean).join(" ") || null,
    inspectionAddress: clean(r[COL.extra]),
  };
  // пропускаем полностью пустые привязки (нет артикула и нет данных)
  const hasData = pl.article || pl.unitPrice != null || pl.leadTimeDays != null ||
    pl.exclusivityTerms || pl.deferralTerms || pl.leadTimeComment;
  if (hasData) sup.productLinks.push(pl);

  // negotiations (на уровне поставщика, дедуп по дате+резюме)
  const addNeg = (date, summary, goals) => {
    const iso = excelDate(num(date));
    const sum = clean(summary);
    if (!iso && !sum) return;
    const sig = `${iso || ""}|${sum || ""}`;
    if (sup._negSeen.has(sig)) return;
    sup._negSeen.add(sig);
    sup.negotiations.push({
      date: iso,
      goals: goals || null,
      summary: sum,
    });
  };
  const goalText = [clean(r[COL.negGoal]), clean(r[COL.negPriceGoal]) ? `цена: ${clean(r[COL.negPriceGoal])}` : null]
    .filter(Boolean).join("; ") || null;
  // Резюме переговоров: предпочитаем РАЗВЁРНУТОЕ примечание к ячейке резюме,
  // иначе короткое значение ячейки.
  addNeg(r[COL.negNextDate], cmtAt(COL.negNextDate), goalText);
  addNeg(r[COL.d1], cmtAt(COL.s1) || r[COL.s1], goalText);
  addNeg(r[COL.d2], cmtAt(COL.s2) || r[COL.s2], null);
  addNeg(r[COL.d3], cmtAt(COL.s3) || r[COL.s3], null);
}

const hasLatin = (s) => /[A-Za-z]/.test(s);
const hasCJK = (s) => /[一-鿿]/.test(s);
const looksAddress = (s) => /^\s*No\.?\s*\d|Road|China|Zone|Guangdong|Anhui|Zhejiang|Province/i.test(s);

// Разбор склеенного названия → {nameForeign, nameEnglish, extra}
function splitName(raw) {
  const lines = raw.split(/\n|\s\/\s|\/(?=\s*[A-Za-z一-鿿])/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const nameLines = lines.filter((l) => !looksAddress(l) && !l.startsWith("|"));
  const extraLines = lines.filter((l) => looksAddress(l) || l.startsWith("|"));
  const english = nameLines.find(hasLatin) || lines.find(hasLatin) || nameLines[0] || raw.replace(/\s+/g, " ").trim();
  const foreign = nameLines.find(hasCJK) || english;
  return {
    nameEnglish: english,
    nameForeign: foreign,
    extra: extraLines.length ? extraLines.join("; ") : null,
  };
}

// финализация: Map → массивы, отбрасываем полностью пустых поставщиков
const out = [...suppliers.values()]
  .map((s) => {
    const n = splitName(s.rawName);
    // Резюме сотрудничества: развёрнутые примечания (приоритет) + тонкое значение
    // ячейки + адреса из примечаний + адрес из названия.
    const coopParts = [...s.coopComments];
    if (s.cooperationSummary) coopParts.push(s.cooperationSummary);
    let coop = coopParts.join("\n\n");
    const addrParts = [...s.addresses];
    if (n.extra) addrParts.push(n.extra);
    if (addrParts.length) coop += (coop ? "\n\n" : "") + "📍 Адрес:\n" + addrParts.join("\n\n");
    coop = coop.trim() || null;
    return {
      nameForeign: n.nameForeign,
      nameEnglish: n.nameEnglish,
      buyer: s.buyer,
      cooperationSummary: coop,
      managers: [...s.managers.values()],
      bosses: [...s.bosses.values()],
      productLinks: s.productLinks,
      negotiations: s.negotiations,
    };
  })
  .filter(
    (s) =>
      s.productLinks.length > 0 ||
      s.managers.length > 0 ||
      s.bosses.length > 0 ||
      s.negotiations.length > 0
  );

fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf8");
console.log(`Поставщиков: ${out.length}`);
console.log(`Товарных привязок всего: ${out.reduce((a, s) => a + s.productLinks.length, 0)}`);
console.log(`Контактов-менеджеров: ${out.reduce((a, s) => a + s.managers.length, 0)}`);
console.log(`Контактов-боссов: ${out.reduce((a, s) => a + s.bosses.length, 0)}`);
console.log(`Переговоров: ${out.reduce((a, s) => a + s.negotiations.length, 0)}`);
console.log(`Строк без поставщика (пропущено): ${unassigned}`);
console.log(`\n=== Примеры (3 поставщика) ===`);
console.log(JSON.stringify(out.slice(0, 3), null, 2));
