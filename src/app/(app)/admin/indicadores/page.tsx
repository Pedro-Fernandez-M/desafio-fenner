import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { requireAccess } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/layout/page-header"
import {
  IndicatorsManager,
  type AreaGroup,
} from "@/components/admin/indicators-manager"

export const metadata = { title: "Indicadores · Desafío Fenner" }

export default async function IndicadoresPage() {
  await requireAccess("admin")
  const supabase = await createClient()

  const { data: areasRaw } = await supabase
    .from("areas")
    .select(
      "id, name, order_index, indicators(id, name, assigned_group, order_index, active)"
    )
    .order("order_index")

  type Raw = {
    id: string
    name: string
    order_index: number
    indicators: {
      id: string
      name: string
      assigned_group: "profesores" | "convivencia"
      order_index: number
      active: boolean
    }[]
  }

  const areas: AreaGroup[] = ((areasRaw ?? []) as unknown as Raw[])
    .map((a) => ({
      id: a.id,
      name: a.name,
      indicators: a.indicators
        .filter((i) => i.active)
        .sort((x, y) => x.order_index - y.order_index)
        .map((i) => ({
          id: i.id,
          name: i.name,
          assigned_group: i.assigned_group,
        })),
    }))
    .filter((a) => a.indicators.length > 0)

  return (
    <>
      <Link
        href="/admin"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> Administración
      </Link>
      <PageHeader
        title="Indicadores"
        description="Define qué indicadores registra cada grupo. Los cambios aplican de inmediato en la pantalla de registro."
      />
      <IndicatorsManager areas={areas} />
    </>
  )
}
