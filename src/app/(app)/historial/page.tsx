import { requireAccess } from "@/lib/auth"
import { PageHeader } from "@/components/layout/page-header"
import { HistoryFeed } from "@/components/history/history-feed"

export const metadata = { title: "Historial · Desafío Fenner" }

export default async function HistorialPage() {
  await requireAccess("historial")

  return (
    <>
      <PageHeader
        title="Historial"
        description="Todas las modificaciones quedan registradas con nombre, materia, curso y hora — transparencia total."
      />
      <HistoryFeed />
    </>
  )
}
