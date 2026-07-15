"use client"

import { useEffect, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Radio } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { mergeRanking, type CourseLite, type Standing } from "@/lib/ranking"

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" }

/**
 * Tablero público EN VIVO: lee con la anon key (policies de solo lectura) y
 * se actualiza al instante vía Supabase Realtime con cada punto que se mueve.
 */
export function LiveBoard() {
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["live-board"],
    queryFn: async () => {
      const { data: semester } = await supabase
        .from("semesters")
        .select("id, name")
        .eq("active", true)
        .maybeSingle()
      if (!semester) return null

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

      return {
        semesterId: semester.id,
        semesterName: semester.name,
        ranking: mergeRanking(
          (courses ?? []) as CourseLite[],
          (standings ?? []) as Standing[]
        ),
      }
    },
    refetchInterval: 60_000,
  })

  useEffect(() => {
    const channel = supabase
      .channel("live-board")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "course_standings" },
        () => queryClient.invalidateQueries({ queryKey: ["live-board"] })
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, queryClient])

  const ranking = data?.ranking ?? []
  const maxPoints = Math.max(1, ...ranking.map((r) => r.general))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-center gap-2 text-sm text-emerald-300">
        <Radio className="size-4 animate-pulse" />
        EN VIVO · se actualiza al instante con cada punto
      </div>

      {isLoading ? (
        <p className="text-center text-blue-200">Cargando marcador…</p>
      ) : ranking.length === 0 ? (
        <p className="rounded-2xl border border-white/15 bg-white/5 p-10 text-center text-blue-200">
          Aún no hay cursos con puntaje.
        </p>
      ) : (
        <div className="space-y-3">
          {ranking.map((r) => (
            <div
              key={r.courseId}
              className={`flex items-center gap-4 rounded-xl border px-5 py-4 transition-all ${
                r.position === 1
                  ? "border-amber-400/60 bg-gradient-to-r from-amber-400/15 to-transparent"
                  : "border-white/10 bg-white/5"
              }`}
            >
              <span className="w-10 text-center text-2xl font-black">
                {MEDAL[r.position] ?? (
                  <span className="text-blue-300">{r.position}</span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-xl font-black">{r.courseName}</p>
                  <p className="shrink-0 text-xl font-black text-amber-300">
                    {r.general.toLocaleString("es-CL")}
                    <span className="ml-1 text-sm font-semibold text-blue-200">
                      pts
                    </span>
                  </p>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-amber-400 transition-all duration-700"
                    style={{
                      width: `${Math.max(2, Math.round((Math.max(0, r.general) / maxPoints) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
