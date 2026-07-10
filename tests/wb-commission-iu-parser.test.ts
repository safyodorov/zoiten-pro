import { describe, it, expect } from "vitest"
import { parseWbCommissionIuRows } from "@/lib/wb-commission-iu-parser"

// ──────────────────────────────────────────────────────────────────
// parseWbCommissionIuRows — синтетические тесты обоих форматов Excel ИУ
// ──────────────────────────────────────────────────────────────────
//
// WB сменил формат выгрузки комиссий ИУ ~07.07.2026 — колонки идут в другом
// порядке, чем раньше. Легаси-код читал по ФИКСИРОВАННЫМ позициям, поэтому
// с новым файлом в fbw ушёл бы «Самовывоз C&C» вместо «Склад WB (FBW)».
// Эти тесты — прямая проверка фикса (парсер маппит колонки по заголовкам).
//
// ZWSP (ZERO WIDTH SPACE, U+200B) в шапке нового формата записывается
// ИСКЛЮЧИТЕЛЬНО через ASCII-экранирование "\u200B" — никогда литеральным
// невидимым символом (см. CLAUDE.md / инструкции исполнения).

// Шапка НОВОГО формата (реальный образец commission.xlsx). Порядок колонок
// ПОЛНОСТЬЮ отличается от легаси: col2 = Самовывоз, НЕ Склад WB.
const NEW_HEADER = [
  "Категория",
  "Предмет",
  "Самовывоз из магазина продавца (C&C), %",
  "Витрина (DBS)/" + "\u200B" + "Курьер WB (DBW), %",
  "Витрина экспресс (EDBS), %",
  "Маркетплейс (FBS), %",
  "Склад WB (FBW), %",
  "Бронирование, %",
]

// Шапка ЛЕГАСИ (старого) формата — сохраняет прежнее поведение route.ts.
const LEGACY_HEADER = [
  "Категория",
  "Предмет",
  "Склад WB %",
  "Склад продавца %",
  "DBS %",
  "Экспресс %",
  "Самовывоз",
  "Бронирование",
]

describe("parseWbCommissionIuRows — новый формат (после ~07.07.2026)", () => {
  it("маппит fbw из «Склад WB (FBW)» (col6), а НЕ из «Самовывоз» (col2)", () => {
    const rows: unknown[][] = [
      NEW_HEADER,
      ["Одежда", "Футболки", 44.5, 10.5, 3, 12, 15, 5],
      ["Обувь", "Кроссовки", 40, 9, 2.5, 11, 14, 4],
    ]

    const result = parseWbCommissionIuRows(rows)
    expect(result).toHaveLength(2)

    const first = result[0]!
    expect(first.parentName).toBe("Одежда")
    expect(first.subjectName).toBe("Футболки")
    expect(first.pickup).toBe(44.5) // col2 «Самовывоз (C&C)»
    expect(first.dbs).toBe(10.5) // col3 «Витрина (DBS)/…Курьер WB (DBW)»
    expect(first.express).toBe(3) // col4 «Витрина экспресс (EDBS)»
    expect(first.fbs).toBe(12) // col5 «Маркетплейс (FBS)»
    expect(first.fbw).toBe(15) // col6 «Склад WB (FBW)» — НЕ 44.5 (Самовывоз)!
    expect(first.booking).toBe(5) // col7 «Бронирование»

    const second = result[1]!
    expect(second.fbw).toBe(14)
    expect(second.pickup).toBe(40)
  })

  it("строка с пустым предметом (col1 = '' или пробелы) пропускается", () => {
    const rows: unknown[][] = [
      NEW_HEADER,
      ["Одежда", "Футболки", 44.5, 10.5, 3, 12, 15, 5],
      ["Обувь", "   ", 40, 9, 2.5, 11, 14, 4], // пустой предмет (только пробелы)
      ["Спорт", "", 1, 1, 1, 1, 1, 1], // пустая строка
    ]

    const result = parseWbCommissionIuRows(rows)
    expect(result).toHaveLength(1)
    expect(result[0]!.subjectName).toBe("Футболки")
  })

  it("дубликат subjectName схлопывается — первая запись выигрывает", () => {
    const rows: unknown[][] = [
      NEW_HEADER,
      ["Одежда", "Футболки", 44.5, 10.5, 3, 12, 15, 5],
      ["Одежда", "Футболки", 1, 1, 1, 1, 999, 1], // дубликат, другие числа
    ]

    const result = parseWbCommissionIuRows(rows)
    expect(result).toHaveLength(1)
    expect(result[0]!.fbw).toBe(15) // первая запись, не 999
    expect(result[0]!.pickup).toBe(44.5)
  })

  it("неполный новый заголовок (есть «Маркетплейс», нет «Склад WB (FBW)») бросает русскую ошибку", () => {
    const incompleteHeader = [
      "Категория",
      "Предмет",
      "Самовывоз из магазина продавца (C&C), %",
      "Витрина (DBS)/" + "\u200B" + "Курьер WB (DBW), %",
      "Витрина экспресс (EDBS), %",
      "Маркетплейс (FBS), %",
      "Бронирование, %",
      // нет «Склад WB (FBW), %»
    ]
    const rows: unknown[][] = [
      incompleteHeader,
      ["Одежда", "Футболки", 44.5, 10.5, 3, 12, 5],
    ]

    expect(() => parseWbCommissionIuRows(rows)).toThrow(/не.*распозна|не.*найдена колонк/i)
  })
})

describe("parseWbCommissionIuRows — легаси формат (до ~07.07.2026)", () => {
  it("fbw=col2, fbs=dbs=col4, express=col5, pickup=col6, booking=col7", () => {
    const rows: unknown[][] = [
      LEGACY_HEADER,
      ["Одежда", "Футболки", 15, 999, 12, 3, 44.5, 5],
    ]

    const result = parseWbCommissionIuRows(rows)
    expect(result).toHaveLength(1)

    const rec = result[0]!
    expect(rec.parentName).toBe("Одежда")
    expect(rec.subjectName).toBe("Футболки")
    expect(rec.fbw).toBe(15) // col2
    expect(rec.fbs).toBe(12) // col4
    expect(rec.dbs).toBe(12) // col4 (то же значение — легаси пишет обе из одной колонки)
    expect(rec.express).toBe(3) // col5
    expect(rec.pickup).toBe(44.5) // col6
    expect(rec.booking).toBe(5) // col7
  })
})

describe("parseWbCommissionIuRows — общие случаи", () => {
  it("меньше 2 строк (нет данных, только шапка или пусто) → пустой массив", () => {
    expect(parseWbCommissionIuRows([])).toEqual([])
    expect(parseWbCommissionIuRows([NEW_HEADER])).toEqual([])
  })
})
