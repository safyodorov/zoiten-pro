// lib/copy-to-clipboard.ts
// Quick task 260513-phu: Pure helper для копирования текста в clipboard
// с toast.success/error. Используется в /stock, /stock/wb, /prices/wb на
// клик по ячейке с артикулом (SKU/nmId/marketplace article).
//
// Edge case: navigator.clipboard может throw в не-HTTPS контексте (dev на
// http://). Возвращаем Promise<void> и просто toast.error при отказе.

"use client"

import { toast } from "sonner"

/**
 * Копирует text в clipboard. По умолчанию toast.success c «Скопировано: <text>».
 * Передайте label для кастомного префикса:
 *   copyToClipboard("УКТ-000001", "Артикул") → toast «Артикул УКТ-000001 скопирован»
 */
export async function copyToClipboard(
  text: string,
  label?: string,
): Promise<void> {
  if (!text) {
    toast.error("Нечего копировать")
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    if (label) {
      toast.success(`${label} ${text} скопирован`)
    } else {
      toast.success(`Скопировано: ${text}`)
    }
  } catch (e) {
    console.error("[copyToClipboard]", e)
    toast.error("Не удалось скопировать")
  }
}
