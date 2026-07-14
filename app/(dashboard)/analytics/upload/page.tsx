// app/(dashboard)/analytics/upload/page.tsx
// Phase 30 (ANL-01) — страница запуска нового прогона: загрузка 6 файлов → превью → «Начать сбор».
// requireSection VIEW (запуск внутри формы требует MANAGE). Шапка: ввод MPSTATS-токена (MANAGE).
import Link from "next/link"
import { requireSection, getSectionRole } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { AnalyticsUploadForm } from "@/components/analytics/AnalyticsUploadForm"
import { AnalyticsTokenBar } from "@/components/analytics/AnalyticsTokenBar"

export default async function AnalyticsUploadPage() {
  await requireSection("ANALYTICS")
  const canManage = (await getSectionRole("ANALYTICS")) === "MANAGE"
  const tokenRow = await prisma.appSetting.findUnique({
    where: { key: "analytics.mpstatsToken" },
    select: { value: true },
  })
  const tokenValue = tokenRow?.value?.trim() ?? ""
  const hasToken = !!tokenValue
  const tokenFingerprint =
    tokenValue.length >= 8 ? `${tokenValue.slice(0, 4)}…${tokenValue.slice(-4)}` : undefined

  return (
    <div className="p-4 space-y-4 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/analytics" prefetch={false} className="text-sm text-primary underline">
            ← К списку прогонов
          </Link>
          <h1 className="text-lg font-semibold mt-1">Новый прогон ниши</h1>
        </div>
        {canManage && <AnalyticsTokenBar hasToken={hasToken} tokenFingerprint={tokenFingerprint} />}
      </div>

      {canManage && !hasToken && (
        <div className="text-sm text-amber-600 dark:text-amber-500 border border-amber-300 dark:border-amber-700 rounded-md p-3">
          Укажите MPSTATS-токен в шапке — без него сбор позиций не запустится.
        </div>
      )}

      <AnalyticsUploadForm canManage={canManage} />
    </div>
  )
}
