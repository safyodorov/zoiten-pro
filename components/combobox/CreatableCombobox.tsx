"use client"

import * as React from "react"
import { useState, useMemo } from "react"
import { Combobox } from "@base-ui/react/combobox"
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
  const [inputValue, setInputValue] = useState<string>("")

  // Find label for the currently selected value
  const selectedOption = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value]
  )

  // Filter options based on inputValue (case-insensitive)
  const filteredOptions = useMemo(() => {
    const query = inputValue.trim().toLowerCase()
    if (!query) return options
    return options.filter((o) => o.label.toLowerCase().includes(query))
  }, [options, inputValue])

  // Show create item when there is input and no exact label match
  const showCreate = useMemo(() => {
    const trimmed = inputValue.trim()
    if (!trimmed) return false
    return !options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase())
  }, [options, inputValue])

  function handleValueChange(newValue: string | null) {
    if (newValue === null) {
      onValueChange(null)
      return
    }
    const option = options.find((o) => o.value === newValue)
    if (option) {
      setInputValue(option.label)
      onValueChange(newValue)
    }
  }

  function handleCreate() {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    onCreate?.(trimmed)
    setInputValue("")
  }

  return (
    <Combobox.Root
      value={value}
      onValueChange={handleValueChange}
      inputValue={inputValue}
      onInputValueChange={(val) => setInputValue(val)}
      disabled={disabled}
    >
      <Combobox.Trigger
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          className
        )}
      >
        <Combobox.Value placeholder={placeholder}>
          {selectedOption?.label ?? placeholder}
        </Combobox.Value>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Combobox.Trigger>

      <Combobox.Positioner sideOffset={4}>
        <Combobox.Popup
          className={cn(
            "z-50 w-[var(--anchor-width)] min-w-[200px] rounded-md border bg-popover text-popover-foreground shadow-md",
            "overflow-hidden"
          )}
        >
          <div className="flex items-center border-b px-3">
            <Combobox.Input
              className="flex h-9 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Поиск..."
            />
          </div>

          <div className="max-h-60 overflow-y-auto p-1">
            {filteredOptions.length === 0 && !showCreate && (
              <Combobox.Empty className="py-2 px-3 text-sm text-muted-foreground">
                Нет вариантов
              </Combobox.Empty>
            )}

            {filteredOptions.map((option) => (
              <Combobox.Item
                key={option.value}
                value={option.value}
                className={cn(
                  "relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-3 py-1.5 text-sm outline-none",
                  "hover:bg-accent hover:text-accent-foreground",
                  "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
                  "data-disabled:pointer-events-none data-disabled:opacity-50"
                )}
              >
                <Combobox.ItemIndicator className="flex h-4 w-4 items-center justify-center">
                  <Check className="h-4 w-4" />
                </Combobox.ItemIndicator>
                {option.label}
              </Combobox.Item>
            ))}

            {showCreate && (
              <button
                type="button"
                onMouseDown={(e) => {
                  // Prevent closing dropdown on mousedown
                  e.preventDefault()
                }}
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
        </Combobox.Popup>
      </Combobox.Positioner>
    </Combobox.Root>
  )
}
