"use client"

import * as React from "react"
import { useState, useMemo, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Check, ChevronsUpDown, Plus } from "lucide-react"

export interface CreatableComboboxOption {
  value: string
  label: string
}

export interface CreatableComboboxProps {
  options: CreatableComboboxOption[]
  value: string | null
  onValueChange: (value: string | null) => void
  onCreate?: (label: string) => void | Promise<void>
  placeholder?: string
  createLabel?: string
  disabled?: boolean
  className?: string
}

export function CreatableCombobox({
  options,
  value,
  onValueChange,
  onCreate,
  placeholder = "Выберите...",
  createLabel = "Добавить",
  disabled = false,
  className,
}: CreatableComboboxProps) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value]
  )

  const filteredOptions = useMemo(() => {
    const query = inputValue.trim().toLowerCase()
    if (!query) return options
    return options.filter((o) => o.label.toLowerCase().includes(query))
  }, [options, inputValue])

  const showCreate = useMemo(() => {
    const trimmed = inputValue.trim()
    if (!trimmed) return false
    return !options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase())
  }, [options, inputValue])

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [open])

  function handleSelect(optionValue: string) {
    onValueChange(optionValue)
    setInputValue("")
    setOpen(false)
  }

  function handleCreate() {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    onCreate?.(trimmed)
    setInputValue("")
    setOpen(false)
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen(!open)
          setTimeout(() => inputRef.current?.focus(), 50)
        }}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <span className={cn(!selectedOption && "text-muted-foreground")}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="flex items-center border-b px-3">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="flex h-9 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Поиск..."
            />
          </div>

          <div className="max-h-60 overflow-y-auto p-1">
            {filteredOptions.length === 0 && !showCreate && (
              <div className="py-2 px-3 text-sm text-muted-foreground">
                Нет вариантов
              </div>
            )}

            {filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={cn(
                  "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-3 py-1.5 text-sm outline-none",
                  "hover:bg-accent hover:text-accent-foreground",
                  option.value === value && "bg-accent"
                )}
              >
                <span className="flex h-4 w-4 items-center justify-center">
                  {option.value === value && <Check className="h-4 w-4" />}
                </span>
                {option.label}
              </button>
            ))}

            {showCreate && (
              <button
                type="button"
                onClick={handleCreate}
                className={cn(
                  "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-3 py-1.5 text-sm outline-none",
                  "hover:bg-accent hover:text-accent-foreground",
                  "text-muted-foreground"
                )}
              >
                <Plus className="h-4 w-4 shrink-0" />
                {createLabel}: {inputValue.trim()}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
