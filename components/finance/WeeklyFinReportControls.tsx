"use client"

// components/finance/WeeklyFinReportControls.tsx
// Тулбар понедельного WB фин-отчёта: выбор недели (Пн–Вс) + редактор ручных
// пулов затрат (только FINANCE MANAGE — placeholder до W3 банк-классификатора).
// Неделя живёт в URL ?week=YYYY-MM-DD (нормализуется до ISO-понедельника).
// Native <input>/<button> (CLAUDE.md: НЕ base-ui). Образец: PlanFactControls.tsx.
// Phase quick-260710-evz (W2a, 2026-07-10)
// Quick 260710-mih (W3c): фиксация недели — кнопка «Зафиксировать неделю»,
// бейдж «Зафиксирована … · кем», «Перефиксировать»/«Снять фиксацию»;
// в снапшот-режиме пулы-редактор скрыт (значения заморожены в пейлоаде).

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import {
  saveWeeklyPools,
  fixWeeklyReport,
  unfixWeeklyReport,
} from "@/app/actions/finance-weekly"
import type { ManualPools } from "@/lib/finance-weekly/data"

// ── Helpers (UTC ISO-неделя) ────────────────────────────────────────────────────

function addDaysToIso(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Нормализует любую дату (ISO) к её ISO-понедельнику (UTC). */
function toIsoMonday(iso: string): string {
  const d = new Date(iso + "T00:00:00Z")
  const jsDay = d.getUTCDay() // 0=вс, 1=пн
  const isoDay = jsDay === 0 ? 7 : jsDay
  d.setUTCDate(d.getUTCDate() - (isoDay - 1))
  return d.toISOString().slice(0, 10)
}

function isoTodayMonday(): string {
  const msk = new Date(Date.now() + 3 * 60 * 60 * 1000)
  return toIsoMonday(msk.toISOString().slice(0, 10))
}

// ── Поля редактора ───────────────────────────────────────────────────────────────

const POOL_FIELDS: { key: keyof ManualPools; label: string; group: string }[] = [
  { key: "delivery", label: "Доставка до МП (общая)", group: "Общее" },
  { key: "overheadAppl", label: "Общие расходы", group: "Бытовая техника" },
  { key: "acceptanceAppl", label: "Приёмка / штрафы", group: "Бытовая техника" },
  { key: "storageAppl", label: "Хранение", group: "Бытовая техника" },
  { key: "overheadCloth", label: "Общие расходы (переменная)", group: "Одежда" },
  { key: "acceptanceCloth", label: "Приёмка / штрафы", group: "Одежда" },
  { key: "storageCloth", label: "Хранение", group: "Одежда" },
]

const GROUP_ORDER = ["Общее", "Бытовая техника", "Одежда"]

// Quick 260710-kvf: пулы, которые берутся из WbRealizationWeekly ПО-БАКЕТНО —
// только когда бакет реализации > 0 (manual-поле — редактируемый fallback;
// нулевой бакет на ИУ не затирает ручное значение).
const REALIZATION_POOL_KEYS = [
  "acceptanceAppl",
  "storageAppl",
  "acceptanceCloth",
  "storageCloth",
] as const

type RealizationPoolKey = (typeof REALIZATION_POOL_KEYS)[number]

function isRealizationPoolKey(k: keyof ManualPools): k is RealizationPoolKey {
  return (REALIZATION_POOL_KEYS as readonly string[]).includes(k)
}

// Quick 260710-lmb (W3a): гибрид-пулы из банка — manual > 0 → manual, иначе
// Σ|amount| DEBIT-операций недели с тегом (DELIVERY_MP / OPEX), иначе 0.
const BANK_HYBRID_KEYS = ["delivery", "overheadAppl"] as const

type BankHybridKey = (typeof BANK_HYBRID_KEYS)[number]

function isBankHybridKey(k: keyof ManualPools): k is BankHybridKey {
  return (BANK_HYBRID_KEYS as readonly string[]).includes(k)
}

const BANK_SOURCE_LABELS: Record<"manual" | "bank" | "none", string> = {
  manual: "вручную",
  bank: "из банка",
  none: "—",
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  weekStartISO: string
  weekEndISO: string
  manualPools: ManualPools
  canManage: boolean
  /** Quick 260710-kvf: источник значения КАЖДОГО пула (per-пул бейдж). */
  poolSources: Record<RealizationPoolKey, "realization" | "manual">
  /** W3a (quick 260710-lmb): авто-суммы из банка — подписи «банк: N ₽». */
  bankAutos: { opexRub: number; deliveryMpRub: number }
  /** Quick 260715-f4c: фикс общих расходов одежды НА ЕДИНИЦУ (глобальный AppSetting, дефолт 256). */
  clothingOverheadPerUnitRub: number
  /** W3a: источник гибрид-пулов delivery / overheadAppl. */
  bankPoolSources: Record<BankHybridKey, "manual" | "bank" | "none">
  /** W3c: снапшот-режим — бейдж + Перефиксировать/Снять; пулы-редактор скрыт. */
  snapshot?: { fixedAtLabel: string; fixedByName: string | null } | null
  /** W3c: снапшот есть, но version не совпал → live-fallback + warning. */
  snapshotStale?: boolean
  /** Quick 260714-gff: Опция Джема — надбавка к комиссии (п.п.), обе сценария. */
  jemOptionPct: number
  /** Quick 260714-or9: тумблер «Без учёта % выкупа (бытовая)» — view-only, URL-driven. */
  skipAppliancesBuyoutDiscount?: boolean
}

// ── Компонент ───────────────────────────────────────────────────────────────────

export function WeeklyFinReportControls({
  weekStartISO,
  weekEndISO,
  manualPools,
  canManage,
  poolSources,
  bankAutos,
  clothingOverheadPerUnitRub,
  bankPoolSources,
  snapshot = null,
  snapshotStale = false,
  jemOptionPct,
  skipAppliancesBuyoutDiscount = false,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isSyncPending, startSyncTransition] = useTransition()
  const [isFixPending, startFixTransition] = useTransition()
  const [pools, setPools] = useState<ManualPools>(manualPools)
  // Quick 260715-f4c: фикс общих одежды НА ЕДИНИЦУ — глобальная константа (не per неделя)
  const [perUnitCloth, setPerUnitCloth] = useState(clothingOverheadPerUnitRub)
  // Quick 260714-gff: Опция Джема — надбавка к комиссии, редактируется per неделя
  const [jemOption, setJemOption] = useState(jemOptionPct)

  // W3a: авто-сумма из банка per гибрид-пул
  const bankAutoByKey: Record<BankHybridKey, number> = {
    delivery: bankAutos.deliveryMpRub,
    overheadAppl: bankAutos.opexRub,
  }

  // Quick 260714-or9: URL несёт и неделю, и режим тумблера — переключение недели
  // не сбрасывает режим, и наоборот.
  function buildWeeklyUrl(mondayISO: string, rawBuyout: boolean): string {
    const params = new URLSearchParams({ week: mondayISO })
    if (rawBuyout) params.set("rawBuyout", "1")
    return `/finance/weekly?${params.toString()}`
  }

  function goToWeek(mondayISO: string) {
    router.push(buildWeeklyUrl(mondayISO, skipAppliancesBuyoutDiscount))
  }

  const toggleRawBuyout = () => {
    router.push(buildWeeklyUrl(weekStartISO, !skipAppliancesBuyoutDiscount))
  }

  const handleDate = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return
    goToWeek(toIsoMonday(e.target.value))
  }

  const handlePoolChange = (key: keyof ManualPools, raw: string) => {
    const n = Number(raw)
    setPools((prev) => ({ ...prev, [key]: Number.isFinite(n) ? n : 0 }))
  }

  const handleSave = () => {
    startTransition(async () => {
      const res = await saveWeeklyPools(weekStartISO, pools, {
        clothingOverheadPerUnitRub: perUnitCloth,
        jemOptionPct: jemOption,
      })
      if (res.ok) {
        toast.success("Пулы затрат сохранены")
        router.refresh()
      } else {
        toast.error(res.error || "Не удалось сохранить пулы")
      }
    })
  }

  // W3c: фиксация недели — серверный пересбор пейлоада + upsert снапшота.
  // Та же кнопка обслуживает «Перефиксировать» (clean-replace) и stale-режим.
  const handleFix = () => {
    startFixTransition(async () => {
      const res = await fixWeeklyReport(weekStartISO)
      if (res.ok) {
        toast.success("Неделя зафиксирована")
        router.refresh()
      } else {
        toast.error(res.error || "Не удалось зафиксировать неделю")
      }
    })
  }

  // W3c: снятие фиксации — удаление снапшота, возврат в live-режим.
  const handleUnfix = () => {
    startFixTransition(async () => {
      const res = await unfixWeeklyReport(weekStartISO)
      if (res.ok) {
        toast.success("Фиксация снята")
        router.refresh()
      } else {
        toast.error(res.error || "Не удалось снять фиксацию")
      }
    })
  }

  // W1 (quick 260710-jgs): импорт отчёта реализации WB выбранной недели.
  // Rate limit sales-reports 1 req/мин → импорт занимает минуты (loading toast).
  const handleRealizationSync = () => {
    startSyncTransition(async () => {
      const toastId = toast.loading(
        "Импорт отчёта реализации… (до 2-3 мин, rate limit WB)",
      )
      try {
        const res = await fetch("/api/wb-realization-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ week: weekStartISO }),
        })
        const data = (await res.json()) as {
          ok?: boolean
          written?: number
          error?: string
        }
        toast.dismiss(toastId)
        if (res.ok && data.ok) {
          toast.success(`Реализация: ${data.written ?? 0} строк за неделю`)
          router.refresh()
        } else {
          toast.error(data.error || "Не удалось импортировать отчёт реализации")
        }
      } catch {
        toast.dismiss(toastId)
        toast.error("Не удалось импортировать отчёт реализации")
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Выбор недели */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground whitespace-nowrap">Неделя (Пн):</span>
        <input
          type="date"
          value={weekStartISO}
          onChange={handleDate}
          className="rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          onClick={() => goToWeek(addDaysToIso(weekStartISO, -7))}
          className="px-2 py-1 text-xs text-muted-foreground border rounded hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          ‹ Пред.
        </button>
        <button
          type="button"
          onClick={() => goToWeek(addDaysToIso(weekStartISO, 7))}
          className="px-2 py-1 text-xs text-muted-foreground border rounded hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          След. ›
        </button>
        <button
          type="button"
          onClick={() => goToWeek(isoTodayMonday())}
          className="px-2 py-1 text-xs text-muted-foreground border rounded hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          Тек. неделя
        </button>
        {/* W3c: «Реализация WB» видима во ВСЕХ режимах (и при снапшоте) —
            импорт данных не влияет на отрисовку снапшота; полезна перед
            перефиксацией (свежая реализация попадёт в новый пейлоад). */}
        {canManage && (
          <button
            type="button"
            onClick={handleRealizationSync}
            disabled={isSyncPending}
            className="px-2 py-1 text-xs text-muted-foreground border rounded hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
          >
            {isSyncPending ? "Импорт…" : "Реализация WB"}
          </button>
        )}
        {/* W3c: live-режим (нет снапшота, version актуальна) → «Зафиксировать неделю» */}
        {!snapshot && !snapshotStale && canManage && (
          <button
            type="button"
            onClick={handleFix}
            disabled={isFixPending}
            className="px-2 py-1 text-xs text-muted-foreground border rounded hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
          >
            {isFixPending ? "Фиксация…" : "Зафиксировать неделю"}
          </button>
        )}
        {/* W3c: снапшот-режим → бейдж + Перефиксировать / Снять фиксацию */}
        {snapshot && (
          <>
            <span className="rounded border border-emerald-600/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
              Зафиксирована {snapshot.fixedAtLabel}
              {snapshot.fixedByName ? ` · ${snapshot.fixedByName}` : ""}
            </span>
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={handleFix}
                  disabled={isFixPending}
                  className="px-2 py-1 text-xs text-muted-foreground border rounded hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
                  title="Перезаписать снапшот свежим серверным расчётом"
                >
                  {isFixPending ? "Фиксация…" : "Перефиксировать"}
                </button>
                <button
                  type="button"
                  onClick={handleUnfix}
                  disabled={isFixPending}
                  className="px-2 py-1 text-xs text-muted-foreground border rounded hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
                  title="Удалить снапшот и вернуться к live-расчёту"
                >
                  Снять фиксацию
                </button>
              </>
            )}
          </>
        )}
        {/* W3c: снапшот с чужой version → live-fallback + warning */}
        {snapshotStale && (
          <>
            <span className="rounded border border-amber-600/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400 whitespace-nowrap">
              Снапшот устарел — перефиксируйте
            </span>
            {canManage && (
              <button
                type="button"
                onClick={handleFix}
                disabled={isFixPending}
                className="px-2 py-1 text-xs text-muted-foreground border rounded hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
                title="Создать снапшот актуальной версии пейлоада"
              >
                {isFixPending ? "Фиксация…" : "Перефиксировать"}
              </button>
            )}
          </>
        )}
        {/* Quick 260714-or9: тумблер сверки бытовой техники при 100% выкупе.
            Скрыт в снапшот-режиме (payload заморожен), как редактор пулов. */}
        {!snapshot && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer">
            <input
              type="checkbox"
              checked={skipAppliancesBuyoutDiscount}
              onChange={toggleRawBuyout}
              className="accent-primary"
            />
            Без учёта % выкупа (бытовая)
          </label>
        )}
        <span className="text-muted-foreground whitespace-nowrap">
          {weekStartISO} — {weekEndISO}
        </span>
      </div>

      {/* Редактор ручных пулов — только MANAGE. W3c: в снапшот-режиме СКРЫТ
          (значения заморожены в пейлоаде, редактировать нечего); при
          live-fallback stale-снапшота редактор доступен как обычно. */}
      {canManage && !snapshot && (
        <div className="rounded-md border bg-card p-3">
          <div className="mb-2 text-sm font-semibold">
            Ручные пулы затрат за неделю, ₽
          </div>
          <div className="flex flex-wrap gap-4">
            {GROUP_ORDER.map((group) => (
              <div key={group} className="flex flex-col gap-1.5">
                <div className="text-xs font-medium text-muted-foreground">{group}</div>
                {/* Quick 260714-gff: Опция Джема — НЕ поле ManualPools (надбавка
                    к комиссии, не пул затрат) — рендерится в группе «Общее» */}
                {group === "Общее" && (
                  <div className="flex flex-col gap-0.5">
                    <label className="flex items-center gap-2 text-xs">
                      <span className="w-40 whitespace-nowrap text-muted-foreground">
                        Опция Джема, %
                      </span>
                      <input
                        type="number"
                        step="any"
                        value={Number.isFinite(jemOption) ? jemOption : 0}
                        onChange={(e) => {
                          const n = Number(e.target.value)
                          setJemOption(Number.isFinite(n) ? n : 0)
                        }}
                        className="w-28 rounded border bg-background px-2 py-1 text-right text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </label>
                    <div className="text-[10px] text-muted-foreground">
                      надбавка к комиссии WB, обе сценария; по неделям (carry-forward)
                    </div>
                  </div>
                )}
                {/* W3a: фикс-часть общих расходов одежды — НЕ поле ManualPools
                    (глобальная константа, не недельная) — рендерится ПЕРЕД полями группы */}
                {group === "Одежда" && (
                  <div className="flex flex-col gap-0.5">
                    <label className="flex items-center gap-2 text-xs">
                      <span className="w-40 whitespace-nowrap text-muted-foreground">
                        Фикс общих одежды, ₽/ед
                      </span>
                      <input
                        type="number"
                        step="any"
                        value={Number.isFinite(perUnitCloth) ? perUnitCloth : 0}
                        onChange={(e) => {
                          const n = Number(e.target.value)
                          setPerUnitCloth(Number.isFinite(n) ? n : 0)
                        }}
                        className="w-28 rounded border bg-background px-2 py-1 text-right text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </label>
                    <div className="text-[10px] text-muted-foreground">
                      205 + 51 ₽/ед · глобальная константа
                    </div>
                  </div>
                )}
                {POOL_FIELDS.filter((f) => f.group === group).map((f) => (
                  <div key={f.key} className="flex flex-col gap-0.5">
                    <label className="flex items-center gap-2 text-xs">
                      <span className="w-40 whitespace-nowrap text-muted-foreground">
                        {f.label}
                        {isRealizationPoolKey(f.key) && (
                          <span
                            className="ml-1 text-[10px] text-muted-foreground"
                            title={
                              poolSources[f.key] === "realization"
                                ? "Значение пула взято из отчёта реализации WB; ручное поле — fallback"
                                : undefined
                            }
                          >
                            {poolSources[f.key] === "realization"
                              ? "из реализации"
                              : "вручную"}
                          </span>
                        )}
                        {isBankHybridKey(f.key) && (
                          <span
                            className="ml-1 text-[10px] text-muted-foreground"
                            title="0 = не задано → берётся авто-сумма помеченных операций банка за неделю"
                          >
                            {BANK_SOURCE_LABELS[bankPoolSources[f.key]]}
                          </span>
                        )}
                      </span>
                      <input
                        type="number"
                        step="any"
                        value={Number.isFinite(pools[f.key]) ? pools[f.key] : 0}
                        onChange={(e) => handlePoolChange(f.key, e.target.value)}
                        className="w-28 rounded border bg-background px-2 py-1 text-right text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </label>
                    {/* W3a: авто-сумма из банка показывается ВСЕГДА (даже при manual) */}
                    {isBankHybridKey(f.key) && (
                      <div className="text-[10px] text-muted-foreground tabular-nums">
                        банк: {bankAutoByKey[f.key].toLocaleString("ru-RU")} ₽
                      </div>
                    )}
                  </div>
                ))}
                {/* Quick 260715-f4c: фикс теперь НЕ в пуле — per-unit статья движка */}
                {group === "Одежда" && (
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    пул общих (переменная, по выручке) = {pools.overheadCloth.toLocaleString("ru-RU")} ₽
                    {" · "}фикс {(Number.isFinite(perUnitCloth) ? perUnitCloth : 0).toLocaleString("ru-RU")} ₽/ед × кол-во
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Сохранение…" : "Сохранить"}
            </button>
            <span className="text-xs text-muted-foreground">
              Кредит (проценты) — авто из графика кредитов Зойтен, только бытовая техника.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
