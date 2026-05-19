// Phase 19 / Plan 19-05: главная таблица раздела /ads/wb.
//
// Принимает discriminated union по groupBy: product / imt / campaign / type.
// Все 4 режима рендерятся из одного компонента — переключение режимов делается
// без перемонтирования (передаётся другой shape view).
//
// Паттерн sticky-таблицы по CLAUDE.md: НЕ shadcn <Table> (он оборачивает <table>
// во внутренний overflow контейнер и ломает sticky). Используем raw <table> +
// border-separate + sticky <thead> с bg-background.
"use client"

import * as React from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import {
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table"
import type {
  Aggregated,
  ProductCampaignGroup,
} from "@/lib/wb-advert-aggregations"

// ──────────────────────────────────────────────────────────────────
// Подписи типов кампаний (см. 19-RESEARCH.md секция 2)
// W0 эмпирически найдены только 5/6/9 в текущем кабинете, но держим все
// 4..9 для полноты + UI gracefully handles unknown через `?? "Тип N"`.
// ──────────────────────────────────────────────────────────────────

const CAMPAIGN_TYPE_LABELS: Record<number, string> = {
  4: "Каталог",
  5: "Карточка",
  6: "Поиск",
  7: "Рекомендации",
  8: "Единая ставка",
  9: "Единая/Ручная",
}

function typeLabel(t: number | null | undefined): string {
  if (t == null) return "—"
  return CAMPAIGN_TYPE_LABELS[t] ?? `Тип ${t}`
}

// ──────────────────────────────────────────────────────────────────
// Discriminated union — view prop передаётся из RSC page.tsx
// ──────────────────────────────────────────────────────────────────

export type TableView =
  | { groupBy: "product"; groups: ProductCampaignGroup[] }
  | {
      groupBy: "imt"
      rows: Array<{
        imtId: number
        productNames: string[]
        nmIds: number[]
        agg: Aggregated
      }>
    }
  | {
      groupBy: "campaign"
      rows: Array<{
        advertId: number
        name: string | null
        type: number
        status: number
        agg: Aggregated
      }>
    }
  | {
      groupBy: "type"
      rows: Array<{ type: number; campaignCount: number; agg: Aggregated }>
    }

interface AdvertCampaignsTableProps {
  view: TableView
}

// ──────────────────────────────────────────────────────────────────
// Formatters — ru-RU locale per план
// ──────────────────────────────────────────────────────────────────

const moneyFmt = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
})

const intFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—"
  return `${moneyFmt.format(Math.round(n))} ₽`
}

function fmtInt(n: number | null | undefined): string {
  if (n == null) return "—"
  return intFmt.format(n)
}

function fmtRatio(n: number | null | undefined): string {
  if (n == null) return "—"
  return `${n.toFixed(1)}%`
}

function fmtCpc(n: number | null | undefined): string {
  if (n == null) return "—"
  return `${n.toFixed(2)} ₽`
}

// Общий заголовок 7 stat-колонок — переиспользуется во всех 4 режимах.
function StatHeaderCells({ prefix }: { prefix?: number }) {
  const baseClass =
    "sticky top-0 z-20 bg-background border-b text-center align-middle text-xs font-medium text-muted-foreground"
  return (
    <>
      <TableHead
        className={cn(baseClass, "px-3")}
        key={`${prefix ?? ""}-spent`}
      >
        Потрачено
      </TableHead>
      <TableHead className={cn(baseClass, "px-3")} key={`${prefix ?? ""}-ord`}>
        Заказов РК
      </TableHead>
      <TableHead className={cn(baseClass, "px-3")} key={`${prefix ?? ""}-rev`}>
        Оборот РК
      </TableHead>
      <TableHead className={cn(baseClass, "px-3")} key={`${prefix ?? ""}-drr`}>
        ДРР
      </TableHead>
      <TableHead className={cn(baseClass, "px-3")} key={`${prefix ?? ""}-cpc`}>
        CPC
      </TableHead>
      <TableHead className={cn(baseClass, "px-3")} key={`${prefix ?? ""}-ctr`}>
        CTR
      </TableHead>
      <TableHead className={cn(baseClass, "px-3")} key={`${prefix ?? ""}-cr`}>
        CR
      </TableHead>
    </>
  )
}

