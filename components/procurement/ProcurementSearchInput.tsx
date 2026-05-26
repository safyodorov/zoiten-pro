"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState, useRef, useEffect } from "react"
import { Input } from "@/components/ui/input"

interface ProcurementSearchInputProps {
  defaultValue: string
}

export function ProcurementSearchInput({ defaultValue }: ProcurementSearchInputProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [inputValue, setInputValue] = useState(defaultValue)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setInputValue(defaultValue)
  }, [defaultValue])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setInputValue(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (value.trim()) params.set("q", value.trim())
      else params.delete("q")
      const qs = params.toString()
      router.push(`/purchase-plan${qs ? `?${qs}` : ""}`)
    }, 300)
  }

  return (
    <Input
      placeholder="Поиск по названию..."
      value={inputValue}
      onChange={handleChange}
      className="max-w-sm"
    />
  )
}
