import { requireAccess, getActiveSemester } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { groupForRole, GROUP_LABELS, type IndicatorGroup } from "@/lib/constants"
import { PageHeader } from "@/components/layout/page-header"
import { ClassEvaluationBoard } from "@/components/evaluations/class-evaluation-board"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertCircle, GraduationCap, HeartHandshake } from "lucide-react"

export const metadata = { title: "Registrar · Desafío Fenner" }

type IndicatorRow = {
  id: string
  name: string
  level_0_desc: string | null
  level_1_desc: string | null
  level_2_desc: string | null
  level_3_desc: string | null
  order_index: number
  active: boolean
  assigned_group: IndicatorGroup
}
type AreaRow = {
  id: string
  name: string
  slug: string
  order_index: number
  indicators: IndicatorRow[]
}

function areasForGroup(allAreas: AreaRow[], group: IndicatorGroup) {
  return allAreas
    .map((a) => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      indicators: a.indicators
        .filter((i) => i.active && i.assigned_group === group)
        .sort((x, y) => x.order_index - y.order_index)
        .map((i) => ({
          id: i.id,
          name: i.name,
          levels: [
            i.level_0_desc,
            i.level_1_desc,
            i.level_2_desc,
            i.level_3_desc,
          ],
        })),
    }))
    .filter((a) => a.indicators.length > 0)
}

export default async function EvaluarPage() {
  const profile = await requireAccess("evaluar")
  const semester = await getActiveSemester()
  const supabase = await createClient()

  if (!semester) {
    return (
      <>
        <PageHeader title="Registrar" />
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Sin semestre activo</AlertTitle>
          <AlertDescription>
            Un administrador debe activar un semestre para poder registrar.
          </AlertDescription>
        </Alert>
      </>
    )
  }

  const [{ data: allCourses }, { data: areasRaw }] = await Promise.all([
    supabase
      .from("courses")
      .select("id, name")
      .eq("active", true)
      .order("name"),
    supabase
      .from("areas")
      .select(
        "id, name, slug, order_index, indicators(id, name, level_0_desc, level_1_desc, level_2_desc, level_3_desc, order_index, active, assigned_group)"
      )
      .order("order_index"),
  ])

  // Los profesores solo ven (y el RPC solo acepta) sus cursos asignados.
  let courses = allCourses ?? []
  let jefaturaCourseId: string | null = null
  if (profile.role === "profesor") {
    const [{ data: assigned }, { data: headed }] = await Promise.all([
      supabase
        .from("teacher_courses")
        .select("course_id")
        .eq("teacher_id", profile.id),
      supabase
        .from("courses")
        .select("id")
        .eq("head_teacher_id", profile.id)
        .maybeSingle(),
    ])
    const allowed = new Set((assigned ?? []).map((a) => a.course_id))
    courses = courses.filter((c) => allowed.has(c.id))
    jefaturaCourseId = headed?.id ?? null
  }

  const allAreas = (areasRaw ?? []) as unknown as AreaRow[]
  const isAdmin = profile.role === "administrador"
  const myGroup = groupForRole(profile.role)

  const profAreas = areasForGroup(allAreas, "profesores")
  const convAreas = areasForGroup(allAreas, "convivencia")

  const noCourses = courses.length === 0

  if (noCourses || (!isAdmin && !myGroup)) {
    return (
      <>
        <PageHeader title="Registrar" />
        <Alert>
          <AlertCircle className="size-4" />
          <AlertTitle>Nada para registrar</AlertTitle>
          <AlertDescription>
            {noCourses
              ? profile.role === "profesor"
                ? "Aún no tienes cursos asignados. Contacta al administrador."
                : "No hay cursos activos configurados."
              : "Tu rol no tiene indicadores asignados."}
          </AlertDescription>
        </Alert>
      </>
    )
  }

  // Admin: pestañas con ambos grupos. Resto: solo su grupo.
  if (isAdmin) {
    return (
      <>
        <PageHeader
          title="Registrar"
          description="Registro diario por grupo. El puntaje semanal se calcula con el promedio de los registros y se publica los lunes en la mañana."
        />
        <Tabs defaultValue="profesores">
          <TabsList className="mb-4">
            <TabsTrigger value="profesores" className="gap-1.5">
              <GraduationCap className="size-4" /> {GROUP_LABELS.profesores}
            </TabsTrigger>
            <TabsTrigger value="convivencia" className="gap-1.5">
              <HeartHandshake className="size-4" /> {GROUP_LABELS.convivencia}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="profesores">
            <ClassEvaluationBoard
              registrarName={profile.full_name}
              courses={courses}
              areas={profAreas}
              subjectMode="required"
            />
          </TabsContent>
          <TabsContent value="convivencia">
            <ClassEvaluationBoard
              registrarName={profile.full_name}
              courses={courses}
              areas={convAreas}
              subjectMode="hidden"
            />
          </TabsContent>
        </Tabs>
      </>
    )
  }

  const areas = myGroup === "profesores" ? profAreas : convAreas

  return (
    <>
      <PageHeader
        title="Registrar"
        description={
          myGroup === "profesores"
            ? "Registra la pauta de cada clase de tu asignatura. El puntaje semanal del curso será el promedio de todas las clases y se publica el lunes en la mañana."
            : "Registra las observaciones del día (a cualquier hora). El conteo semanal se publica el lunes en la mañana."
        }
      />
      {areas.length === 0 ? (
        <Alert>
          <AlertCircle className="size-4" />
          <AlertTitle>Sin indicadores asignados</AlertTitle>
          <AlertDescription>
            El administrador aún no asigna indicadores a tu grupo (
            {myGroup ? GROUP_LABELS[myGroup] : "—"}).
          </AlertDescription>
        </Alert>
      ) : (
        <ClassEvaluationBoard
          registrarName={profile.full_name}
          courses={courses}
          areas={areas}
          subjectMode={myGroup === "profesores" ? "required" : "hidden"}
          subjectOptions={
            profile.role === "profesor" ? profile.subjects ?? [] : undefined
          }
          jefaturaCourseId={jefaturaCourseId}
        />
      )}
    </>
  )
}