function StatBodyCells({ agg }: { agg: Aggregated }) {
  return (
    <>
      <TableCell className="text-right px-3">{fmtMoney(agg.totalSpent)}</TableCell>
      <TableCell className="text-right px-3">{fmtInt(agg.totalOrders)}</TableCell>
      <TableCell className="text-right px-3">{fmtMoney(agg.totalRevenue)}</TableCell>
      <TableCell className="text-right px-3">{fmtRatio(agg.drr)}</TableCell>
      <TableCell className="text-right px-3">{fmtCpc(agg.cpc)}</TableCell>
      <TableCell className="text-right px-3">{fmtRatio(agg.ctr)}</TableCell>
      <TableCell className="text-right px-3">{fmtRatio(agg.cr)}</TableCell>
    </>
  )
}

// ──────────────────────────────────────────────────────────────────
// Empty state — общий для всех 4 режимов
// ──────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="py-12 text-center text-sm text-muted-foreground">
      <p>Данные за период отсутствуют.</p>
      <p className="mt-1 text-xs">
        Завтра в 03:00 МСК выполнится auto-sync. Если результат всё ещё пуст —
        проверьте WB_ADS_TOKEN и наличие активных РК.
      </p>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────

export function AdvertCampaignsTable({ view }: AdvertCampaignsTableProps) {
  // Check emptiness per режим
  const isEmpty =
    (view.groupBy === "product" && view.groups.length === 0) ||
    (view.groupBy !== "product" && view.rows.length === 0)

  if (isEmpty) return <EmptyState />

  const headerClass =
    "sticky top-0 z-20 bg-background border-b text-xs font-medium text-muted-foreground align-middle"

  return (
    <div className="overflow-auto h-full">
      <table className="w-full border-separate border-spacing-0 text-sm">
        {view.groupBy === "product" && (
          <>
            <thead className="bg-background">
              <tr>
                <TableHead className={cn(headerClass, "text-left px-3 w-[80px]")}>
                  Фото
                </TableHead>
                <TableHead className={cn(headerClass, "text-left px-3")}>
                  Сводка
                </TableHead>
                <TableHead className={cn(headerClass, "text-left px-3")}>
                  Тип РК
                </TableHead>
                <TableHead className={cn(headerClass, "text-left px-3")}>
                  advertId / Name
                </TableHead>
                <StatHeaderCells />
              </tr>
            </thead>
            <TableBody>
              {view.groups.map((g) => (
                <ProductGroupRows key={g.product.id} group={g} />
              ))}
            </TableBody>
          </>
        )}

        {view.groupBy === "imt" && (
          <>
            <thead className="bg-background">
              <tr>
                <TableHead className={cn(headerClass, "text-left px-3")}>
                  Связка
                </TableHead>
                <TableHead className={cn(headerClass, "text-left px-3")}>
                  Товары
                </TableHead>
                <TableHead className={cn(headerClass, "text-right px-3")}>
                  Карточек
                </TableHead>
                <StatHeaderCells />
              </tr>
            </thead>
            <TableBody>
              {view.rows.map((r) => (
                <TableRow key={r.imtId}>
                  <TableCell className="px-3 font-mono text-xs">
                    #{r.imtId}
                  </TableCell>
                  <TableCell className="px-3 max-w-[400px]">
                    <span className="truncate block" title={r.productNames.join(", ")}>
                      {r.productNames.length === 0
                        ? "—"
                        : r.productNames.join(", ")}
                    </span>
                  </TableCell>
                  <TableCell className="text-right px-3">
                    {fmtInt(r.nmIds.length)}
                  </TableCell>
                  <StatBodyCells agg={r.agg} />
                </TableRow>
              ))}
            </TableBody>
          </>
        )}

        {view.groupBy === "campaign" && (
          <>
            <thead className="bg-background">
              <tr>
                <TableHead className={cn(headerClass, "text-left px-3")}>
                  advertId
                </TableHead>
                <TableHead className={cn(headerClass, "text-left px-3")}>
                  Название
                </TableHead>
                <TableHead className={cn(headerClass, "text-left px-3")}>
                  Тип РК
                </TableHead>
                <TableHead className={cn(headerClass, "text-left px-3")}>
                  Статус
                </TableHead>
                <StatHeaderCells />
              </tr>
            </thead>
            <TableBody>
              {view.rows.map((r) => (
                <TableRow key={r.advertId}>
                  <TableCell className="px-3 font-mono text-xs">
                    {r.advertId}
                  </TableCell>
                  <TableCell className="px-3">
                    {r.name ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="px-3">{typeLabel(r.type)}</TableCell>
                  <TableCell className="px-3 text-xs text-muted-foreground">
                    {r.status}
                  </TableCell>
                  <StatBodyCells agg={r.agg} />
                </TableRow>
              ))}
            </TableBody>
          </>
        )}

        {view.groupBy === "type" && (
          <>
            <thead className="bg-background">
              <tr>
                <TableHead className={cn(headerClass, "text-left px-3")}>
                  Тип РК
                </TableHead>
                <TableHead className={cn(headerClass, "text-right px-3")}>
                  Кампаний
                </TableHead>
                <StatHeaderCells />
              </tr>
            </thead>
            <TableBody>
              {view.rows.map((r) => (
                <TableRow key={r.type}>
                  <TableCell className="px-3">{typeLabel(r.type)}</TableCell>
                  <TableCell className="text-right px-3">
                    {fmtInt(r.campaignCount)}
                  </TableCell>
                  <StatBodyCells agg={r.agg} />
                </TableRow>
              ))}
            </TableBody>
          </>
        )}
      </table>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// ProductGroupRows — per-Product rowSpan
// ──────────────────────────────────────────────────────────────────

function ProductGroupRows({ group }: { group: ProductCampaignGroup }) {
  const rowCount = Math.max(1, group.campaigns.length)
  const hasCampaigns = group.campaigns.length > 0

  // Если кампаний 0 — рендерим одну строку с прочерками
  if (!hasCampaigns) {
    return (
      <TableRow>
        <TableCell className="px-3 align-middle">
          <ProductPhotoCell group={group} />
        </TableCell>
        <TableCell className="px-3 align-middle">
          <ProductSummaryCell group={group} />
        </TableCell>
        <TableCell className="px-3 text-muted-foreground">—</TableCell>
        <TableCell className="px-3 text-muted-foreground">—</TableCell>
        <StatBodyCells agg={group.productAgg} />
      </TableRow>
    )
  }

  return (
    <>
      {group.campaigns.map((c, idx) => (
        <TableRow key={`${group.product.id}-${c.advertId}`}>
          {idx === 0 && (
            <>
              <TableCell
                rowSpan={rowCount}
                className="px-3 align-middle border-b"
              >
                <ProductPhotoCell group={group} />
              </TableCell>
              <TableCell
                rowSpan={rowCount}
                className="px-3 align-middle border-b"
              >
                <ProductSummaryCell group={group} />
              </TableCell>
            </>
          )}
          <TableCell className="px-3">{typeLabel(c.type)}</TableCell>
          <TableCell className="px-3 text-xs">
            <span className="font-mono">{c.advertId}</span>
            {c.name && <span className="ml-2">{c.name}</span>}
          </TableCell>
          <StatBodyCells agg={c.agg} />
        </TableRow>
      ))}
    </>
  )
}

function ProductPhotoCell({ group }: { group: ProductCampaignGroup }) {
  const url = group.product.photoUrl
  if (!url) {
    return (
      <div className="w-14 h-[72px] bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
        нет
      </div>
    )
  }
  return (
    <div className="relative w-14 h-[72px] rounded overflow-hidden bg-muted">
      <Image
        src={url}
        alt={group.product.name}
        fill
        sizes="56px"
        className="object-cover"
        unoptimized
      />
    </div>
  )
}

function ProductSummaryCell({ group }: { group: ProductCampaignGroup }) {
  const p = group.product
  return (
    <div className="flex flex-col gap-0.5 min-w-[200px] max-w-[320px]">
      <div className="text-sm font-medium truncate" title={p.name}>
        {p.name}
      </div>
      <div className="text-xs text-muted-foreground">
        <span className="font-mono">{p.sku}</span>
        {p.article && <span className="ml-2">{p.article}</span>}
      </div>
      <div className="text-xs text-muted-foreground truncate">
        {[p.brand?.name, p.category?.name, p.subcategory?.name]
          .filter(Boolean)
          .join(" / ")}
      </div>
    </div>
  )
}
