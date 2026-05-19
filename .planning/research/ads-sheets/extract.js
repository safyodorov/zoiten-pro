#!/usr/bin/env node
// Minimal XLSX → CSV extractor. Takes path to unpacked .xlsx folder + sheet number.
// Usage: node extract.js <unpacked-dir> <sheetNumber> [maxRows]
const fs = require("fs")
const path = require("path")

const [, , unpackedDir, sheetNumStr, maxRowsStr] = process.argv
if (!unpackedDir || !sheetNumStr) {
  console.error("usage: node extract.js <unpacked-dir> <sheetNum> [maxRows]")
  process.exit(1)
}
const maxRows = maxRowsStr ? parseInt(maxRowsStr, 10) : Infinity

const sharedStringsPath = path.join(unpackedDir, "xl", "sharedStrings.xml")
const sheetPath = path.join(unpackedDir, "xl", "worksheets", `sheet${sheetNumStr}.xml`)

// Parse sharedStrings — array of <si><t>text</t></si>
function loadSharedStrings() {
  if (!fs.existsSync(sharedStringsPath)) return []
  const xml = fs.readFileSync(sharedStringsPath, "utf8")
  const strings = []
  // Each <si> may have <t> directly OR <r><t> blocks (rich text). Concatenate all <t> inside <si>.
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g
  const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g
  let m
  while ((m = siRe.exec(xml)) !== null) {
    const inner = m[1]
    let s = ""
    let tm
    while ((tm = tRe.exec(inner)) !== null) {
      s += decodeXmlEntities(tm[1])
    }
    strings.push(s)
  }
  return strings
}

function decodeXmlEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#10;/g, "\n")
    .replace(/&#9;/g, "\t")
    .replace(/&amp;/g, "&")
}

function colLetterToIndex(letter) {
  let n = 0
  for (let i = 0; i < letter.length; i++) {
    n = n * 26 + (letter.charCodeAt(i) - 64)
  }
  return n - 1
}

function csvEscape(v) {
  if (v == null) return ""
  const s = String(v)
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

const strings = loadSharedStrings()
const xml = fs.readFileSync(sheetPath, "utf8")

// Iterate rows
const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g
const cellRe = /<c\s+r="([A-Z]+)(\d+)"(?:\s+s="\d+")?(?:\s+t="([^"]+)")?[^>]*>([\s\S]*?)<\/c>|<c\s+r="([A-Z]+)(\d+)"(?:\s+s="\d+")?(?:\s+t="([^"]+)")?[^\/]*\/>/g
let rowMatch
let outRows = []
let rowCount = 0

while ((rowMatch = rowRe.exec(xml)) !== null) {
  if (rowCount >= maxRows) break
  const cells = {}
  const inner = rowMatch[1]
  let cm
  cellRe.lastIndex = 0
  while ((cm = cellRe.exec(inner)) !== null) {
    const colLetter = cm[1] || cm[5]
    const t = cm[3] || cm[6] || ""
    const cellInner = cm[4] || ""
    let val
    if (t === "s") {
      const m = /<v>(\d+)<\/v>/.exec(cellInner)
      val = m ? strings[parseInt(m[1], 10)] : ""
    } else if (t === "inlineStr") {
      const m = /<t[^>]*>([\s\S]*?)<\/t>/.exec(cellInner)
      val = m ? decodeXmlEntities(m[1]) : ""
    } else if (t === "b") {
      const m = /<v>(\d+)<\/v>/.exec(cellInner)
      val = m ? (m[1] === "1" ? "TRUE" : "FALSE") : ""
    } else {
      const m = /<v>([\s\S]*?)<\/v>/.exec(cellInner)
      val = m ? m[1] : ""
    }
    cells[colLetterToIndex(colLetter)] = val
  }
  const colIdxs = Object.keys(cells).map(Number)
  const maxCol = colIdxs.length ? Math.max(...colIdxs) : -1
  const row = []
  for (let i = 0; i <= maxCol; i++) row.push(cells[i] != null ? cells[i] : "")
  outRows.push(row.map(csvEscape).join(","))
  rowCount++
}

console.log(outRows.join("\n"))
