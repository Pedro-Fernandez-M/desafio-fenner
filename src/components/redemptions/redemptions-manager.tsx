"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Zap, Gift, Check, X } from "lucide-react"

import { requestRedemption, decideRedemption } from "@/lib/actions/redemptions"
import { REWARD_TIERS, REDEMPTION_STATUS_LABELS } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type RewardItem = {
  id: string
  name: string
  description: string | null
  tier: keyof typeof REWARD_TIERS
  xp_cost: number
  monthly_limit: number | null
}
export type CourseWallet = { id: string; name: string; xp_available: number }
export type RedemptionItem = {
  id: string
  status: string
  xp_spent: number
  created_at: string
  course_name: string
  reward_name: string
  requested_by_name: string | null
}

export function RedemptionsManager({
  rewards,
  courses,
  redemptions,
  canDecide,
}: {
  rewards: RewardItem[]
  courses: CourseWallet[]
  redemptions: RedemptionItem[]
  canDecide: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "")

  const course = courses.find((c) => c.id === courseId)
  const courseItems = courses.map((c) => ({ value: c.id, label: c.name }))

  function handleRequest(reward: RewardItem) {
    if (!course) return
    startTransition(async () => {
      const res = await requestRedemption({
        courseId,
        rewardId: reward.id,
      })
      if (res.ok) {
        toast.success(`Canje solicitado: ${reward.name} para ${course.name}.`)
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  function handleDecide(item: RedemptionItem, approve: boolean) {
    startTransition(async () => {
      const res = await decideRedemption(item.id, approve)
      if (res.ok) {
        toast.success(
          approve
            ? `Canje aprobado. Se descontaron ${item.xp_spent} XP.`
            : "Canje rechazado."
        )
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  const pendings = redemptions.filter((r) => r.status === "pendiente")
  const history = redemptions.filter((r) => r.status !== "pendiente")

  return (
    <div className="space-y-8">
      {/* Selector de curso + saldo */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="w-full max-w-xs space-y-1.5">
            <Label>Curso</Label>
            <Select
              items={courseItems}
              value={courseId}
              onValueChange={(v) => v && setCourseId(v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Curso" />
              </SelectTrigger>
              <SelectContent>
                {courseItems.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-2">
            <Zap className="size-5 text-amber-500" />
            <div>
              <p className="text-xs text-amber-800">XP disponibles</p>
              <p className="text-xl font-bold text-amber-900">
                {(course?.xp_available ?? 0).toLocaleString("es-CL")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Catálogo */}
      <section>
        <h2 className="text-muted-foreground mb-3 text-sm font-medium">
          Catálogo de premios
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rewards.map((r) => {
            const tier = REWARD_TIERS[r.tier]
            const affordable = (course?.xp_available ?? 0) >= r.xp_cost
            return (
              <Card key={r.id} className={cn(!affordable && "opacity-70")}>
                <CardContent className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
                      <Gift className="size-5" />
                    </div>
                    <Badge className={cn("border-0", tier.color)}>
                      {tier.label}
                    </Badge>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{r.name}</p>
                    {r.description && (
                      <p className="text-muted-foreground text-sm">
                        {r.description}
                      </p>
                    )}
                    {r.monthly_limit && (
                      <p className="text-muted-foreground mt-1 text-xs">
                        Máximo {r.monthly_limit} al mes por curso
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 font-bold text-amber-600">
                      <Zap className="size-4" />
                      {r.xp_cost.toLocaleString("es-CL")} XP
                    </span>
                    <Button
                      size="sm"
                      disabled={!affordable || pending || !course}
                      onClick={() => handleRequest(r)}
                    >
                      Canjear
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      {/* Pendientes */}
      {pendings.length > 0 && (
        <section>
          <h2 className="text-muted-foreground mb-3 text-sm font-medium">
            Solicitudes pendientes {canDecide ? "· aprueba o rechaza" : ""}
          </h2>
          <div className="divide-y rounded-xl border bg-white">
            {pendings.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div>
                  <p className="font-medium">
                    {r.course_name} · {r.reward_name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {r.xp_spent} XP · solicitado por{" "}
                    {r.requested_by_name ?? "—"} ·{" "}
                    {new Date(r.created_at).toLocaleDateString("es-CL", {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </div>
                {canDecide ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => handleDecide(r, true)}
                    >
                      {pending ? (
                        <Loader2 className="mr-1 size-3.5 animate-spin" />
                      ) : (
                        <Check className="mr-1 size-3.5" />
                      )}
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => handleDecide(r, false)}
                    >
                      <X className="mr-1 size-3.5" /> Rechazar
                    </Button>
                  </div>
                ) : (
                  <Badge variant="secondary">Pendiente</Badge>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Historial */}
      <section>
        <h2 className="text-muted-foreground mb-3 text-sm font-medium">
          Historial
        </h2>
        {history.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed bg-white px-5 py-8 text-center text-sm">
            Aún no hay canjes procesados.
          </p>
        ) : (
          <div className="divide-y rounded-xl border bg-white">
            {history.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div>
                  <p className="font-medium">
                    {r.course_name} · {r.reward_name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {r.xp_spent} XP ·{" "}
                    {new Date(r.created_at).toLocaleDateString("es-CL", {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </div>
                <Badge
                  className={cn(
                    "border-0",
                    r.status === "aprobado" || r.status === "entregado"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-red-100 text-red-700"
                  )}
                >
                  {REDEMPTION_STATUS_LABELS[r.status] ?? r.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
