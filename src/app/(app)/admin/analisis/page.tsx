import { requireAccess, getActiveSemester } from "@/lib/auth"
import { buildImpactAnalysis } from "@/lib/analytics"
import { PageHeader } from "@/components/layout/page-header"
import { ImpactDashboard } from "@/components/analytics/impact-dashboard"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

export const metadata = { title: "Análisis de impacto · Desafío Fenner" }

export default async function AnalisisPage() {
  await requireAccess("analisis")
  const semester = await getActiveSemester()

  if (!semester) {
    return (
      <>
        <PageHeader title="Análisis de impacto" />
        <Alert>
          <AlertCircle className="size-4" />
          <AlertTitle>Sin semestre activo</AlertTitle>
          <AlertDescription>No hay un semestre activo configurado.</AlertDescription>
        </Alert>
      </>
    )
  }

  const data = await buildImpactAnalysis(
    semester.id,
    semester.name,
    semester.start_date
  )

  return (
    <>
      <PageHeader
        title="Análisis de impacto"
        description={`¿Mejoró el comportamiento con el Desafío Fenner? · ${semester.name}. Mide la evolución del nivel de logro (0–3) por curso y factor, y las penalizaciones semana a semana.`}
      />
      <ImpactDashboard data={data} />
    </>
  )
}
