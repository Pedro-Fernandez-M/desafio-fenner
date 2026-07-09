import { requireAccess, getActiveSemester } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/layout/page-header"
import {
  RedemptionsManager,
  type RewardItem,
  type CourseWallet,
  type RedemptionItem,
} from "@/components/redemptions/redemptions-manager"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

export const metadata = { title: "Canjes · Desafío Fenner" }

export default async function CanjesPage() {
  const profile = await requireAccess("canjes")
  const semester = await getActiveSemester()
  const supabase = await createClient()

  if (!semester) {
    return (
      <>
        <PageHeader title="Canjes" />
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

  const [
    { data: rewards },
    { data: courses },
    { data: standings },
    { data: redemptionsRaw },
  ] = await Promise.all([
    supabase
      .from("rewards")
      .select("id, name, description, tier, xp_cost, monthly_limit")
      .eq("active", true)
      .order("xp_cost"),
    supabase.from("courses").select("id, name").eq("active", true).order("name"),
    supabase
      .from("course_standings")
      .select("course_id, xp_available")
      .eq("semester_id", semester.id),
    supabase
      .from("redemptions")
      .select(
        "id, status, xp_spent, created_at, courses(name), rewards(name), requester:profiles!redemptions_requested_by_fkey(full_name)"
      )
      .eq("semester_id", semester.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ])

  const xpByCourse = new Map(
    (standings ?? []).map((s) => [s.course_id, s.xp_available])
  )
  const wallets: CourseWallet[] = (courses ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    xp_available: xpByCourse.get(c.id) ?? 0,
  }))

  type RedRaw = {
    id: string
    status: string
    xp_spent: number
    created_at: string
    courses: { name: string } | null
    rewards: { name: string } | null
    requester: { full_name: string } | null
  }
  const redemptions: RedemptionItem[] = (
    (redemptionsRaw ?? []) as unknown as RedRaw[]
  ).map((r) => ({
    id: r.id,
    status: r.status,
    xp_spent: r.xp_spent,
    created_at: r.created_at,
    course_name: r.courses?.name ?? "—",
    reward_name: r.rewards?.name ?? "—",
    requested_by_name: r.requester?.full_name ?? null,
  }))

  const canDecide = ["administrador", "convivencia", "direccion"].includes(
    profile.role
  )

  return (
    <>
      <PageHeader
        title="Canjes"
        description="Los cursos canjean sus Puntos Fenner (XP) por premios. El Puntaje General del ranking no se gasta."
      />
      <RedemptionsManager
        rewards={(rewards ?? []) as RewardItem[]}
        courses={wallets}
        redemptions={redemptions}
        canDecide={canDecide}
      />
    </>
  )
}
