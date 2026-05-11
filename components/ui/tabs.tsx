"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import * as React from "react"

import { cn } from "@/lib/utils"

// ── Tabs (Root) ───────────────────────────────────────────────────

function Tabs({
  className,
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      className={cn("w-full", className)}
      {...props}
    />
  )
}

// ── TabsList ──────────────────────────────────────────────────────

function TabsList({
  className,
  ...props
}: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      className={cn("flex border-b gap-1", className)}
      {...props}
    />
  )
}

// ── TabsTrigger ───────────────────────────────────────────────────
// base-ui ставит на активный таб data-active + aria-selected="true"
// (НЕ data-selected как в более старых версиях, и НЕ data-state=active как в radix).
// Подтверждено в @base-ui/react/esm/tabs/tab/TabsTabDataAttributes.js.

function TabsTrigger({
  className,
  ...props
}: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        // Базовый стиль (неактивный): приглушённый цвет, прозрачная нижняя граница
        "cursor-pointer select-none px-4 py-2 text-sm font-medium",
        "border-b-2 border-transparent text-muted-foreground transition-colors",
        // Hover для неактивных
        "hover:text-foreground hover:bg-muted/50 rounded-t-md",
        // Активный: фон + основной цвет + нижняя полоса
        // aria-selected — стандарт ARIA, надёжнее чем data-attribute (если base-ui сменит ключ)
        "aria-selected:border-primary aria-selected:text-primary aria-selected:font-semibold aria-selected:bg-primary/10",
        className
      )}
      {...props}
    />
  )
}

// ── TabsContent (Panel) ───────────────────────────────────────────

function TabsContent({
  className,
  ...props
}: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      className={cn("mt-4 focus-visible:outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
