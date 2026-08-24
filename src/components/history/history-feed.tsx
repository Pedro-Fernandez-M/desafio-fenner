"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Radio,
  ClipboardCheck,
  MinusCircle,
  Sparkles,
  Recycle,
  Gift,
  Zap,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { SCORE_EVENT_LABELS } from "@/lib/constants"
import { undoRecord } from "@/lib/actions/admin"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const DELETABLE_TABLES = [
  "penalties",
  "bonuses",
  "recycling_records",
  "redemptions",
  "class_evaluations",
]

type FeedItem = {
  id: string
  kind: "registro" | "evento"
  at: string
  edited: boolean
  actorName: string
  courseName: string
  title: string
  detail: string | null
  eventType?: string
  generalDelta?: number
  xpDelta?: number
  refTable?: string | null
  refId?: string | null
}

const EVENT_ICONS: Record<string, typeof MinusCircle> = {
  penalizacion: MinusCircle,
  bonus: Sparkles,
  reciclaje: Recycle,
  canje: Gift,
  ajuste: Pencil,
  evaluacion: ClipboardCheck,
}

export function HistoryFeed({ isAdmin = false }: { isAdmin?: boolean }) {
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()
  const [pending, startTransition] = useTransition()
  const [toDelete, setToDelete] = useState<FeedItem | null>(null)

  function handleDelete() {
    if (!toDelete?.refTable || !toDelete?.refId) return
    startTransition(async () => {
      const res = await undoRecord(toDelete.refTable!, toDelete.refId!)
      if (res.ok) {
        toast.success("Registro eliminado y puntaje corregido.")
        setToDelete(null)
        queryClient.invalidateQueries({ queryKey: ["activity-feed"] })
      } else {
        toast.error(res.error)
      }
    })
  }

  const { data: items, isLoading } = useQuery<FeedItem[]>({
    queryKey: ["activity-feed"],
    queryFn: async () => {
      const [{ data: regsRaw }, { data: eventsRaw }] = await Promise.all([
        supabase
          .from("class_evaluations")
          .select(
            "id, class_date, block, subject, note, created_at, updated_at, courses(name), evaluator:profiles!class_evaluations_evaluator_id_fkey(full_name), class_evaluation_scores(count)"
          )
          .order("updated_at", { ascending: false })
          .limit(60),
        supabase
          .from("score_events")
          .select(
            "id, type, general_delta, xp_delta, description, created_at, reference_table, reference_id, courses(name), actor:profiles!score_events_created_by_fkey(full_name)"
          )
          .neq("type", "evaluacion")
          .order("created_at", { ascending: false })
          .limit(60),
      ])

      type RegRaw = {
        id: string
        class_date: string
        block: number | null
        subject: string | null
        note: string | null
        created_at: string
        updated_at: string
        courses: { name: string } | null
        evaluator: { full_name: string } | null
        class_evaluation_scores: { count: number }[]
      }
      type EvRaw = {
        id: string
        type: string
        general_delta: number
        xp_delta: number
        description: string | null
        created_at: string
        reference_table: string | null
        reference_id: string | null
        courses: { name: string } | null
        actor: { full_name: string } | null
      }

      const regs: FeedItem[] = ((regsRaw ?? []) as unknown as RegRaw[]).map(
        (r) => {
          const n = r.class_evaluation_scores?.[0]?.count ?? 0
          const dateStr = new Date(
            r.class_date + "T00:00:00"
          ).toLocaleDateString("es-CL", { day: "numeric", month: "short" })
          return {
            id: `reg-${r.id}`,
            kind: "registro" as const,
            at: r.updated_at,
            edited: r.updated_at !== r.created_at,
            actorName: r.evaluator?.full_name ?? "—",
            courseName: r.courses?.name ?? "—",
            refTable: "class_evaluations",
            refId: r.id,
            title: r.subject
              ? `Registró clase de ${r.subject}`
              : "Registró observaciones del día",
            detail: [
              `clase del ${dateStr}`,
              r.block ? `bloque ${r.block}` : null,
              `${n} indicador${n === 1 ? "" : "es"}`,
              r.note ? `"${r.note}"` : null,
            ]
              .filter(Boolean)
              .join(" · "),
          }
        }
      )

      const events: FeedItem[] = ((eventsRaw ?? []) as unknown as EvRaw[]).map(
        (e) => ({
          id: `ev-${e.id}`,
          kind: "evento" as const,
          at: e.created_at,
          edited: false,
          actorName: e.actor?.full_name ?? "Sistema",
          courseName: e.courses?.name ?? "—",
          title: e.description ?? SCORE_EVENT_LABELS[e.type] ?? e.type,
          detail: null,
          eventType: e.type,
          generalDelta: e.general_delta,
          xpDelta: e.xp_delta,
          refTable: e.reference_table,
          refId: e.reference_id,
        })
      )

      return [...regs, ...events]
        .sort((a, b) => (a.at < b.at ? 1 : -1))
        .slice(0, 120)
    },
    refetchInterval: 60_000,
  })

  // Realtime: cualquier registro o evento nuevo refresca el feed.
  useEffect(() => {
    const channel = supabase
      .channel("activity-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "class_evaluations" },
        () => queryClient.invalidateQueries({ queryKey: ["activity-feed"] })
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "score_events" },
        () => queryClient.invalidateQueries({ queryKey: ["activity-feed"] })
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, queryClient])

  return (
    <div className="space-y-4">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Radio className="size-3.5 animate-pulse text-emerald-500" />
        En vivo · cada registro queda con nombre, materia y hora
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : (items ?? []).length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed bg-white px-5 py-10 text-center text-sm">
          Aún no hay actividad registrada.
        </p>
      ) : (
        <div className="divide-y rounded-xl border bg-white">
          {(items ?? []).map((item) => {
            const Icon =
              item.kind === "registro"
                ? ClipboardCheck
                : EVENT_ICONS[item.eventType ?? ""] ?? Pencil
            const negative = (item.generalDelta ?? 0) < 0
            return (
              <div key={item.id} className="flex items-start gap-3 px-5 py-3.5">
                <div
                  className={cn(
                    "mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg",
                    item.kind === "registro"
                      ? "bg-blue-50 text-blue-600"
                      : negative
                        ? "bg-red-50 text-red-600"
                        : "bg-emerald-50 text-emerald-600"
                  )}
                >
                  <Icon className="size-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-semibold">{item.actorName}</span>{" "}
                    <span className="text-muted-foreground">·</span>{" "}
                    {item.title}{" "}
                    <Badge variant="outline" className="ml-1 align-middle">
                      {item.courseName}
                    </Badge>
                    {item.edited && (
                      <Badge
                        variant="secondary"
                        className="ml-1 align-middle text-[10px]"
                      >
                        corregido
                      </Badge>
                    )}
                  </p>
                  {item.detail && (
                    <p className="text-muted-foreground truncate text-xs">
                      {item.detail}
                    </p>
                  )}
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {new Date(item.at).toLocaleDateString("es-CL", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                {item.kind === "evento" && (
                  <div className="shrink-0 text-right text-sm">
                    {(item.generalDelta ?? 0) !== 0 && (
                      <p
                        className={cn(
                          "font-semibold",
                          negative ? "text-red-600" : "text-emerald-600"
                        )}
                      >
                        {(item.generalDelta ?? 0) > 0 ? "+" : ""}
                        {item.generalDelta} pts
                      </p>
                    )}
                    {(item.xpDelta ?? 0) !== 0 && (
                      <p className="text-muted-foreground flex items-center justify-end gap-0.5 text-xs">
                        <Zap className="size-3 text-amber-500" />
                        {(item.xpDelta ?? 0) > 0 ? "+" : ""}
                        {item.xpDelta} XP
                      </p>
                    )}
                  </div>
                )}
                {isAdmin &&
                  item.refTable &&
                  DELETABLE_TABLES.includes(item.refTable) && (
                    <button
                      type="button"
                      onClick={() => setToDelete(item)}
                      title="Eliminar este registro"
                      className="text-muted-foreground shrink-0 rounded-md p-1.5 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
              </div>
            )
          })}
        </div>
      )}

      {/* Confirmación de eliminación */}
      <Dialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar este registro?</DialogTitle>
            <DialogDescription>
              Se eliminará <b>{toDelete?.title}</b> ({toDelete?.courseName}) y el
              puntaje del curso se corregirá automáticamente. Esta acción no se
              puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={pending}
            >
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
