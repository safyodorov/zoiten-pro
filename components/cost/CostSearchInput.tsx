"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useState, useEffect } from "react"
import { Input } from "@/components/ui/input"

export function CostSearchInput({ defaultValue }: { defaultValue: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [inputValue, setInputValue] = useState(defaultValue)

  const pushUrl = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.delete("page")
      if (value.trim()) params.set("q", value.trim())
      else params.delete("q")
      const qs = params.toString()
      router.push(`/batches${qs ? `?${qs}` : ""}`)
    },
    [router, searchParams]
  )

  useEffect(() => {
    const timer = setTimeout(() => pushUrl(inputValue), 300)
    return () => clearTimeout(timer)
  }, [inputValue, pushUrl])

  return (
    <Input
      placeholder="Поиск по названию..."
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      className="max-w-sm"
    />
  )
}
