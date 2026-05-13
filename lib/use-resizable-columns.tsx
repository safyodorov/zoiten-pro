// lib/use-resizable-columns.ts
// Quick task 260513-phu: Reusable hook для resizable columns в data-таблицах.
// Persist через UserPreference (DB) — см. CLAUDE.md «Per-user UI настройки».
// Извлечён из components/prices/PriceCalculatorTable.tsx (quick 260410-mya)
// → переиспользуется в /stock, /stock/wb.
//
// Поведение:
//   - drag → throttle через requestAnimationFrame, debounced save 500ms
//   - double-click handle → reset колонки к DEFAULT_WIDTHS[key]
//   - cleanup на unmount (clearTimeout + cancelAnimationFrame + removeEventListener)
//   - MIN_COLUMN_WIDTH = 60px (защита от схлопывания в 0)

"use client"

import * as React from "react"
import { useState, useRef, useCallback, useEffect } from "react"
import { toast } from "sonner"
import { setUserPreference } from "@/app/actions/user-preferences"

const MIN_COLUMN_WIDTH = 60
const RESIZE_SAVE_DEBOUNCE_MS = 500

export interface UseResizableColumnsResult<K extends string> {
  /** Текущие ширины колонок (px). Используй для style={{ width, minWidth }} на <th>/<td>. */
  widths: Record<K, number>
  /** Стартовать drag для колонки. Передавай в onMouseDown handle'а. */
  startResize: (e: React.MouseEvent, key: K) => void
  /** Reset колонку к DEFAULT_WIDTHS[key]. Двойной клик по handle. */
  resetColumnWidth: (key: K) => void
}

/**
 * Hook для resizable columns с DB-persist.
 *
 * @param storageKey - Ключ в UserPreference (например "prices.wb.columnWidths")
 * @param defaultWidths - Дефолтные ширины колонок в px
 * @param initialWidths - Загруженные с сервера сохранённые ширины (RSC передаёт в props)
 *
 * Usage:
 * ```tsx
 * const { widths, startResize, resetColumnWidth } = useResizableColumns(
 *   "stock.columnWidths",
 *   { photo: 80, svodka: 240, sku: 120 },
 *   props.initialColumnWidths
 * )
 *
 * <th style={{ width: widths.photo, minWidth: widths.photo }} className="relative">
 *   Фото
 *   <ColumnResizeHandle
 *     onMouseDown={(e) => startResize(e, "photo")}
 *     onDoubleClick={() => resetColumnWidth("photo")}
 *   />
 * </th>
 * ```
 */
export function useResizableColumns<K extends string>(
  storageKey: string,
  defaultWidths: Record<K, number>,
  initialWidths?: Partial<Record<K, number>> | null,
): UseResizableColumnsResult<K> {
  // Merge: defaults + saved (unknown keys ignored через ключи defaultWidths)
  const [widths, setWidths] = useState<Record<K, number>>(() => ({
    ...defaultWidths,
    ...(initialWidths ?? {}),
  }))

  // Debounced save timer
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleSave = useCallback(
    (next: Record<K, number>) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(async () => {
        const result = await setUserPreference(storageKey, next)
        if (!result.ok) {
          toast.error(`Не удалось сохранить ширины: ${result.error}`)
        }
      }, RESIZE_SAVE_DEBOUNCE_MS)
    },
    [storageKey],
  )

  // Drag state — ref-based для отсутствия re-render на каждое движение
  const resizeStateRef = useRef<{
    key: K
    startX: number
    startWidth: number
  } | null>(null)
  const rafIdRef = useRef<number | null>(null)

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const state = resizeStateRef.current
    if (!state) return
    if (rafIdRef.current != null) return // throttle via rAF

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null
      const s = resizeStateRef.current
      if (!s) return
      const delta = e.clientX - s.startX
      const newWidth = Math.max(MIN_COLUMN_WIDTH, s.startWidth + delta)
      setWidths((prev) => ({ ...prev, [s.key]: newWidth }))
    })
  }, [])

  const handleMouseUp = useCallback(() => {
    resizeStateRef.current = null
    if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
    document.removeEventListener("mousemove", handleMouseMove)
    document.removeEventListener("mouseup", handleMouseUp)
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
    // Сохранить актуальные widths (функциональный setState для гарантии свежего значения)
    setWidths((current) => {
      scheduleSave(current)
      return current
    })
  }, [handleMouseMove, scheduleSave])

  const startResize = useCallback(
    (e: React.MouseEvent, key: K) => {
      e.preventDefault()
      e.stopPropagation()
      resizeStateRef.current = {
        key,
        startX: e.clientX,
        startWidth: widths[key],
      }
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
    },
    [widths, handleMouseMove, handleMouseUp],
  )

  const resetColumnWidth = useCallback(
    (key: K) => {
      setWidths((prev) => {
        const next = { ...prev, [key]: defaultWidths[key] }
        scheduleSave(next)
        return next
      })
    },
    [defaultWidths, scheduleSave],
  )

  // Cleanup на unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current)
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  return { widths, startResize, resetColumnWidth }
}

/** Drag handle на правой границе <th>. Захватывает mouse + двойной клик для reset.
 *  Требует `position: relative` на родительском <th>/<td> (абсолютное позиционирование). */
export function ColumnResizeHandle({
  onMouseDown,
  onDoubleClick,
}: {
  onMouseDown: (e: React.MouseEvent) => void
  onDoubleClick: (e: React.MouseEvent) => void
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 z-50"
      title="Потяните чтобы изменить ширину. Двойной клик — сброс к дефолту."
    />
  )
}
