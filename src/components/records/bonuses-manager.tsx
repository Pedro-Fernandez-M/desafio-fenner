"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Sparkles } from "lucide-react"

import { addBonus } from "@/lib/actions/records"
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

const BONUS_KINDS = [
  { key: "lenguaje", label: "Promedio ≥ 5.5 en Lenguaje", points: 300 },
  { key: "matematicas", label: "Promedio ≥ 5.5 en Matemáticas", points: 300 },
  { key: "ambas", label: "Promedio ≥ 6.0 en ambas", points: 700 },
  { key: "mejora_promedio", label: "Mejora su promedio", points: 200 },
  { key: "otro", label: "Otro (puntos personalizados)", points: 0 },
] as const

export type Course = { id: string; name: string }
export type BonusItem = {
  id: string
  kind: string
  points: number
  description: string | null
  created_at: string
  course_name: string
  applied_by_name: string | null
}

const KIND_LABELS: Record<string, string> = Object.fromEntries(
  BONUS_KINDS.map((k) => [k.key, k.label])
)

export function BonusesManager({
  courses,
  bonuses,
}: {
  courses: Course[]
  bonuses: BonusItem[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [courseId, setCourseId] = useState(courses[0]?.id ?? "")
  const [kind, setKind] = useState<string>("lenguaje")
  const [customPoints, setCustomPoints] = useState("")
  const [description, setDescription] = useState("")

  const kindDef = BONUS_KINDS.find((k) => k.key === kind)
  const isCustom = kind === "otro"
  const points = isCustom ? Number(customPoints) : kindDef?.points ?? 0

  const courseItems = courses.map((c) => ({ value: c.id, label: c.name }))
  const kindItems = BONUS_KINDS.map((k) => ({
    value: k.key,
    label: `${k.label}${k.points > 0 ? ` (+${k.points})` : ""}`,
  }))

  function handleSubmit() {
    if (!courseId || !kind) {
      toast.error("Completa los campos.")
      return
    }
    if (!Number.isInteger(points) || points <= 0) {
      toast.error("Los puntos deben ser un número positivo.")
      return
    }
    startTransition(async () => {
      const res = await addBonus({
        courseId,
        kind,
        points,
        description: description || null,
      })
      if (res.ok) {
        toast.success(`Bono aplicado: +${points} pts.`)
        setDescription("")
        setCustomPoints("")
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="space-y-8">
      <Card className="border-emerald-200">
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Curso</Label>
              <Select
                items={courseItems}
                value={courseId}
                onValueChange={(v) => v && setCourseId(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
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
              <Label>Tipo de bono</Label>
              <Select
                items={kindItems}
                value={kind}
                onValueChange={(v) => v && setKind(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kindItems.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isCustom && (
              <div className="space-y-1.5">
                <Label htmlFor="bonus-points">Puntos</Label>
                <Input
                  id="bonus-points"
                  type="number"
                  min={1}
                  step={50}
                  value={customPoints}
                  onChange={(e) => setCustomPoints(e.target.value)}
                  placeholder="Ej: 100"
                />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bonus-desc">Descripción (opcional)</Label>
            <Textarea
              id="bonus-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalle del logro…"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              Suma al <b>Puntaje General</b> del ranking (no entrega XP).
            </p>
            <Button onClick={handleSubmit} disabled={pending}>
              {pending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 size-4" />
              )}
              Aplicar bono {points > 0 ? `(+${points})` : ""}
            </Button>
          </div>
        </CardContent>
      </Card>

      <section>
        <h2 className="text-muted-foreground mb-3 text-sm font-medium">
          Últimos bonos
        </h2>
        {bonuses.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed bg-white px-5 py-8 text-center text-sm">
            Sin bonos registrados.
          </p>
        ) : (
          <div className="divide-y rounded-xl border bg-white">
            {bonuses.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div>
                  <p className="font-medium">
                    {b.course_name} · {KIND_LABELS[b.kind] ?? b.kind}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {b.description ? `${b.description} · ` : ""}
                    por {b.applied_by_name ?? "—"} ·{" "}
                    {new Date(b.created_at).toLocaleDateString("es-CL", {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </div>
                <Badge className="border-0 bg-emerald-100 text-emerald-700">
                  +{b.points} pts
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
