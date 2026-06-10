// lib/bank-import/persist.ts
// Phase 22 (22-04): Pure-ish pipeline for persisting ParsedTransaction[] to DB.
// Accepts a PrismaClient instance — does NOT import next-auth or lib/prisma singleton,
// so the seed script (22-05) can pass its own client.
//
// Upsert order: owning Bank → counterparty Banks → Company → BankAccount →
//               Counterparty → createMany BankTransaction (skipDuplicates) → ImportBatch update.

import type { PrismaClient } from "@prisma/client"
import type { ParsedTransaction, BankFormat, AccountBalance } from "./types"
import { computeFingerprint } from "./fingerprint"
import { canonicalizeCompanyName } from "./normalize"

// Bank-владелец счёта определяется ДЕТЕРМИНИРОВАННО по sourceBank через константу.
// Реальные головные БИК российских банков (9 цифр).
const OWNING_BANK: Record<BankFormat, { bic: string; name: string }> = {
  vtb: { bic: "044525411", name: "Банк ВТБ (ПАО)" },
  psb: { bic: "044525555", name: 'ПАО "Промсвязьбанк"' },
  sber: { bic: "044525225", name: "ПАО Сбербанк" },
}

export interface PersistOptions {
  fileName: string
  sourceBank: BankFormat
  importedById?: string | null
}

export interface PersistResult {
  imported: number
  skipped: number
  total: number
}

