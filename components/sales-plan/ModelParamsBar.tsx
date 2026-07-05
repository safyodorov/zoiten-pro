"use client"

import { useCallback, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { saveModelParams } from "@/app/actions/sales-plan"
import type { ModelParams } from "@/lib/sales-plan/types"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

// Описания полей параметров модели
type ParamKey = keyof ModelParams

interface ParamSpec {
  key: ParamKey
  label: string
  tooltip: string
  min: number
  max: number
}

const PARAMS: readonly ParamSpec[] = [
  {
    key: "defaultLeadTimeDays",
    label: "Срок поставки (дн)",
    tooltip:
      "Полный цикл от заказа поставщику до прихода товара (производство + логистика). Влияет на виртуальные закупки: дата заказа = дата прихода − срок поставки. Для реальных закупок без дат: приход = дата создания + срок. Если у товара задан свой срок у поставщика — используется он.",
    min: 0, max: 365,
  },
  {
    key: "safetyStockDays",
    label: "Страховой запас (дн)",
    tooltip:
      "Неснижаемый остаток в днях продаж. Как только прогнозный остаток опускается ниже «страховой запас × план продаж в день» — система предлагает новую виртуальную закупку («Пора заказывать»).",
    min: 0, max: 365,
  },
  {
    key: "vpCoverDays",
    label: "Покрытие закупки (дн)",
    tooltip:
      "На сколько дней плановых продаж рассчитывается каждая виртуальная закупка. Размер партии = продажи за это окно + страховой запас − прогнозный остаток на дату прихода.",
    min: 0, max: 365,
  },
  {
    key: "transitDays",
    label: "Транзит (дн)",
    tooltip:
      "Время в пути из Китая до склада. Для реальных закупок на этапе «В пути»: ожидаемый приход = дата отгрузки + транзит (если не указана плановая дата прихода).",
    min: 0, max: 365,
  },
  {
    key: "wbInboundLagDays",
    label: "Лаг приёмки WB (дн)",
    tooltip:
      "Дней от физического прихода партии до появления товара в продаже (приёмка/раскладка на складе WB). Прибавляется ко всем датам приходов в плане.",
    min: 0, max: 365,
  },
  {
    key: "deliveryDays",
    label: "Срок выкупа (дн)",
    tooltip:
      "Через сколько дней после заказа покупатель выкупает товар. План выкупов в ₽ на день = заказы N дней назад × % выкупа.",
    min: 0, max: 60,
  },
  {
    key: "returnDays",
    label: "Срок возврата (дн)",
    tooltip:
      "Ещё через сколько дней после срока выкупа невыкупленный товар возвращается на остаток и снова доступен к продаже.",
    min: 0, max: 60,
  },
] as const

interface ModelParamsBarProps {
  params: ModelParams
  readOnly?: boolean
}

export function ModelParamsBar({ params, readOnly = false }: ModelParamsBarProps) {
  const router = useRouter()
  const [values, setValues] = useState<Record<ParamKey, string>>(() => {
    const init: Record<string, string> = {}
    for (const { key } of PARAMS) {
      init[key] = String(params[key] ?? 0)
    }
    return init as Record<ParamKey, string>
  })

  const [, startTransition] = useTransition()
  const timersRef = useRef<Partial<Record<ParamKey, ReturnType<typeof setTimeout>>>>({})

  const handleChange = useCallback(
    (key: ParamKey, newValue: string) => {
      setValues((prev) => ({ ...prev, [key]: newValue }))

      // Сбрасываем pending таймер для этого ключа (паттерн GlobalRatesBar)
      const existingTimer = timersRef.current[key]
      if (existingTimer) clearTimeout(existingTimer)

      timersRef.current[key] = setTimeout(() => {
        const num = parseInt(newValue, 10)
        if (!Number.isFinite(num) || num < 0) return

        startTransition(async () => {
          const result = await saveModelParams({ [key]: num })
          if (result.ok) {
            toast.success("Параметр сохранён")
            router.refresh()
          } else {
            toast.error(result.error || "Не удалось сохранить")
          }
        })
      }, 500)
    },
    [router],
  )

  return (
    <details className="border rounded-md">
      <summary className="px-4 py-2 text-sm font-medium cursor-pointer select-none flex items-center gap-2">
        Параметры модели
      </summary>
      <div className="px-4 pb-4 pt-2 flex flex-wrap gap-4">
        {PARAMS.map(({ key, label, tooltip, min, max }) => (
          <div key={key} className="flex flex-col gap-1">
            <label htmlFor={`mp-${key}`} className="text-xs text-muted-foreground font-normal">
              <Tooltip>
                <TooltipTrigger
                  // base-ui Trigger по умолчанию <button> — подменяем на <span>
                  // через render-prop (паттерн PromoTooltip.tsx)
                  render={
                    <span className="cursor-help border-b border-dotted border-muted-foreground/50" />
                  }
                >
                  {label}
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-[280px] leading-relaxed">{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </label>
            <input
              id={`mp-${key}`}
              type="number"
              step="1"
              min={min}
              max={max}
              value={values[key]}
              disabled={readOnly}
              onChange={(e) => handleChange(key, e.target.value)}
              className="h-8 w-20 rounded-md border bg-background px-2 text-sm tabular-nums disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        ))}
      </div>
    </details>
  )
}
