"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, CheckCircle2, CalendarDays, ChevronRight } from "lucide-react"

import { pointsForLevel } from "@/lib/constants"
import { submitClassEvaluation } from "@/lib/actions/evaluations"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { LevelSelector } from "@/components/evaluations/level-selector"

type Indicator = { id: string; name: string; levels: (string | null)[] }
type Area = { id: string; name: string; indicators: Indicator[] }
export type Slot = {
  key: string
  courseId: string
  courseName: string
  subject: string
  date: string
  dayLabel: string
  weekday: number
}
type Registered = Record<string, { levels: Record<string, number>; note: string }>

const DAY_NAMES: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
}

export function TeacherScheduleBoard({
  slots,
  areas,
  registrarName,
  registered,
  weekLabel,
}: {
  slots: Slot[]
  areas: Area[]
  registrarName: string
  registered: Registered
  weekLabel: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [levels, setLevels] = useState<Record<string, number>>({})
  const [note, setNote] = useState("")

  const indicators = useMemo(() => areas.flatMap((a) => a.indicators), [areas])
  const active = slots.find((s) => s.key === activeKey) ?? null

  const byDay = useMemo(() => {
    const m = new Map<number, Slot[]>()
    for (const s of slots) {
      if (!m.has(s.weekday)) m.set(s.weekday, [])
      m.get(s.weekday)!.push(s)
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0])
  }, [slots])

  function openSlot(slot: Slot) {
    setActiveKey(slot.key)
    const existing = registered[slot.key]
    setLevels(existing?.levels ?? {})
    setNote(existing?.note ?? "")
  }

  const completed = indicators.filter((i) => levels[i.id] !== undefined).length
  const allDone = indicators.length > 0 && completed === indicators.length
  const previewTotal = indicators.reduce(
    (sum, i) => sum + pointsForLevel(levels[i.id] ?? 0),
    0
  )

  function handleSubmit() {
    if (!active) return
    if (!allDone) {
      toast.error("Asigna un nivel a cada indicador.")
      return
    }
    startTransition(async () => {
      const res = await submitClassEvaluation({
        courseId: active.courseId,
        classDate: active.date,
        subject: active.subject,
        block: null,
        scores: indicators.map((i) => ({ indicator_id: i.id, level: levels[i.id] })),
        note: note.trim() || null,
      })
      if (res.ok) {
        toast.success("Clase registrada.")
        setActiveKey(null)
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  if (slots.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <CalendarDays className="text-muted-foreground mx-auto mb-2 size-8" />
          <p className="font-medium">No tienes clases en tu horario esta semana.</p>
          <p className="text-muted-foreground text-sm">
            Si crees que es un error, avisa al administrador.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
        <span>
          Registrando como{" "}
          <span className="text-foreground font-semibold">{registrarName}</span>
        </span>
        <Badge variant="secondary" className="gap-1">
          <CalendarDays className="size-3.5" /> {weekLabel}
        </Badge>
      </div>

      {byDay.map(([weekday, daySlots]) => (
        <div key={weekday} className="space-y-2">
          <h3 className="text-muted-foreground text-sm font-semibold">
            {DAY_NAMES[weekday]}
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {daySlots.map((slot) => {
              const done = Boolean(registered[slot.key])
              const isActive = slot.key === activeKey
              return (
                <button
                  key={slot.key}
                  type="button"
                  onClick={() => (isActive ? setActiveKey(null) : openSlot(slot))}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 text-left transition-colors",
                    isActive
                      ? "border-blue-500 ring-1 ring-blue-500"
                      : "hover:border-slate-300"
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{slot.courseName}</p>
                    <p className="text-muted-foreground truncate text-sm">
                      {slot.subject}
                    </p>
                  </div>
                  {done ? (
                    <Badge className="shrink-0 gap-1 bg-emerald-600">
                      <CheckCircle2 className="size-3.5" /> Listo
                    </Badge>
                  ) : (
                    <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {/* Rúbrica del slot seleccionado */}
      {active && (
        <Card className="border-blue-200">
          <CardContent className="space-y-1">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">
                  {active.courseName} · {active.subject}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {DAY_NAMES[active.weekday]} · {completed}/{indicators.length}{" "}
                  indicadores · vista previa:{" "}
                  <span className="text-foreground font-medium">
                    {previewTotal} XP
                  </span>
                </p>
              </div>
              <div className="w-40">
                <Progress
                  value={
                    indicators.length ? (completed / indicators.length) * 100 : 0
                  }
                />
              </div>
            </div>

            {areas.map((area) => (
              <div key={area.id} className="pt-2">
                <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
                  {area.name}
                </p>
                <div className="divide-y">
                  {area.indicators.map((ind) => {
                    const lvl = levels[ind.id]
                    return (
                      <div
                        key={ind.id}
                        className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{ind.name}</p>
                          <p className="text-muted-foreground text-sm">
                            {lvl !== undefined
                              ? ind.levels[lvl] ?? "—"
                              : "Selecciona un nivel"}
                          </p>
                        </div>
                        <LevelSelector
                          value={lvl ?? null}
                          onChange={(l) =>
                            setLevels((p) => ({ ...p, [ind.id]: l }))
                          }
                          descriptions={ind.levels}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            <div className="space-y-1.5 pt-3">
              <Label htmlFor="sch-note">Observación (opcional)</Label>
              <Textarea
                id="sch-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Comentario de la clase…"
              />
            </div>
            <div className="flex items-center justify-end pt-2">
              <Button onClick={handleSubmit} disabled={!allDone || pending}>
                {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Guardar clase
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
