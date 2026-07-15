import { requireAccess, getActiveSemester } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/layout/page-header"
import { RankingView } from "@/components/ranking/ranking-view"
import {
  PublishedRanking,
  type PublishedRow,
} from "@/components/ranking/published-ranking"
import { PublishButton } from "@/components/ranking/publish-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertCircle, Radio, Megaphone } from "lucide-react"

export const metadata = { title: "Ranking · Desafío Fenner" }

async function getLatestSnapshot(semesterId: string) {
  const supabase = await createClient()
  const { data: snapshot } = await supabase
    .from("ranking_snapshots")
    .select("id, week_number, published_at")
    .eq("semester_id", semesterId)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!snapshot) return null

  const { data: rowsRaw } = await supabase
    .from("ranking_snapshot_rows")
    .select(
      "course_id, general_total, xp_available, position, courses(name, photo_url)"
    )
    .eq("snapshot_id", snapshot.id)
    .order("position")

  type RowRaw = {
    course_id: string
    general_total: number
    xp_available: number
    position: number
    courses: { name: string; photo_url: string | null } | null
  }

  const rows: PublishedRow[] = ((rowsRaw ?? []) as unknown as RowRaw[]).map(
    (r) => ({
      course_id: r.course_id,
      course_name: r.courses?.name ?? "—",
      course_photo: r.courses?.photo_url ?? null,
      general_total: r.general_total,
      xp_available: r.xp_available,
      position: r.position,
    })
  )

  return { ...snapshot, rows }
}

export default async function RankingPage() {
  const profile = await requireAccess("ranking")
  const semester = await getActiveSemester()
  const supabase = await createClient()

  if (!semester) {
    return (
      <>
        <PageHeader title="Ranking" />
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

  const snapshot = await getLatestSnapshot(semester.id)
  const isAdmin = profile.role === "administrador"

  // --- No administradores: solo lo publicado ---
  if (!isAdmin) {
    return (
      <>
        <PageHeader
          title="Ranking"
          description={`Puntaje acumulado de todo el ${semester.name} — el curso con más puntos al cierre gana el gran premio. Se publica los lunes en la mañana.`}
        />
        {snapshot ? (
          <PublishedRanking
            rows={snapshot.rows}
            publishedAt={snapshot.published_at}
            weekNumber={snapshot.week_number}
          />
        ) : (
          <Alert>
            <AlertCircle className="size-4" />
            <AlertTitle>Aún sin publicación</AlertTitle>
            <AlertDescription>
              El primer ranking se publicará el lunes en la mañana.
            </AlertDescription>
          </Alert>
        )}
      </>
    )
  }

  // --- Administrador: en vivo + publicado + botón publicar ---
  const [{ data: courses }, { data: standings }] = await Promise.all([
    supabase
      .from("courses")
      .select("id, name, photo_url")
      .eq("active", true)
      .order("name"),
    supabase
      .from("course_standings")
      .select("*")
      .eq("semester_id", semester.id),
  ])

  return (
    <>
      <PageHeader
        title="Ranking"
        description={`${semester.name} · La publicación automática es los lunes a las 08:00 (hora de Chile).`}
        action={<PublishButton />}
      />
      <Tabs defaultValue="vivo">
        <TabsList className="mb-4">
          <TabsTrigger value="vivo" className="gap-1.5">
            <Radio className="size-4" /> En vivo (solo admin)
          </TabsTrigger>
          <TabsTrigger value="publicado" className="gap-1.5">
            <Megaphone className="size-4" /> Publicado
          </TabsTrigger>
        </TabsList>
        <TabsContent value="vivo">
          <RankingView
            semesterId={semester.id}
            courses={courses ?? []}
            initialStandings={standings ?? []}
          />
        </TabsContent>
        <TabsContent value="publicado">
          {snapshot ? (
            <PublishedRanking
              rows={snapshot.rows}
              publishedAt={snapshot.published_at}
              weekNumber={snapshot.week_number}
            />
          ) : (
            <Alert>
              <AlertCircle className="size-4" />
              <AlertTitle>Aún sin publicación</AlertTitle>
              <AlertDescription>
                Usa &quot;Publicar ahora&quot; o espera al lunes.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>
      </Tabs>
    </>
  )
}
