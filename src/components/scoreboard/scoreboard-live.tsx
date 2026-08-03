"use client"

import { useEffect, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Trophy, Radio, CalendarClock } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { mergeRanking, type CourseLite, type Standing } from "@/lib/ranking"
import { Podium, type PodiumEntry } from "@/components/scoreboard/podium"

export function ScoreboardLive() {
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["scoreboard-live"],
    queryFn: async () => {
      const { data: semester } = await supabase
        .from("semesters")
        .select("id")
        .eq("active", true)
        .maybeSingle()
      if (!semester) return { ranking: [] as PodiumEntry[] }

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

      const ranking = mergeRanking(
        (courses ?? []) as CourseLite[],
        (standings ?? []) as Standing[]
      ).map((r) => ({
        id: r.courseId,
        name: r.courseName,
        points: r.general,
        position: r.position,
      }))
      return { ranking }
    },
    refetchInterval: 45_000,
  })

  useEffect(() => {
    const channel = supabase
      .channel("scoreboard-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "course_standings" },
        () => queryClient.invalidateQueries({ queryKey: ["scoreboard-live"] })
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, queryClient])

  const ranking = data?.ranking ?? []
  const hasScores = ranking.some((r) => r.points !== 0)
  const podium = ranking.filter((r) => r.position <= 3)
  const rest = ranking.filter((r) => r.position > 3)
  const maxPoints = Math.max(1, ...ranking.map((r) => r.points))

  if (isLoading) {
    return <p className="text-center text-blue-200">Cargando marcador…</p>
  }

  if (!hasScores) {
    return (
      <div className="rounded-2xl border border-white/15 bg-white/5 p-10 text-center">
        <Trophy className="mx-auto mb-3 size-10 text-amber-400" />
        <p className="text-xl font-bold">¡El desafío está por comenzar!</p>
        <p className="mt-1 text-blue-200">
          Apenas se registren los primeros puntos aparecerán aquí.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-center gap-2 text-sm text-emerald-300">
        <Radio className="size-4 animate-pulse" />
        En vivo · se actualiza solo
      </div>

      {podium.length > 0 && (
        <div className="mb-10">
          <Podium top3={podium} />
        </div>
      )}

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
                    <span className="text-sm font-semibold text-blue-200">pts</span>
                  </p>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-400 to-amber-400 transition-all duration-700"
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

      {/* Aviso */}
      <div className="mt-8 flex items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-center text-sm text-emerald-100">
        <CalendarClock className="size-4 shrink-0" />
        El puntaje se actualiza en vivo con cada registro. El ranking oficial se
        publica los lunes.
      </div>
    </>
  )
}
