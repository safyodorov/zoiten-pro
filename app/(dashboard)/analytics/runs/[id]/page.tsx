// app/(dashboard)/analytics/runs/[id]/page.tsx
// Phase 30 (ANL-06/ANL-08) — полноэкранный дашборд прогона ниши из иммутабельного снапшота.
// Читает NicheRun.payloadJson → parseNicheRunPayload → sortSkus ОДИН раз → 5 вкладок (единый порядок).
// Сортировка/вкладка/метрики — в URL. Кнопка PDF наследует активный ?sort= (порядок PDF = экран).
import Link from "next/link"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { parseNicheRunPayload } from "@/lib/analytics/snapshot"
import { sortSkus } from "@/lib/analytics/engine"
import type { SortMode } from "@/lib/analytics/types"
import { SortToggle } from "@/components/analytics/SortToggle"
import { PdfExportButton } from "@/components/analytics/PdfExportButton"
import { OverviewTab } from "@/components/analytics/tabs/OverviewTab"
import { ListingTab } from "@/components/analytics/tabs/ListingTab"
import { CharacteristicsTab } from "@/components/analytics/tabs/CharacteristicsTab"
import { CardStatsTab } from "@/components/analytics/tabs/CardStatsTab"
import { QueryStatsTab } from "@/components/analytics/tabs/QueryStatsTab"

const TABS = [
  { key: "overview", label: "Общая информация" },
  { key: "listing", label: "Листинг" },
  { key: "characteristics", label: "Характеристики" },
  { key: "card-stats", label: "Статистика карточки" },
  { key: "query-stats", label: "Статистика запросов" },
] as const

type TabKey = (typeof TABS)[number]["key"]

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; sort?: string; metrics?: string }>
}

export default async function NicheRunPage({ params, searchParams }: PageProps) {
  await requireSection("ANALYTICS")
  const { id } = await params
  const sp = await searchParams

  const run = await prisma.nicheRun.findUnique({ where: { id } })
  if (!run) {
    return <div className="p-6 text-sm text-muted-foreground">Прогон не найден.</div>
  }

  const payload = parseNicheRunPayload(run.payloadJson)
  if (!payload) {
    return (
      <div className="p-6 space-y-2">
        <div className="text-sm">
          Статус прогона: <span className="font-medium">{run.status}</span>
        </div>
        {run.status === "FAILED" && run.errorMessage && (
          <div className="text-sm text-destructive">{run.errorMessage}</div>
        )}
        {(run.status === "PENDING" || run.status === "COLLECTING") && (
          <div className="text-sm text-muted-foreground">
            {run.progressNote ?? "Идёт сбор данных…"} — обновите страницу позже.
          </div>
        )}
        <Link href="/analytics" className="text-sm text-primary underline" prefetch={false}>
          ← К списку прогонов
        </Link>
      </div>
    )
  }

  const sortMode: SortMode = sp.sort === "clickToOrder" ? "clickToOrder" : "revenue"
  const activeTab: TabKey = (TABS.find((t) => t.key === sp.tab)?.key ?? "overview") as TabKey

  // Единый порядок — sortSkus ОДИН раз, передаётся во все вкладки (ANL-06).
  const skus = sortSkus(payload.skus, sortMode)

  const incompleteSkus = (run.incompleteSkus as { nmId: number; reason: string }[] | null) ?? []

  const tabHref = (tab: string) => {
    const params = new URLSearchParams()
    params.set("tab", tab)
    params.set("sort", sortMode)
    if (sp.metrics) params.set("metrics", sp.metrics)
    return `/analytics/runs/${id}?${params.toString()}`
  }

  return (
    <div className="h-full flex flex-col">
      {/* Шапка дашборда */}
      <div className="border-b px-4 py-3 space-y-3 bg-background">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold">Топ-30 SKU в нише</h1>
            <div className="text-xs text-muted-foreground">
              Период {payload.dateFrom} — {payload.dateTo} · {payload.skus.length} SKU
              {run.status === "PARTIAL" && (
                <span className="ml-2 text-amber-600 dark:text-amber-500">
                  ⚠ частичный прогон ({incompleteSkus.length} SKU с проблемой выгрузки)
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <SortToggle />
            <PdfExportButton runId={id} />
          </div>
        </div>

        {/* Навигация по вкладкам */}
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              prefetch={false}
              className={
                "px-3 py-1.5 text-sm rounded-md transition-colors " +
                (activeTab === t.key
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40")
              }
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Активная вкладка */}
      <div className="flex-1 min-h-0">
        {activeTab === "overview" && <OverviewTab skus={skus} />}
        {activeTab === "listing" && <ListingTab skus={skus} />}
        {activeTab === "characteristics" && <CharacteristicsTab skus={skus} />}
        {activeTab === "card-stats" && <CardStatsTab skus={skus} />}
        {activeTab === "query-stats" && <QueryStatsTab skus={skus} />}
      </div>
    </div>
  )
}
