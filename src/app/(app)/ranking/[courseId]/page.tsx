import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, Zap, TrendingUp, TrendingDown } from "lucide-react"

import { requireAccess, getActiveSemester } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { mergeRanking, type Standing } from "@/lib/ranking"
import { SCORE_EVENT_LABELS } from "@/lib/constants"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>
}) {
  const profile = await requireAccess("ranking")
  // El detalle muestra datos EN VIVO: solo administrador (el resto ve lo publicado).
  if (profile.role !== "administrador") redirect("/ranking")
  const { courseId } = await params
  const semester = await getActiveSemester()
  const supabase = await createClient()
  if (!semester) notFound()

  const { data: course } = await supabase
    .from("courses")
    .select("id, name, photo_url, level")
    .eq("id", courseId)
    .maybeSingle()
  if (!course) notFound()

  const [
    { data: allCourses },
    { data: standings },
    { data: areas },
    { data: evals },
    { data: events },
  ] = await Promise.all([
    supabase.from("courses").select("id, name, photo_url").eq("active", true),
    supabase
      .from("course_standings")
      .select("*")
      .eq("semester_id", semester.id),
    supabase.from("areas").select("id, name, slug, order_index").order("order_index"),
    supabase
      .from("evaluations")
      .select("area_id, total_points")
      .eq("course_id", courseId)
      .eq("semester_id", semester.id),
    supabase
      .from("score_events")
      .select("id, type, general_delta, xp_delta, description, created_at")
      .eq("course_id", courseId)
      .eq("semester_id", semester.id)
      .order("created_at", { ascending: false })
      .limit(15),
  ])

  const ranking = mergeRanking(
    allCourses ?? [],
    (standings ?? []) as Standing[]
  )
  const me = ranking.find((r) => r.courseId === courseId)

  // Puntos por área
  const pointsByArea = new Map<string, number>()
  for (const e of evals ?? []) {
    pointsByArea.set(
      e.area_id,
      (pointsByArea.get(e.area_id) ?? 0) + (e.total_points ?? 0)
    )
  }
  const areaRows = (areas ?? []).map((a) => ({
    ...a,
    points: pointsByArea.get(a.id) ?? 0,
  }))
  const maxArea = Math.max(1, ...areaRows.map((a) => a.points))
  const weakest = [...areaRows].sort((a, b) => a.points - b.points).slice(0, 2)

  return (
    <div className="space-y-8">
      <Link
        href="/ranking"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> Volver al ranking
      </Link>

      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge variant="secondary">{course.level}</Badge>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            {course.name}
          </h1>
        </div>
        {me && (
          <div className="text-right">
            <p className="text-muted-foreground text-sm">Posición</p>
            <p className="text-3xl font-bold text-blue-700">#{me.position}</p>
          </div>
        )}
      </div>

      {/* Métricas */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-sm">Puntaje General</p>
            <p className="text-2xl font-bold">
              {(me?.general ?? 0).toLocaleString("es-CL")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-muted-foreground flex items-center gap-1 text-sm">
              <Zap className="size-3.5 text-amber-500" /> XP disponibles
            </p>
            <p className="text-2xl font-bold">
              {(me?.xpAvailable ?? 0).toLocaleString("es-CL")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-sm">XP ganados / gastados</p>
            <p className="text-2xl font-bold">
              {(me?.xpEarned ?? 0).toLocaleString("es-CL")}
              <span className="text-muted-foreground text-base font-normal">
                {" "}
                / {(me?.xpSpent ?? 0).toLocaleString("es-CL")}
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Desglose por área */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Desglose por área</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {areaRows.map((a) => (
            <div key={a.id} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{a.name}</span>
                <span className="text-muted-foreground">{a.points} pts</span>
              </div>
              <Progress value={(a.points / maxArea) * 100} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Qué mejorar */}
      <Card className="border-amber-200 bg-amber-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="size-4 text-amber-600" /> Qué mejorar
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="text-muted-foreground">
            Las áreas con menor puntaje acumulado son las de mayor oportunidad:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {weakest.map((a) => (
              <li key={a.id}>
                <span className="font-medium">{a.name}</span> · {a.points} pts
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Actividad reciente */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actividad reciente</CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {(events ?? []).length === 0 && (
            <p className="text-muted-foreground p-6 text-sm">
              Sin movimientos todavía.
            </p>
          )}
          {(events ?? []).map((ev) => (
            <div
              key={ev.id}
              className="flex items-center justify-between gap-4 px-6 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {ev.description ?? SCORE_EVENT_LABELS[ev.type]}
                </p>
                <p className="text-muted-foreground text-xs">
                  <Badge variant="outline" className="mr-2">
                    {SCORE_EVENT_LABELS[ev.type]}
                  </Badge>
                  {new Date(ev.created_at).toLocaleDateString("es-CL", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="text-right text-sm">
                {ev.general_delta !== 0 && (
                  <span
                    className={
                      ev.general_delta > 0
                        ? "flex items-center gap-1 font-semibold text-emerald-600"
                        : "flex items-center gap-1 font-semibold text-red-600"
                    }
                  >
                    {ev.general_delta > 0 ? (
                      <TrendingUp className="size-3.5" />
                    ) : (
                      <TrendingDown className="size-3.5" />
                    )}
                    {ev.general_delta > 0 ? "+" : ""}
                    {ev.general_delta}
                  </span>
                )}
                {ev.xp_delta !== 0 && (
                  <span className="text-muted-foreground flex items-center justify-end gap-1 text-xs">
                    <Zap className="size-3 text-amber-500" />
                    {ev.xp_delta > 0 ? "+" : ""}
                    {ev.xp_delta} XP
                  </span>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
