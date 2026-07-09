"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { GraduationCap, HeartHandshake } from "lucide-react"

import { setIndicatorGroup } from "@/lib/actions/admin"
import { GROUP_LABELS, type IndicatorGroup } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export type IndicatorItem = {
  id: string
  name: string
  assigned_group: IndicatorGroup
}
export type AreaGroup = {
  id: string
  name: string
  indicators: IndicatorItem[]
}

function GroupToggle({
  value,
  onChange,
  disabled,
}: {
  value: IndicatorGroup
  onChange: (g: IndicatorGroup) => void
  disabled: boolean
}) {
  const options: { key: IndicatorGroup; icon: typeof GraduationCap }[] = [
    { key: "profesores", icon: GraduationCap },
    { key: "convivencia", icon: HeartHandshake },
  ]
  return (
    <div className="flex rounded-lg border p-0.5">
      {options.map(({ key, icon: Icon }) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => value !== key && onChange(key)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === key
              ? key === "profesores"
                ? "bg-blue-600 text-white"
                : "bg-emerald-600 text-white"
              : "text-muted-foreground hover:bg-slate-100"
          )}
        >
          <Icon className="size-3.5" />
          {GROUP_LABELS[key]}
        </button>
      ))}
    </div>
  )
}

export function IndicatorsManager({ areas }: { areas: AreaGroup[] }) {
  const [pending, startTransition] = useTransition()

  function handleChange(ind: IndicatorItem, group: IndicatorGroup) {
    startTransition(async () => {
      const res = await setIndicatorGroup(ind.id, group)
      if (res.ok) {
        toast.success(`"${ind.name}" → ${GROUP_LABELS[group]}.`)
      } else {
        toast.error(res.error)
      }
    })
  }

  const totals = areas
    .flatMap((a) => a.indicators)
    .reduce(
      (acc, i) => {
        acc[i.assigned_group]++
        return acc
      },
      { profesores: 0, convivencia: 0 } as Record<IndicatorGroup, number>
    )

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <Badge className="bg-blue-600">
          {GROUP_LABELS.profesores}: {totals.profesores}
        </Badge>
        <Badge className="bg-emerald-600">
          {GROUP_LABELS.convivencia}: {totals.convivencia}
        </Badge>
      </div>

      {areas.map((area) => (
        <Card key={area.id}>
          <CardContent className="space-y-1">
            <h3 className="mb-2 font-semibold">{area.name}</h3>
            <div className="divide-y">
              {area.indicators.map((ind) => (
                <div
                  key={ind.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="text-sm font-medium">{ind.name}</p>
                  <GroupToggle
                    value={ind.assigned_group}
                    onChange={(g) => handleChange(ind, g)}
                    disabled={pending}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
