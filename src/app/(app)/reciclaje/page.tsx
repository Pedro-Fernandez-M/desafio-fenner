import { requireAccess, getActiveSemester } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/layout/page-header"
import {
  RecyclingManager,
  type RecyclingItem,
} from "@/components/records/recycling-manager"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

export const metadata = { title: "Reciclaje · Desafío Fenner" }

export default async function ReciclajePage() {
  await requireAccess("reciclaje")
  const semester = await getActiveSemester()
  const supabase = await createClient()

  if (!semester) {
    return (
      <>
        <PageHeader title="Reciclaje" />
        <Alert>
          <AlertCircle className="size-4" />
          <AlertTitle>Sin semestre activo</AlertTitle>
          <AlertDescription>
            No hay un semestre activo configurado.
          </AlertDescription>
        </Alert>
      </>
    )
  }

  const [{ data: courses }, { data: recordsRaw }] = await Promise.all([
    supabase.from("courses").select("id, name").eq("active", true).order("name"),
    supabase
      .from("recycling_records")
      .select(
        "id, material, kilos, points, valid, record_date, courses(name), registrar:profiles!recycling_records_registered_by_fkey(full_name)"
      )
      .eq("semester_id", semester.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ])

  type Raw = {
    id: string
    material: string
    kilos: number
    points: number
    valid: boolean
    record_date: string
    courses: { name: string } | null
    registrar: { full_name: string } | null
  }
  const records: RecyclingItem[] = ((recordsRaw ?? []) as unknown as Raw[]).map(
    (r) => ({
      id: r.id,
      material: r.material,
      kilos: r.kilos,
      points: r.points,
      valid: r.valid,
      record_date: r.record_date,
      course_name: r.courses?.name ?? "—",
      registered_by_name: r.registrar?.full_name ?? null,
    })
  )

  return (
    <>
      <PageHeader
        title="Reciclaje"
        description="Bonus semanal: 30 puntos por kilo de material reciclable (cartón, papel, aluminio, PET, potes Colun). Entrega los viernes."
      />
      <RecyclingManager courses={courses ?? []} records={records} />
    </>
  )
}
