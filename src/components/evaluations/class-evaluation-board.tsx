"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Loader2, Info, X } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { submitClassEvaluation } from "@/lib/actions/evaluations"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LevelSelector } from "@/components/evaluations/level-selector"

type Indicator = { id: string; name: string; levels: (string | null)[] }
type Area = { id: string; name: string; slug: string; indicators: Indicator[] }
type Course = { id: string; name: string }

const BLOCKS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]

function todayISO() {
  const now = new Date()
  const tz = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - tz).toISOString().slice(0, 10)
}

export function ClassEvaluationBoard({
  courses,
  areas,
  subjectMode = "optional",
  registrarName,
}: {
  courses: Course[]
  areas: Area[]
  /** required: profesores (deben indicar asignatura) · hidden: convivencia */
  subjectMode?: "required" | "optional" | "hidden"
  registrarName?: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()
  const [pending, startTransition] = useTransition()

  const [courseId, setCourseId] = useState(courses[0]?.id ?? "")
  const [classDate, setClassDate] = useState(todayISO())
  const [block, setBlock] = useState<string>("none")
  const [subject, setSubject] = useState("")
  const [levels, setLevels] = useState<Record<string, number>>({})
  const [note, setNote] = useState("")

  const courseItems = courses.map((c) => ({ value: c.id, label: c.name }))
  const blockItems = [
    { value: "none", label: "—" },
    ...BLOCKS.map((b) => ({ value: b, label: `Bloque ${b}` })),
  ]

  const blockNum = block === "none" ? null : Number(block)

  // Carga un registro existente del mismo profesor/curso/día/bloque (para corregir)
  const { data: existing, isFetching } = useQuery({
    queryKey: ["class-eval", courseId, classDate, block],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return null

      let q = supabase
        .from("class_evaluations")
        .select("id, note, subject, class_evaluation_scores(indicator_id, level)")
        .eq("course_id", courseId)
        .eq("class_date", classDate)
        .eq("evaluator_id", user.id)
      q = blockNum === null ? q.is("block", null) : q.eq("block", blockNum)
      const { data } = await q.maybeSingle()

      type Row = {
        note: string | null
        subject: string | null
        class_evaluation_scores: { indicator_id: string; level: number }[]
      }
      return (data as unknown as Row) ?? null
    },
    enabled: Boolean(courseId && classDate),
  })

  useEffect(() => {
    const map: Record<string, number> = {}
    for (const s of existing?.class_evaluation_scores ?? []) {
      map[s.indicator_id] = s.level
    }
    setLevels(map)
    setNote(existing?.note ?? "")
    setSubject(existing?.subject ?? "")
  }, [existing])

  const totalIndicators = areas.reduce((n, a) => n + a.indicators.length, 0)
  const ratedCount = Object.keys(levels).length

  function setLevel(id: string, level: number) {
    setLevels((prev) => ({ ...prev, [id]: level }))
  }

  function clearLevel(id: string) {
    setLevels((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  function handleSubmit() {
    if (ratedCount === 0) {
      toast.error("Registra al menos un indicador.")
      return
    }
    if (subjectMode === "required" && !subject.trim()) {
      toast.error("Indica la asignatura de la clase.")
      return
    }
    startTransition(async () => {
      const res = await submitClassEvaluation({
        courseId,
        classDate,
        block: blockNum,
        subject: subject || null,
        scores: Object.entries(levels).map(([indicator_id, level]) => ({
          indicator_id,
          level,
        })),
        note: note || null,
      })
      if (res.ok) {
        toast.success("Clase registrada. El puntaje semanal se recalculó.")
        queryClient.invalidateQueries({
          queryKey: ["class-eval", courseId, classDate, block],
        })
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="space-y-6">
      {registrarName && (
        <p className="text-muted-foreground text-sm">
          Registrando como{" "}
          <span className="text-foreground font-semibold">{registrarName}</span>{" "}
          — tu nombre quedará en el historial público.
        </p>
      )}
      {/* Contexto de la clase */}
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Curso</Label>
            <Select
              items={courseItems}
              value={courseId}
              onValueChange={(v) => v && setCourseId(v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Curso" />
              </SelectTrigger>
              <SelectContent>
                {courseItems.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="class-date">Fecha</Label>
            <Input
              id="class-date"
              type="date"
              value={classDate}
              onChange={(e) => setClassDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Bloque (opcional)</Label>
            <Select
              items={blockItems}
              value={block}
              onValueChange={(v) => v && setBlock(v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {blockItems.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {subjectMode !== "hidden" && (
            <div className="space-y-1.5">
              <Label htmlFor="subject">
                Asignatura{subjectMode === "optional" ? " (opcional)" : ""}
              </Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ej: Matemáticas"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Aviso de registro existente / modelo de puntaje */}
      {existing ? (
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <Info className="size-4 shrink-0" />
          Ya registraste esta clase; al guardar se reemplaza.
        </div>
      ) : (
        <div className="text-muted-foreground flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm">
          <Info className="size-4 shrink-0" />
          Marca solo los indicadores que aplican a tu clase. El puntaje semanal
          del curso se calcula con el <b>promedio de todas las clases</b> de la
          semana.
        </div>
      )}

      {/* Rúbrica agrupada por área */}
      {areas.map((area) => (
        <Card key={area.id}>
          <CardContent className="space-y-1">
            <h3 className="mb-2 font-semibold">{area.name}</h3>
            <div className="divide-y">
              {area.indicators.map((ind) => {
                const lvl = levels[ind.id]
                const rated = lvl !== undefined
                return (
                  <div
                    key={ind.id}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{ind.name}</p>
                      <p className="text-muted-foreground text-sm">
                        {rated ? ind.levels[lvl] ?? "—" : "Sin registrar (no aplica)"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <LevelSelector
                        value={rated ? lvl : null}
                        onChange={(l) => setLevel(ind.id, l)}
                        descriptions={ind.levels}
                      />
                      {rated && (
                        <button
                          type="button"
                          onClick={() => clearLevel(ind.id)}
                          title="Quitar (no aplica)"
                          className="text-muted-foreground grid size-9 place-items-center rounded-md border hover:bg-slate-50"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Nota + guardar */}
      <Card>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="class-note">Observación (opcional)</Label>
            <Textarea
              id="class-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Comentario de la clase…"
              rows={2}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant={ratedCount > 0 ? "default" : "secondary"}>
                {ratedCount}/{totalIndicators} registrados
              </Badge>
              {isFetching && (
                <span className="text-muted-foreground flex items-center gap-1">
                  <Loader2 className="size-3.5 animate-spin" /> cargando…
                </span>
              )}
            </div>
            <Button onClick={handleSubmit} disabled={ratedCount === 0 || pending}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Registrar clase
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
