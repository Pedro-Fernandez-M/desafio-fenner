import { Zap, CalendarClock } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" }

export type PublishedRow = {
  course_id: string
  course_name: string
  course_photo: string | null
  general_total: number
  xp_available: number
  position: number
}

function initials(name: string) {
  return name.replace(/[^0-9A-Za-z°]/g, "").slice(0, 3).toUpperCase()
}

export function PublishedRanking({
  rows,
  publishedAt,
  weekNumber,
}: {
  rows: PublishedRow[]
  publishedAt: string
  weekNumber: number
}) {
  return (
    <div className="space-y-4">
      <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <CalendarClock className="size-4" />
        Semana {weekNumber} · publicado el{" "}
        {new Date(publishedAt).toLocaleDateString("es-CL", {
          weekday: "long",
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">#</TableHead>
              <TableHead>Curso</TableHead>
              <TableHead className="text-right">Puntaje General</TableHead>
              <TableHead className="text-right">XP disponibles</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.course_id}>
                <TableCell className="font-semibold">
                  {MEDAL[row.position] ?? row.position}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8 border">
                      {row.course_photo && (
                        <AvatarImage
                          src={row.course_photo}
                          alt={row.course_name}
                        />
                      )}
                      <AvatarFallback className="bg-blue-50 text-xs font-medium text-blue-700">
                        {initials(row.course_name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{row.course_name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {row.general_total.toLocaleString("es-CL")}
                </TableCell>
                <TableCell className="text-muted-foreground text-right">
                  <span className="inline-flex items-center gap-1">
                    <Zap className="size-3.5 text-amber-500" />
                    {row.xp_available.toLocaleString("es-CL")}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
