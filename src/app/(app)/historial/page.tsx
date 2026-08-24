import { requireAccess } from "@/lib/auth"
import { PageHeader } from "@/components/layout/page-header"
import { HistoryFeed } from "@/components/history/history-feed"
import { HistorialExport } from "@/components/history/historial-export"

export const metadata = { title: "Historial · Desafío Fenner" }

export default async function HistorialPage() {
  const profile = await requireAccess("historial")
  const isAdmin = profile.role === "administrador"

  return (
    <>
      <PageHeader
        title="Historial"
        description={
          isAdmin
            ? "Todas las modificaciones con nombre, curso y hora. Como administrador puedes eliminar registros erróneos."
            : "Todas las modificaciones quedan registradas con nombre, materia, curso y hora — transparencia total."
        }
        action={<HistorialExport />}
      />
      <HistoryFeed isAdmin={isAdmin} />
    </>
  )
}
