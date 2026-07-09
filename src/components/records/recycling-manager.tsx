"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Recycle } from "lucide-react"

import { addRecycling } from "@/lib/actions/records"
import { RECYCLING_MATERIALS, MATERIAL_LABELS } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type Course = { id: string; name: string }
export type RecyclingItem = {
  id: string
  material: string
  kilos: number
  points: number
  valid: boolean
  record_date: string
  course_name: string
  registered_by_name: string | null
}

function todayISO() {
  const now = new Date()
  const tz = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - tz).toISOString().slice(0, 10)
}

export function RecyclingManager({
  courses,
  records,
}: {
  courses: Course[]
  records: RecyclingItem[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [courseId, setCourseId] = useState(courses[0]?.id ?? "")
  const [material, setMaterial] = useState<string>(RECYCLING_MATERIALS[0])
  const [kilos, setKilos] = useState("")
  const [recordDate, setRecordDate] = useState(todayISO())

  const kilosNum = Number(kilos)
  const previewPoints =
    Number.isFinite(kilosNum) && kilosNum >= 1 ? Math.floor(kilosNum) * 30 : 0

  const courseItems = courses.map((c) => ({ value: c.id, label: c.name }))
  const materialItems = RECYCLING_MATERIALS.map((m) => ({
    value: m,
    label: MATERIAL_LABELS[m],
  }))

  function handleSubmit() {
    if (!courseId || !material || !(kilosNum > 0)) {
      toast.error("Completa curso, material y kilos.")
      return
    }
    if (kilosNum < 1) {
      toast.error(
        "Mínimo 1 kilo de un mismo material (los kilos no se combinan entre materiales)."
      )
      return
    }
    startTransition(async () => {
      const res = await addRecycling({
        courseId,
        material,
        kilos: kilosNum,
        recordDate,
      })
      if (res.ok) {
        toast.success(`Reciclaje registrado: +${previewPoints} pts.`)
        setKilos("")
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="space-y-8">
      <Card className="border-green-200">
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              <Label>Material (uno solo)</Label>
              <Select
                items={materialItems}
                value={material}
                onValueChange={(v) => v && setMaterial(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {materialItems.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-kilos">Kilos</Label>
              <Input
                id="rec-kilos"
                type="number"
                min={0}
                step={0.1}
                value={kilos}
                onChange={(e) => setKilos(e.target.value)}
                placeholder="Ej: 2.5"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-date">Fecha (entrega viernes)</Label>
              <Input
                id="rec-date"
                type="date"
                value={recordDate}
                onChange={(e) => setRecordDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              30 pts por <b>kilo entero</b> de un mismo material. Ej: 1 kg de
              cartón ✔ · 0,5 kg cartón + 0,5 kg PET ✘
            </p>
            <Button onClick={handleSubmit} disabled={pending}>
              {pending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Recycle className="mr-2 size-4" />
              )}
              Registrar {previewPoints > 0 ? `(+${previewPoints})` : ""}
            </Button>
          </div>
        </CardContent>
      </Card>

      <section>
        <h2 className="text-muted-foreground mb-3 text-sm font-medium">
          Últimos registros
        </h2>
        {records.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed bg-white px-5 py-8 text-center text-sm">
            Sin registros de reciclaje.
          </p>
        ) : (
          <div className="divide-y rounded-xl border bg-white">
            {records.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div>
                  <p className="font-medium">
                    {r.course_name} · {MATERIAL_LABELS[r.material] ?? r.material}{" "}
                    · {r.kilos} kg
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {new Date(r.record_date + "T00:00:00").toLocaleDateString(
                      "es-CL",
                      { day: "numeric", month: "short" }
                    )}{" "}
                    · por {r.registered_by_name ?? "—"}
                  </p>
                </div>
                <Badge
                  className={
                    r.points > 0
                      ? "border-0 bg-green-100 text-green-700"
                      : "border-0 bg-slate-100 text-slate-500"
                  }
                >
                  {r.points > 0 ? `+${r.points} pts` : "Sin puntos"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