export async function persistParsedTransactions(
  prisma: PrismaClient,
  parsed: ParsedTransaction[],
  opts: PersistOptions,
  balances: AccountBalance[] = [],
): Promise<PersistResult> {
  if (parsed.length === 0) {
    // Ничего не импортировать, создаём пустой ImportBatch
    const batch = await prisma.importBatch.create({
      data: {
        fileName: opts.fileName,
        sourceBank: opts.sourceBank,
        rowsTotal: 0,
        rowsImported: 0,
        rowsSkipped: 0,
        importedById: opts.importedById ?? null,
      },
    })
    void batch // explicitly used
    return { imported: 0, skipped: 0, total: 0 }
  }

  // ── Шаг 1: Банк-владелец (один на весь батч, ДЕТЕРМИНИРОВАН по sourceBank) ──
  const ob = OWNING_BANK[opts.sourceBank]
  const owningBank = await prisma.bank.upsert({
    where: { bic: ob.bic },
    update: {},
    create: { bic: ob.bic, name: ob.name },
  })

  // ── Шаг 2: Банки контрагентов (справочник, НЕ для BankAccount.bankId) ──
  // Отдельный путь — по реальному БИК контрагента из выписки.
  const counterpartyBicSet = new Set<string>()
  for (const tx of parsed) {
    if (tx.counterpartyBic?.trim()) counterpartyBicSet.add(tx.counterpartyBic.trim())
  }
  // Кеш: bic → Bank.id (нужен для логики, но в BankTransaction пишем только денорм. поля)
  const _counterpartyBankCache = new Map<string, string>()
  for (const bic of counterpartyBicSet) {
    const bank = await prisma.bank.upsert({
      where: { bic },
      update: {},
      create: { bic, name: bic }, // name = bic, редактируется позже вручную
    })
    _counterpartyBankCache.set(bic, bank.id)
  }

  // ── Шаг 3: Company (наши компании) — по ИНН или имени ──
  // Используем первую транзакцию для извлечения companyName/companyInn
  // (все транзакции в файле относятся к одному счёту → одной компании)
  const companyCache = new Map<string, string>() // ключ → Company.id

  // Собираем уникальные (companyInn || companyName) пары
  // Имя компании каноникализируем (орг.-правовая форма → аббревиатура), чтобы
  // «ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ X» и «ООО X» из разных банков
  // указывали на ОДНУ запись Company.
  const companyKeys = new Map<string, { inn: string | null; name: string | null }>()
  for (const tx of parsed) {
    const canonName = canonicalizeCompanyName(tx.companyName)
    const key = tx.companyInn ?? canonName ?? "unknown"
    if (!companyKeys.has(key)) {
      companyKeys.set(key, { inn: tx.companyInn, name: canonName })
    }
  }

  for (const [key, { inn, name }] of companyKeys) {
    if (!inn && !name) continue // совсем нет данных — пропускаем

    // Find-or-create: ищем СНАЧАЛА по ИНН, затем по имени (одна и та же компания
    // встречается в выписках разных банков — у одного файла ИНН есть, у другого нет;
    // create-by-name без предварительного поиска падал на @unique(name)).
    let company =
      (inn ? await prisma.company.findFirst({ where: { inn } }) : null) ??
      (name ? await prisma.company.findFirst({ where: { name } }) : null)

    if (company) {
      // backfill ИНН, если он у нас есть, а в записи отсутствует
      if (inn && !company.inn) {
        company = await prisma.company.update({
          where: { id: company.id },
          data: { inn },
        })
      }
    } else {
      company = await prisma.company.create({
        data: { name: name ?? inn!, inn: inn ?? null },
      })
    }

    companyCache.set(key, company.id)
  }

  // ── Шаг 4: BankAccount (по номеру счёта) ──
  // bankId всегда = owningBank.id (ДЕТЕРМИНИРОВАНО по sourceBank)
  const accountCache = new Map<string, string>() // accountNumber → BankAccount.id

  const accountNumbers = new Set(parsed.map((tx) => tx.accountNumber))
  for (const number of accountNumbers) {
    // Определяем companyId для этого счёта (из первой транзакции с этим номером)
    const txForAccount = parsed.find((tx) => tx.accountNumber === number)!
    const companyKey =
      txForAccount.companyInn ?? canonicalizeCompanyName(txForAccount.companyName) ?? "unknown"
    const companyId = companyCache.get(companyKey)

    if (!companyId) {
      // Нет company — счёт создать не можем, пропускаем
      console.warn(`persistParsedTransactions: нет companyId для счёта ${number}, пропускаем`)
      continue
    }

    // Find matching balance for this account (if any provided)
    const bal = balances.find((b) => b.accountNumber === number)

    const account = await prisma.bankAccount.upsert({
      where: { number },
      update: {
        currency: txForAccount.currency,
        ...(bal
          ? {
              openingBalance: bal.openingBalance ?? undefined,
              closingBalance: bal.closingBalance ?? undefined,
              balanceDate: bal.balanceDate ?? undefined,
            }
          : {}),
      },
      create: {
        number,
        currency: txForAccount.currency,
        companyId,
        bankId: owningBank.id,
        openingBalance: bal?.openingBalance ?? undefined,
        closingBalance: bal?.closingBalance ?? undefined,
        balanceDate: bal?.balanceDate ?? undefined,
      },
    })
    accountCache.set(number, account.id)
  }

  // ── Шаг 5: Counterparty (по ИНН, только если ИНН присутствует) ──
  const counterpartyCache = new Map<string, string>() // inn → Counterparty.id

  const counterpartyInns = new Set<string>()
  for (const tx of parsed) {
    if (tx.counterpartyInn?.trim()) counterpartyInns.add(tx.counterpartyInn.trim())
  }

  for (const inn of counterpartyInns) {
    // Находим имя из первой транзакции с этим ИНН
    const txWithInn = parsed.find((tx) => tx.counterpartyInn?.trim() === inn)
    const name = txWithInn?.counterpartyName ?? inn

    const cp = await prisma.counterparty.upsert({
      where: { inn },
      update: {},
      create: { inn, name },
    })
    counterpartyCache.set(inn, cp.id)
  }

  // ── Шаг 6: Создаём ImportBatch (пока без count'ов — обновим после createMany) ──
  const importBatch = await prisma.importBatch.create({
    data: {
      fileName: opts.fileName,
      sourceBank: opts.sourceBank,
      rowsTotal: parsed.length,
      rowsImported: 0,
      rowsSkipped: 0,
      importedById: opts.importedById ?? null,
    },
  })

  // ── Шаг 7: Подготовка массива для createMany + intra-batch дедуп ──
  const rowMap = new Map<string, (typeof rows)[0]>()
  const rows: Array<{
    accountId: string
    date: Date
    direction: "DEBIT" | "CREDIT"
    amount: number
    currency: string
    docNumber: string | null
    operationType: string | null
    purpose: string
    counterpartyId: string | null
    counterpartyName: string | null
    counterpartyInn: string | null
    counterpartyBic: string | null
    counterpartyAccount: string | null
    category: "UNCATEGORIZED"
    fingerprint: string
    importBatchId: string
    sourceBank: string
  }> = []

  for (const tx of parsed) {
    const accountId = accountCache.get(tx.accountNumber)
    if (!accountId) {
      // Счёт не удалось создать (нет company) — пропускаем
      continue
    }

    const counterpartyId = tx.counterpartyInn?.trim()
      ? (counterpartyCache.get(tx.counterpartyInn.trim()) ?? null)
      : null

    const fingerprint = computeFingerprint(tx)

    // Intra-batch дедуп (skipDuplicates не всегда ловит дубли внутри одного createMany)
    if (rowMap.has(fingerprint)) continue

    const row = {
      accountId,
      date: tx.date,
      direction: tx.direction,
      amount: tx.amount,
      currency: tx.currency,
      docNumber: tx.docNumber,
      operationType: tx.operationType,
      purpose: tx.purpose,
      counterpartyId,
      counterpartyName: tx.counterpartyName,
      counterpartyInn: tx.counterpartyInn,
      counterpartyBic: tx.counterpartyBic,
      counterpartyAccount: tx.counterpartyAccount,
      category: "UNCATEGORIZED" as const,
      fingerprint,
      importBatchId: importBatch.id,
      sourceBank: opts.sourceBank,
    }
    rowMap.set(fingerprint, row)
    rows.push(row)
  }

  // ── Шаг 8: createMany с skipDuplicates ──
  const result = await prisma.bankTransaction.createMany({
    data: rows,
    skipDuplicates: true,
  })

  // ── Шаг 9: Обновляем ImportBatch с реальными счётчиками ──
  const rowsImported = result.count
  const rowsSkipped = parsed.length - rowsImported

  await prisma.importBatch.update({
    where: { id: importBatch.id },
    data: { rowsImported, rowsSkipped },
  })

  // ── Шаг 10: Возврат результата ──
  return {
    imported: rowsImported,
    skipped: rowsSkipped,
    total: parsed.length,
  }
}
