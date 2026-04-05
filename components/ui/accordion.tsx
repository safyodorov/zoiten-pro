"use client"

import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion"
import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

// ── Accordion (Root) ──────────────────────────────────────────────

function Accordion({
  className,
  ...props
}: AccordionPrimitive.Root.Props) {
  return (
    <AccordionPrimitive.Root
      className={cn("w-full", className)}
      {...props}
    />
  )
}

// ── AccordionItem ─────────────────────────────────────────────────

function AccordionItem({
  className,
  ...props
}: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      className={cn("border-b last:border-b-0", className)}
      {...props}
    />
  )
}

// ── AccordionTrigger (wraps Header + Trigger + ChevronDown icon) ──
// Uses data-open: (base-ui), NOT data-state=open (radix/shadcn)

function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header>
      <AccordionPrimitive.Trigger
        className={cn(
          "flex w-full items-center justify-between py-3 text-sm font-medium hover:underline [&>svg]:transition-transform data-open:[&>svg]:rotate-180",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDown className="h-4 w-4 shrink-0" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

// ── AccordionContent (Panel) ──────────────────────────────────────
// Uses data-open:/data-closed: (base-ui), NOT data-state= (radix/shadcn)

function AccordionContent({
  className,
  children,
  ...props
}: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      className={cn(
        "overflow-hidden text-sm data-open:animate-in data-closed:animate-out data-open:fade-in-0 data-closed:fade-out-0",
        className
      )}
      {...props}
    >
      <div className="pb-4 pt-0">{children}</div>
    </AccordionPrimitive.Panel>
  )
}

export {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
}
