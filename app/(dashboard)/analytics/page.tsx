// app/(dashboard)/analytics/page.tsx
// Phase 30 (ANL-05) — список сохранённых прогонов ниши (история). requireSection VIEW.
// Открытие прошлого прогона без пересбора; PARTIAL помечен; COLLECTING старше 15 мин → «завис»
// + ручная пометка FAILED (MANAGE). Шапка: ввод MPSTATS-токена (MANAGE). Ссылки prefetch={false}.
import Link from "next/link"
import { requireSection, getSectionRole } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { markNicheRunFailed } from "@/app/actions/analytics"
import { AnalyticsTokenBar } from "@/components/analytics/AnalyticsTokenBar"

const STUCK_MS = 15 * 60 * 1000

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "В очереди", cls: "text-muted-foreground" },
  COLLECTING: { label: "Сбор…", cls: "text-blue-600 dark:text-blue-400" },
  READY: { label: "Готов", cls: "text-emerald-600 dark:text-emerald-500" },
  PARTIAL: { label: "Частичный", cls: "text-amber-600 dark:text-amber-500" },
  FAILED: { label: "Ошибка", cls: "text-destructive" },
}

const fmtDate = (d: Date) => d.toLocaleDateString("ru-RU")
const fmtDateTime = (d: Date) =>
  d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })

// Server action-обёртка для формы «Пометить FAILED» (возвращает void).
async function markFailedForm(formData: FormData) {
  "use server"
  const id = String(formData.get("runId") ?? "")
  if (id) await markNicheRunFailed(id)
}

export default async function AnalyticsListPage() {
  await requireSection("ANALYTICS")
  const canManage = (await getSectionRole("ANALYTICS")) === "MANAGE"

  const [runs, tokenRow] = await Promise.all([
    prisma.nicheRun.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.appSetting.findUnique({ where: { key: "analytics.mpstatsToken" }, select: { value: true } }),
  ])
  const tokenValue = tokenRow?.value?.trim() ?? ""
  const hasToken = !!tokenValue
  const tokenFingerprint =
    tokenValue.length >= 8 ? `${tokenValue.slice(0, 4)}…${tokenValue.slice(-4)}` : undefined
  const now = Date.now()

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Аналитика — прогоны ниши</h1>
          <p className="text-sm text-muted-foreground">Топ-30 SKU в нише. История сохранённых прогонов.</p>
        </div>
        <div className="flex items-end gap-4">
          {canManage && <AnalyticsTokenBar hasToken={hasToken} tokenFingerprint={tokenFingerprint} />}
          <Link
            href="/analytics/upload"
            prefetch={false}
            className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            + Новый прогон
          </Link>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          Прогонов пока нет. Нажмите «Новый прогон» и загрузите 6 файлов «Сравнение карточек».
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="bg-muted border-b p-2 text-left">Создан</th>
                <th className="bg-muted border-b p-2 text-left">Период</th>
                <th className="bg-muted border-b p-2 text-left">Статус</th>
                <th className="bg-muted border-b p-2 text-right">SKU</th>
                <th className="bg-muted border-b p-2 text-left">Действия</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const st = STATUS_LABEL[r.status] ?? { label: r.status, cls: "" }
                const stuck = r.status === "COLLECTING" && now - new Date(r.updatedAt).getTime() > STUCK_MS
                const openable = r.status === "READY" || r.status === "PARTIAL"
                return (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="border-b p-2 whitespace-nowrap">{fmtDateTime(new Date(r.createdAt))}</td>
                    <td className="border-b p-2 whitespace-nowrap">
                      {fmtDate(new Date(r.dateFrom))} — {fmtDate(new Date(r.dateTo))}
                    </td>
                    <td className="border-b p-2">
                      <span className={st.cls}>{st.label}</span>
                      {stuck && <span className="ml-2 text-xs text-amber-600 dark:text-amber-500">завис</span>}
                      {(r.status === "COLLECTING" || r.status === "PENDING") && r.progressNote && (
                        <span className="ml-2 text-xs text-muted-foreground">{r.progressNote}</span>
                      )}
                      {r.status === "FAILED" && r.errorMessage && (
                        <div className="text-xs text-destructive mt-0.5 max-w-[420px]">{r.errorMessage}</div>
                      )}
                    </td>
                    <td className="border-b p-2 text-right tabular-nums">{r.skuCount}</td>
                    <td className="border-b p-2">
                      <div className="flex items-center gap-3">
                        {openable ? (
                          <Link href={`/analytics/runs/${r.id}`} prefetch={false} className="text-primary underline">
                            Открыть
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {openable && (
                          <a href={`/api/analytics/runs/${r.id}/pdf?sort=revenue`} className="text-primary underline">
                            PDF
                          </a>
                        )}
                        {stuck && canManage && (
                          <form action={markFailedForm}>
                            <input type="hidden" name="runId" value={r.id} />
                            <button type="submit" className="text-xs text-destructive underline">
                              Пометить FAILED
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
