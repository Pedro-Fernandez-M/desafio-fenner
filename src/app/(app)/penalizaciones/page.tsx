import { requireAccess, getActiveSemester } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/layout/page-header"
import {
  PenaltiesManager,
  type CatalogItem,
  type PenaltyItem,
} from "@/components/records/penalties-manager"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

export const metadata = { title: "Penalizaciones · Desafío Fenner" }

export default async function PenalizacionesPage() {
  await requireAccess("penalizaciones")
  const semester = await getActiveSemester()
  const supabase = await createClient()

  if (!semester) {
    return (
      <>
        <PageHeader title="Penalizaciones" />
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

  const [{ data: catalog }, { data: courses }, { data: penaltiesRaw }] =
    await Promise.all([
      supabase
        .from("penalty_catalog")
        .select("id, name, points, min_points, max_points")
        .eq("active", true)
        .order("points", { ascending: false }),
      supabase
        .from("courses")
        .select("id, name")
        .eq("active", true)
        .order("name"),
      supabase
        .from("penalties")
        .select(
          "id, points, student_name, description, created_at, courses(name), penalty_catalog(name), applier:profiles!penalties_applied_by_fkey(full_name)"
        )
        .eq("semester_id", semester.id)
        .order("created_at", { ascending: false })
        .limit(30),
    ])

  type Raw = {
    id: string
    points: number
    student_name: string | null
    description: string | null
    created_at: string
    courses: { name: string } | null
    penalty_catalog: { name: string } | null
    applier: { full_name: string } | null
  }
  const penalties: PenaltyItem[] = (
    (penaltiesRaw ?? []) as unknown as Raw[]
  ).map((p) => ({
    id: p.id,
    points: p.points,
    student_name: p.student_name,
    description: p.description,
    created_at: p.created_at,
    course_name: p.courses?.name ?? "—",
    catalog_name: p.penalty_catalog?.name ?? null,
    applied_by_name: p.applier?.full_name ?? null,
  }))

  return (
    <>
      <PageHeader
        title="Penalizaciones"
        description="Descuentos según el Reglamento Interno. Se aplican de inmediato al Puntaje General."
      />
      <PenaltiesManager
        catalog={(catalog ?? []) as CatalogItem[]}
        courses={courses ?? []}
        penalties={penalties}
      />
    </>
  )
}
