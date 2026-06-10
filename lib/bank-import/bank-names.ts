// lib/bank-import/bank-names.ts
// Phase 22: Static БИК → bank name map for common Russian banks.
// Used by persist.ts to resolve human-readable names for counterparty banks
// that are seen only by BIC (VTB/PSB counterparties) or as a fallback when
// Sber statement data is unavailable.
//
// Sources:
//   - OWNING_BANK constants (VTB, PSB, Sber head offices)
//   - BIC → name pairs extracted from real Sber "Банк (БИК и наименование)" cells
//   - CBR БИК directory for well-known banks
//
// When adding entries: prefer the canonical/public name (as on CBR/bank website).
// Existing correct entries should not be overwritten by re-import.
//
// NO imports of next-auth, next/*, or Prisma — vitest must run this without env.

/**
 * Static map of 9-digit BIC → canonical Russian bank name.
 * Keys are 9-digit BIC strings (no leading zeros trimmed).
 * Used in persist.ts as fallback when the statement doesn't contain a bank name.
 */
export const STATIC_BANK_NAMES: Readonly<Record<string, string>> = {
  // ── Owning banks (head offices) ──
  "044525225": "ПАО Сбербанк",
  // 044525411 = Filial "Tsentralny" Banka VTB — same canonical BIC for head + central branch
  "044525411": 'Филиал "Центральный" Банка ВТБ (ПАО)',
  "044525555": 'ПАО "Промсвязьбанк"',

  // ── VTB / Sber sub-BICs ──
  "044525187": "Банк ВТБ (ПАО)",
  "042007835": "Филиал Банка ВТБ (ПАО) в г. Воронеже",
  "042007855": "Филиал №3652 Банка ВТБ (ПАО)",
  "047003608": "Ивановское отделение №8639 ПАО Сбербанк",
  "042908612": "Калужское отделение №8608 ПАО Сбербанк",
  "045004641": "Сибирский банк ПАО Сбербанк",
  "049205603": 'Отделение "Банк Татарстан" №8610 ПАО Сбербанк',

  // ── Major commercial banks ──
  "044525593": 'АО "АЛЬФА-БАНК"',
  "044525974": 'АО "ТБанк"',
  "044525700": 'АО "Райффайзенбанк"',
  "044525787": 'ПАО "БАНК УРАЛСИБ"',
  "044525232": 'ПАО "МТС-Банк"',
  "044525068": 'ООО "ОЗОН Банк"',
  "044525104": 'ООО "Банк Точка"',
  "044525113": 'АО "ТБанк" (Росбанк филиал Москва)',
  "044525360": 'Филиал "Корпоративный" ПАО "Совкомбанк"',
  "044525780": 'Ивановский РФ АО "Россельхозбанк"',

  // ── PSB regional branch ──
  "047888760": 'Ярославский ф-л ПАО "Банк ПСБ"',

  // ── Other banks ──
  "043601706": 'АО КБ "Солидарность"',

  // ── Bank of Russia / treasury accounts ──
  "017003983": "ОКЦ №7 ГУ Банка России по ЦФО",
  "024501901": "Операционный департамент Банка России",
  "042202102": "ОКЦ №1 ВВГУ Банка России (УФК по Ивановской обл.)",
} as const
