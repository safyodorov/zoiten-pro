"use client"

import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"

function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

// Суммы в тыс ₽ (единый формат таблицы «Товары» — без К/М, просьба пользователя)
function fmtThousandsRub(n: number): string {
  return `${fmtNum(Math.round(n / 1000))} тыс ₽`
}

function daysInMonth(monthIso: string): number {
  // monthIso = "2026-07-01"
  const [y, m] = monthIso.split("-").map(Number)
  return new Date(y, m, 0).getDate()
}

interface ProductPlanCellProps {
  productId: string
  month: string                // "2026-07-01"
  value: number | null         // текущий targetOrdersPerDay (null = авто)
  baseline: number             // baselineOrdersPerDay
  readOnly: boolean
  hasDayOverrides?: boolean    // маркер •д
  avgPriceRub: number
  onChange: (draft: string) => void   // вызывается при каждом изменении инпута
  onClear: () => void                  // сброс на null (авто)
}

export function ProductPlanCell({
  productId: _productId,
  month,
  value,
  baseline,
  readOnly,
  hasDayOverrides,
  avgPriceRub,
  onChange,
  onClear,
}: ProductPlanCellProps) {
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState(value != null ? String(value) : "")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  // Синхронизируем inputValue с value ТОЛЬКО когда НЕ редактируем.
  // Иначе value (производный от черновика, который ты и печатаешь) перебивает
  // ввод на каждой клавише — каретка прыгает, число «сбрасывается» (фикс 260707).
  useEffect(() => {
    if (!editing) setInputValue(value != null ? String(value) : "")
  }, [value, editing])

  const effectiveRate = value ?? baseline
  const days = daysInMonth(month)
  const monthTotal = effectiveRate * days * avgPriceRub

  if (!readOnly && editing) {
    return (
      <div className="flex flex-col gap-0.5 min-w-[90px]">
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="number"
            step="0.1"
            min="0"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value)
              onChange(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                setEditing(false)
              }
            }}
            onBlur={() => setEditing(false)}
            placeholder={`авто ${baseline.toFixed(1)}`}
            className="h-7 w-20 rounded border bg-background px-1.5 text-xs tabular-nums"
          />
          <button
            type="button"
            title="Сбросить на авто"
            onClick={() => {
              setInputValue("")
              onClear()
              setEditing(false)
            }}
            className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
          ≈ {Math.round(effectiveRate * days)} шт · {fmtThousandsRub(monthTotal)}
        </span>
      </div>
    )
  }

  // В не-editing состоянии: внешняя обёртка — div role="button" (не button),
  // чтобы вложить настоящую <button> для ✕ без нарушения HTML-валидности.
  return (
    <div
      role="button"
      tabIndex={readOnly ? -1 : 0}
      onClick={() => {
        if (!readOnly) {
          setEditing(true)
        }
      }}
      onKeyDown={(e) => {
        if (!readOnly && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault()
          setEditing(true)
        }
      }}
      className={`flex flex-col items-end gap-0.5 w-full min-w-[80px] text-right ${
        !readOnly ? "rounded border border-dashed border-border/60 hover:border-primary/50 hover:bg-muted/50 px-1 py-0.5 cursor-text" : "cursor-default"
      }`}
    >
      <span className="text-sm tabular-nums whitespace-nowrap flex items-center gap-0.5">
        {value != null && !readOnly && (
          <button
            type="button"
            title="Сбросить на авто"
            onClick={(e) => { e.stopPropagation(); onClear() }}
            className="h-5 w-5 flex items-center justify-center text-[10px] text-muted-foreground hover:text-destructive leading-none"
          >
            ✕
          </button>
        )}
        {value != null
          ? fmtNum(value, value < 2 ? 1 : 0)
          : <span className="text-muted-foreground text-xs">авто {fmtNum(baseline, baseline < 2 ? 1 : 0)}</span>
        }
        {hasDayOverrides && (
          <span className="ml-0.5 text-[10px] text-primary" title="Есть дневные правки">•д</span>
        )}
      </span>
      <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
        {fmtThousandsRub(monthTotal)}
      </span>
    </div>
  )
}
