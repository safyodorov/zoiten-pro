"use client"

// components/finance/WeeklyFinReportControls.tsx
// Тулбар понедельного WB фин-отчёта: выбор недели (Пн–Вс) + редактор ручных
// пулов затрат (только FINANCE MANAGE — placeholder до W3 банк-классификатора).
// Неделя живёт в URL ?week=YYYY-MM-DD (нормализуется до ISO-понедельника).
// Native <input>/<button> (CLAUDE.md: НЕ base-ui). Образец: PlanFactControls.tsx.
// Phase quick-260710-evz (W2a, 2026-07-10)

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { saveWeeklyPools } from "@/app/actions/finance-weekly"
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
  /** W3a: фикс-часть общих расходов одежды (глобальный AppSetting). */
  clothingOverheadFixedRub: number
  /** W3a: источник гибрид-пулов delivery / overheadAppl. */
  bankPoolSources: Record<BankHybridKey, "manual" | "bank" | "none">
}

// ── Компонент ───────────────────────────────────────────────────────────────────

export function WeeklyFinReportControls({
  weekStartISO,
  weekEndISO,
  manualPools,
  canManage,
  poolSources,
  bankAutos,
  clothingOverheadFixedRub,
  bankPoolSources,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isSyncPending, startSyncTransition] = useTransition()
  const [pools, setPools] = useState<ManualPools>(manualPools)
  // W3a: фикс-часть общих расходов одежды — глобальная константа (не per неделя)
  const [fixedCloth, setFixedCloth] = useState(clothingOverheadFixedRub)

  // W3a: авто-сумма из банка per гибрид-пул
  const bankAutoByKey: Record<BankHybridKey, number> = {
    delivery: bankAutos.deliveryMpRub,
    overheadAppl: bankAutos.opexRub,
  }

  function goToWeek(mondayISO: string) {
    router.push(`/finance/weekly?week=${mondayISO}`)
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
        clothingOverheadFixedRub: fixedCloth,
      })
      if (res.ok) {
        toast.success("Пулы затрат сохранены")
        router.refresh()
      } else {
        toast.error(res.error || "Не удалось сохранить пулы")
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
        <span className="text-muted-foreground whitespace-nowrap">
          {weekStartISO} — {weekEndISO}
        </span>
      </div>

      {/* Редактор ручных пулов — только MANAGE */}
      {canManage && (
        <div className="rounded-md border bg-card p-3">
          <div className="mb-2 text-sm font-semibold">
            Ручные пулы затрат за неделю, ₽
          </div>
          <div className="flex flex-wrap gap-4">
            {GROUP_ORDER.map((group) => (
              <div key={group} className="flex flex-col gap-1.5">
                <div className="text-xs font-medium text-muted-foreground">{group}</div>
                {/* W3a: фикс-часть общих расходов одежды — НЕ поле ManualPools
                    (глобальная константа, не недельная) — рендерится ПЕРЕД полями группы */}
                {group === "Одежда" && (
                  <div className="flex flex-col gap-0.5">
                    <label className="flex items-center gap-2 text-xs">
                      <span className="w-40 whitespace-nowrap text-muted-foreground">
                        Общие расходы (фикс.)
                      </span>
                      <input
                        type="number"
                        step="any"
                        value={Number.isFinite(fixedCloth) ? fixedCloth : 0}
                        onChange={(e) => {
                          const n = Number(e.target.value)
                          setFixedCloth(Number.isFinite(n) ? n : 0)
                        }}
                        className="w-28 rounded border bg-background px-2 py-1 text-right text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </label>
                    <div className="text-[10px] text-muted-foreground">
                      глобальная константа (не per неделя)
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
                {/* W3a: состав пула общих расходов одежды = фикс + переменная */}
                {group === "Одежда" && (
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    пул одежды = фикс {(Number.isFinite(fixedCloth) ? fixedCloth : 0).toLocaleString("ru-RU")}{" "}
                    + переменная {pools.overheadCloth.toLocaleString("ru-RU")} ={" "}
                    {((Number.isFinite(fixedCloth) ? fixedCloth : 0) + pools.overheadCloth).toLocaleString("ru-RU")} ₽
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
