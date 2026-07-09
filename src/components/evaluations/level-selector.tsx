"use client"

import { cn } from "@/lib/utils"
import { LEVELS } from "@/lib/constants"

const BTN_STYLES: Record<number, string> = {
  0: "data-[on=true]:bg-red-600 data-[on=true]:border-red-600",
  1: "data-[on=true]:bg-amber-500 data-[on=true]:border-amber-500",
  2: "data-[on=true]:bg-blue-600 data-[on=true]:border-blue-600",
  3: "data-[on=true]:bg-emerald-600 data-[on=true]:border-emerald-600",
}

export function LevelSelector({
  value,
  onChange,
  descriptions,
}: {
  value: number | null
  onChange: (level: number) => void
  descriptions: (string | null)[]
}) {
  return (
    <div className="flex gap-1.5">
      {LEVELS.map((lvl) => {
        const on = value === lvl.level
        return (
          <button
            key={lvl.level}
            type="button"
            title={descriptions[lvl.level] ?? lvl.label}
            aria-label={`${lvl.label}: ${descriptions[lvl.level] ?? ""}`}
            data-on={on}
            onClick={() => onChange(lvl.level)}
            className={cn(
              "grid size-9 place-items-center rounded-md border text-sm font-semibold transition-colors",
              "text-slate-600 hover:border-slate-400",
              "data-[on=true]:text-white",
              BTN_STYLES[lvl.level]
            )}
          >
            {lvl.level}
          </button>
        )
      })}
    </div>
  )
}
