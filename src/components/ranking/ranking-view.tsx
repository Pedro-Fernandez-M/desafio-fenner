"use client"

import { useEffect, useMemo } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Trophy, Zap, Radio } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { mergeRanking, type CourseLite, type Standing } from "@/lib/ranking"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const MEDAL = ["", "🥇", "🥈", "🥉"]

export function RankingView({
  semesterId,
  courses,
  initialStandings,
}: {
  semesterId: string
  courses: CourseLite[]
  initialStandings: Standing[]
}) {
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()

  const { data: standings } = useQuery<Standing[]>({
    queryKey: ["standings", semesterId],
    queryFn: async () => {
      const { data } = await supabase
        .from("course_standings")
        .select("*")
        .eq("semester_id", semesterId)
      return data ?? []
    },
    initialData: initialStandings,
  })

  // Suscripción Realtime: refresca al cambiar cualquier acumulado.
  useEffect(() => {
    const channel = supabase
      .channel("standings-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "course_standings",
          filter: `semester_id=eq.${semesterId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["standings", semesterId],
          })
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, queryClient, semesterId])

  const ranking = mergeRanking(courses, standings ?? [])
  const podium = ranking.slice(0, 3)

  function initials(name: string) {
    return name.replace(/[^0-9A-Za-z°]/g, "").slice(0, 3).toUpperCase()
  }

  return (
    <div className="space-y-8">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Radio className="size-3.5 animate-pulse text-emerald-500" />
        En vivo · se actualiza automáticamente
      </div>

      {/* Podio */}
      {podium.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          {podium.map((row, i) => (
            <Link
              key={row.courseId}
              href={`/ranking/${row.courseId}`}
              className={cn(
                "rounded-xl border p-5 transition-shadow hover:shadow-md",
                i === 0
                  ? "order-1 border-amber-300 bg-gradient-to-b from-amber-50 to-white sm:order-2"
                  : i === 1
                    ? "order-2 sm:order-1"
                    : "order-3"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-3xl">{MEDAL[i + 1]}</span>
                <span className="text-muted-foreground text-sm font-medium">
                  #{row.position}
                </span>
              </div>
              <p className="mt-3 text-lg font-bold">{row.courseName}</p>
              <p className="text-2xl font-bold text-blue-700">
                {row.general.toLocaleString("es-CL")}
                <span className="text-muted-foreground ml-1 text-sm font-normal">
                  pts
                </span>
              </p>
              <p className="text-muted-foreground mt-1 flex items-center gap-1 text-sm">
                <Zap className="size-3.5 text-amber-500" />
                {row.xpAvailable.toLocaleString("es-CL")} XP disponibles
              </p>
            </Link>
          ))}
        </div>
      )}

      {/* Tabla completa */}
      <div className="overflow-x-auto rounded-xl border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">#</TableHead>
              <TableHead>Curso</TableHead>
              <TableHead className="text-right">
                Puntaje General (acumulado)
              </TableHead>
              <TableHead className="text-right">XP disponibles</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranking.map((row) => (
              <TableRow key={row.courseId} className="group">
                <TableCell className="font-semibold">
                  {MEDAL[row.position] || row.position}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/ranking/${row.courseId}`}
                    className="flex items-center gap-3 hover:underline"
                  >
                    <Avatar className="size-8 border">
                      {row.coursePhoto && (
                        <AvatarImage src={row.coursePhoto} alt={row.courseName} />
                      )}
                      <AvatarFallback className="bg-blue-50 text-xs font-medium text-blue-700">
                        {initials(row.courseName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{row.courseName}</span>
                  </Link>
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {row.general.toLocaleString("es-CL")}
                </TableCell>
                <TableCell className="text-muted-foreground text-right">
                  <span className="inline-flex items-center gap-1">
                    <Zap className="size-3.5 text-amber-500" />
                    {row.xpAvailable.toLocaleString("es-CL")}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {ranking.length === 0 && (
        <div className="text-muted-foreground grid place-items-center gap-2 rounded-xl border border-dashed py-16">
          <Trophy className="size-8 opacity-40" />
          <p>Aún no hay cursos para mostrar.</p>
        </div>
      )}
    </div>
  )
}
