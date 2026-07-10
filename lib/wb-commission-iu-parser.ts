// lib/wb-commission-iu-parser.ts
// Pure-парсер Excel «Индивидуальные условия» WB для POST /api/wb-commission-iu.
//
// WB с ~07.07.2026 сменил порядок колонок в выгрузке — колонки нового формата
// определяются ПО ЗАГОЛОВКАМ (regex по нормализованной шапке), легаси-формат
// (до 07.07.2026) поддержан по прежним фиксированным позициям.
//
// Новый формат: Категория | Предмет | Самовывоз (C&C) | Витрина (DBS)/Курьер WB (DBW)
//   | Витрина экспресс (EDBS) | Маркетплейс (FBS) | Склад WB (FBW) | Бронирование
// Легаси:       Категория | Предмет | Склад WB % | Склад продавца % | DBS %
//   | Экспресс % | Самовывоз | Бронирование
//
// Маппинг нового формата верифицирован 1:1 против Tariffs API:
//   fbw=Склад WB (FBW)=paidStorageKgvp · fbs=Маркетплейс (FBS)=kgvpMarketplace ·
//   dbs=Витрина (DBS)/Курьер WB (DBW)=kgvpSupplier · express=EDBS=kgvpSupplierExpress ·
//   pickup=Самовывоз (C&C)=kgvpPickup · booking=Бронирование=kgvpBooking

export interface WbCommissionIuRecord {
  parentName: string
  subjectName: string
  fbw: number
  fbs: number
  dbs: number
  express: number
  pickup: number
  booking: number
}

type CommissionKey = keyof Omit<WbCommissionIuRecord, "parentName" | "subjectName">

// Нормализация ячейки шапки: WB вставляет ZERO-WIDTH SPACE (U+200B) в заголовок
// «Витрина (DBS)/Курьер WB (DBW)» — `\s` в regex его НЕ ловит, вычищаем явно
// (плюс BOM U+FEFF и NBSP U+00A0 на всякий случай).
function norm(cell: unknown): string {
  return String(cell ?? "")
    .replace(/\u200B/g, "")
    .replace(/\uFEFF/g, "")
    .replace(/\u00A0/g, " ")
    .trim()
}

// Заголовки нового формата. dbs матчим по префиксу до слэша — /витрина\s*\(dbs\)/,
// чтобы НЕ поймать «Витрина экспресс (EDBS)».
const NEW_FORMAT_COLUMNS: Array<{ key: CommissionKey; re: RegExp; label: string }> = [
  { key: "fbw", re: /склад\s*wb/i, label: "Склад WB (FBW)" },
  { key: "fbs", re: /маркетплейс/i, label: "Маркетплейс (FBS)" },
  { key: "dbs", re: /витрина\s*\(dbs\)/i, label: "Витрина (DBS)/Курьер WB (DBW)" },
  { key: "express", re: /экспресс/i, label: "Витрина экспресс (EDBS)" },
  { key: "pickup", re: /самовывоз/i, label: "Самовывоз (C&C)" },
  { key: "booking", re: /бронирование/i, label: "Бронирование" },
]

// Легаси-позиции — поведение старого route.ts 1:1 (fbs и dbs обе из col4).
const LEGACY_INDICES: Record<CommissionKey, number> = {
  fbw: 2,
  fbs: 4,
  dbs: 4,
  express: 5,
  pickup: 6,
  booking: 7,
}

/**
 * Парсит строки листа Excel (результат sheet_to_json с header:1) в записи
 * WbCommissionIu. Формат определяется по шапке (строка 0). Дубликаты
 * subjectName схлопываются — первая запись выигрывает (@unique в БД).
 *
 * @throws Error с русским сообщением, если новый формат распознан,
 *   но какая-то из 6 колонок комиссий не найдена.
 */
export function parseWbCommissionIuRows(rows: unknown[][]): WbCommissionIuRecord[] {
  if (rows.length < 2) return []

  const header = (rows[0] ?? []).map(norm)

  // Сигнал нового формата: «Маркетплейс» или «(FBW)» в шапке — в легаси их нет.
  const isNew = header.some((h) => /маркетплейс/i.test(h) || /\(fbw\)/i.test(h))

  let indices: Record<CommissionKey, number>
  if (isNew) {
    indices = {} as Record<CommissionKey, number>
    for (const { key, re, label } of NEW_FORMAT_COLUMNS) {
      const idx = header.findIndex((h) => re.test(h))
      if (idx === -1) {
        throw new Error(
          `Не распознан формат файла ИУ: не найдена колонка «${label}». Проверьте выгрузку WB.`
        )
      }
      indices[key] = idx
    }
  } else {
    indices = LEGACY_INDICES
  }

  const num = (row: unknown[], key: CommissionKey): number =>
    parseFloat(String(row[indices[key]])) || 0

  const records: WbCommissionIuRecord[] = []
  const seen = new Set<string>()

  // parentName/subjectName всегда по позициям col0/col1 — одинаковы в обоих форматах.
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !row[0] || !row[1]) continue

    const parentName = String(row[0]).trim()
    const subjectName = String(row[1]).trim()
    if (!subjectName || seen.has(subjectName)) continue
    seen.add(subjectName)

    records.push({
      parentName,
      subjectName,
      fbw: num(row, "fbw"),
      fbs: num(row, "fbs"),
      dbs: num(row, "dbs"),
      express: num(row, "express"),
      pickup: num(row, "pickup"),
      booking: num(row, "booking"),
    })
  }

  return records
}
