"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, MinusCircle } from "lucide-react"

import { addPenalty } from "@/lib/actions/records"
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

export type CatalogItem = {
  id: string
  name: string
  points: number
  min_points: number | null
  max_points: number | null
}
export type Course = { id: string; name: string }
export type PenaltyItem = {
  id: string
  points: number
  student_name: string | null
  description: string | null
  created_at: string
  course_name: string
  catalog_name: string | null
  applied_by_name: string | null
}

export function PenaltiesManager({
  catalog,
  courses,
  penalties,
}: {
  catalog: CatalogItem[]
  courses: Course[]
  penalties: PenaltyItem[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [courseId, setCourseId] = useState(courses[0]?.id ?? "")
  const [catalogId, setCatalogId] = useState(catalog[0]?.id ?? "")
  const [customPoints, setCustomPoints] = useState("")
  const [studentName, setStudentName] = useState("")
  const [description, setDescription] = useState("")

  const item = catalog.find((c) => c.id === catalogId)
  const hasRange =
    item?.min_points != null &&
    item?.max_points != null &&
    item.min_points !== item.max_points

  const courseItems = courses.map((c) => ({ value: c.id, label: c.name }))
  const catalogItems = catalog.map((c) => ({
    value: c.id,
    label: `${c.name} (${
      c.min_points != null && c.max_points != null && c.min_points !== c.max_points
        ? `${c.min_points} a ${c.max_points}`
        : c.points
    })`,
  }))

  function effectivePoints(): number | null {
    if (!item) return null
    if (!hasRange) return item.points
    const v = Number(customPoints)
    if (!Number.isInteger(v) || v >= 0) return null
    if (v < item.min_points! || v > item.max_points!) return null
    return v
  }

  function handleSubmit() {
    const points = effectivePoints()
    if (!courseId || !item || points === null) {
      toast.error(
        hasRange
          ? `Ingresa un valor entre ${item?.min_points} y ${item?.max_points}.`
          : "Completa los campos."
      )
      return
    }
    startTransition(async () => {
      const res = await addPenalty({
        courseId,
        catalogId: item.id,
        points,
        studentName: studentName || null,
        description: description || null,
      })
      if (res.ok) {
        toast.success(
          `Descuento aplicado de inmediato: ${points} pts al curso.`
        )
        setStudentName("")
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
      <Card className="border-red-200">
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
              <Label>Tipo de falta</Label>
              <Select
                items={catalogItems}
                value={catalogId}
                onValueChange={(v) => v && setCatalogId(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {catalogItems.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasRange && (
              <div className="space-y-1.5">
                <Label htmlFor="pen-points">
                  Puntos ({item?.min_points} a {item?.max_points})
                </Label>
                <Input
                  id="pen-points"
                  type="number"
                  step={50}
                  min={item?.min_points ?? undefined}
                  max={item?.max_points ?? undefined}
                  value={customPoints}
                  onChange={(e) => setCustomPoints(e.target.value)}
                  placeholder={String(item?.points ?? "")}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="pen-student">Estudiante (opcional)</Label>
              <Input
                id="pen-student"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Nombre del estudiante involucrado"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pen-desc">Descripción (opcional)</Label>
            <Textarea
              id="pen-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalle de la falta según reglamento…"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              El descuento se aplica <b>de inmediato</b> al Puntaje General.
            </p>
            <Button
              variant="destructive"
              onClick={handleSubmit}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <MinusCircle className="mr-2 size-4" />
              )}
              Aplicar descuento
            </Button>
          </div>
        </CardContent>
      </Card>

      <section>
        <h2 className="text-muted-foreground mb-3 text-sm font-medium">
          Últimas penalizaciones
        </h2>
        {penalties.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed bg-white px-5 py-8 text-center text-sm">
            Sin penalizaciones registradas.
          </p>
        ) : (
          <div className="divide-y rounded-xl border bg-white">
            {penalties.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div>
                  <p className="font-medium">
                    {p.course_name} · {p.catalog_name ?? "Descuento"}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {p.student_name ? `${p.student_name} · ` : ""}
                    {p.description ? `${p.description} · ` : ""}
                    por {p.applied_by_name ?? "—"} ·{" "}
                    {new Date(p.created_at).toLocaleDateString("es-CL", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <Badge className="border-0 bg-red-100 text-red-700">
                  {p.points} pts
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
