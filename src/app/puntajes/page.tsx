import { Trophy, CalendarClock } from "lucide-react"

import { createAdminClient } from "@/lib/supabase/server"
import { Podium } from "@/components/scoreboard/podium"

export const metadata = {
  title: "¿Cómo vamos? · Desafío Fenner",
  description:
    "Marcador oficial del Desafío Fenner — puntaje acumulado de los cursos de 2° medio.",
}

// El marcador se refresca solo (los datos cambian con cada publicación).
export const revalidate = 60

type Row = {
  course_id: string
  general_total: number
  position: number
  courses: { name: string } | null
}

async function getPublishedRanking() {
  try {
    const admin = createAdminClient()

    const { data: snapshot } = await admin
      .from("ranking_snapshots")
      .select("id, week_number, published_at")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!snapshot) return null

    const { data: rows } = await admin
      .from("ranking_snapshot_rows")
      .select("course_id, general_total, position, courses(name)")
      .eq("snapshot_id", snapshot.id)
      .order("position")

    return {
      weekNumber: snapshot.week_number,
      publishedAt: snapshot.published_at,
      rows: ((rows ?? []) as unknown as Row[]).map((r) => ({
        id: r.course_id,
        name: r.courses?.name ?? "—",
        points: r.general_total,
        position: r.position,
      })),
    }
  } catch {
    return null
  }
}

export default async function PuntajesPage() {
  const data = await getPublishedRanking()
  const rows = data?.rows ?? []
  const podium = rows.filter((r) => r.position <= 3)
  const rest = rows.filter((r) => r.position > 3)
  const maxPoints = Math.max(1, ...rows.map((r) => r.points))

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-950 via-indigo-950 to-slate-950 px-4 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-3xl">
        {/* Encabezado */}
        <header className="mb-10 text-center">
          <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-white/10 text-2xl font-black ring-1 ring-white/20">
            DF
          </div>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            Desafío Fenner
          </h1>
          <p className="mt-2 text-lg text-blue-200">
            ¿Cómo vamos? 🏁 Puntaje acumulado del semestre
          </p>
        </header>

        {!data ? (
          <div className="rounded-2xl border border-white/15 bg-white/5 p-10 text-center">
            <Trophy className="mx-auto mb-3 size-10 text-amber-400" />
            <p className="text-xl font-bold">¡El desafío está por comenzar!</p>
            <p className="mt-1 text-blue-200">
              El primer marcador se publica el lunes en la mañana.
            </p>
          </div>
        ) : (
          <>
            {/* Podio visual */}
            {podium.length > 0 && (
              <div className="mb-10">
                <Podium top3={podium} />
              </div>
            )}

            {/* Resto de los cursos */}
            {rest.length > 0 && (
              <div className="space-y-3">
                {rest.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-5 py-4"
                  >
                    <span className="w-8 text-center text-xl font-black text-blue-300">
                      {r.position}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-lg font-bold">{r.name}</p>
                        <p className="shrink-0 text-lg font-black text-amber-300">
                          {r.points.toLocaleString("es-CL")}{" "}
                          <span className="text-sm font-semibold text-blue-200">
                            pts
                          </span>
                        </p>
                      </div>
                      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-400 to-amber-400"
                          style={{
                            width: `${Math.max(2, Math.round((Math.max(0, r.points) / maxPoints) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pie */}
            <footer className="mt-10 flex flex-col items-center gap-1 text-center text-sm text-blue-300">
              <p className="flex items-center gap-1.5">
                <CalendarClock className="size-4" />
                Semana {data.weekNumber} · publicado el{" "}
                {new Date(data.publishedAt).toLocaleDateString("es-CL", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </p>
              <p>Se actualiza todos los lunes · ¡Cada buena acción suma! 💪</p>
            </footer>
          </>
        )}
      </div>
    </main>
  )
}
