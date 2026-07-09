import { requireAccess, getActiveSemester } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/layout/page-header"
import {
  BonusesManager,
  type BonusItem,
} from "@/components/records/bonuses-manager"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

export const metadata = { title: "Bonos · Desafío Fenner" }

export default async function BonosPage() {
  await requireAccess("bonos")
  const semester = await getActiveSemester()
  const supabase = await createClient()

  if (!semester) {
    return (
      <>
        <PageHeader title="Bonos" />
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

  const [{ data: courses }, { data: bonusesRaw }] = await Promise.all([
    supabase.from("courses").select("id, name").eq("active", true).order("name"),
    supabase
      .from("bonuses")
      .select(
        "id, kind, points, description, created_at, courses(name), applier:profiles!bonuses_applied_by_fkey(full_name)"
      )
      .eq("semester_id", semester.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ])

  type Raw = {
    id: string
    kind: string
    points: number
    description: string | null
    created_at: string
    courses: { name: string } | null
    applier: { full_name: string } | null
  }
  const bonuses: BonusItem[] = ((bonusesRaw ?? []) as unknown as Raw[]).map(
    (b) => ({
      id: b.id,
      kind: b.kind,
      points: b.points,
      description: b.description,
      created_at: b.created_at,
      course_name: b.courses?.name ?? "—",
      applied_by_name: b.applier?.full_name ?? null,
    })
  )

  return (
    <>
      <PageHeader
        title="Bonos"
        description="Bonificaciones académicas al Puntaje General (Lenguaje, Matemáticas y mejoras de promedio). Se definen al cierre del semestre."
      />
      <BonusesManager courses={courses ?? []} bonuses={bonuses} />
    </>
  )
}
