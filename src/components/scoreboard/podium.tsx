"use client"

import { useEffect, useState } from "react"

export type PodiumEntry = {
  id: string
  name: string
  points: number
  xp: number
  xpEarned: number
  position: number
}

const STYLES: Record<
  number,
  { medal: string; bar: string; ring: string; glow: string; h: number }
> = {
  1: {
    medal: "🥇",
    bar: "from-amber-300 to-amber-500",
    ring: "ring-amber-300",
    glow: "shadow-[0_0_40px_-5px_rgba(251,191,36,0.6)]",
    h: 210,
  },
  2: {
    medal: "🥈",
    bar: "from-slate-200 to-slate-400",
    ring: "ring-slate-300",
    glow: "shadow-[0_0_30px_-8px_rgba(203,213,225,0.5)]",
    h: 150,
  },
  3: {
    medal: "🥉",
    bar: "from-orange-300 to-orange-500",
    ring: "ring-orange-300",
    glow: "shadow-[0_0_30px_-8px_rgba(249,115,22,0.5)]",
    h: 120,
  },
}

function initials(name: string) {
  return name.replace(/[^0-9A-Za-z°]/g, "").slice(0, 3).toUpperCase()
}

function Pedestal({ entry, delay }: { entry: PodiumEntry; delay: number }) {
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  const s = STYLES[entry.position]

  return (
    <div className="flex w-1/3 max-w-[180px] flex-col items-center">
      {/* Ficha del curso */}
      <div
        className={`mb-3 flex flex-col items-center transition-all duration-700 ${
          grown ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        }`}
      >
        <div
          className={`grid size-14 place-items-center rounded-full bg-white/10 text-sm font-black ring-2 ${s.ring} sm:size-16`}
        >
          {initials(entry.name)}
        </div>
        <p className="mt-2 text-center text-base font-black sm:text-lg">
          {entry.name}
        </p>
        <p className="text-lg font-black text-amber-300 sm:text-2xl">
          {entry.points.toLocaleString("es-CL")}
          <span className="ml-0.5 text-xs font-semibold text-blue-200">pts</span>
        </p>
        <p className="text-xs font-semibold text-emerald-300">
          ⚡ {entry.xp.toLocaleString("es-CL")} XP para gastar
        </p>
        <p className="text-[11px] text-blue-200">
          {entry.xpEarned.toLocaleString("es-CL")} XP acumulados
        </p>
      </div>

      {/* Pedestal */}
      <div
        className={`flex w-full items-start justify-center rounded-t-xl bg-gradient-to-b ${s.bar} ${s.glow} transition-[height] duration-1000 ease-out`}
        style={{ height: grown ? s.h : 0 }}
      >
        <div className="mt-3 flex flex-col items-center">
          <span className="text-3xl drop-shadow sm:text-4xl">{s.medal}</span>
          <span className="text-2xl font-black text-slate-900/70 sm:text-3xl">
            {entry.position}°
          </span>
        </div>
      </div>
    </div>
  )
}

export function Podium({ top3 }: { top3: PodiumEntry[] }) {
  const first = top3.find((e) => e.position === 1)
  const second = top3.find((e) => e.position === 2)
  const third = top3.find((e) => e.position === 3)

  return (
    <div className="flex items-end justify-center gap-2 sm:gap-4">
      {second && <Pedestal entry={second} delay={250} />}
      {first && <Pedestal entry={first} delay={0} />}
      {third && <Pedestal entry={third} delay={450} />}
    </div>
  )
}
