import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"

/**
 * Pantalla que reemplaza los formularios de registro cuando el Desafío ya
 * terminó. El bloqueo efectivo de escritura vive en la base de datos.
 */
export function ChallengeClosed({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card className="border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="text-6xl">🏁</div>
          <h2 className="text-3xl font-black text-blue-900">
            ¡Desafío terminado!
          </h2>
          <p className="text-muted-foreground max-w-md text-balance">
            El Desafío Fenner finalizó y el puntaje quedó congelado. Ya no es
            posible ingresar nuevos registros. ¡Gracias a todos por participar!
            🎉
          </p>
          <p className="text-sm font-semibold text-blue-700">
            🏆 Curso campeón: 2°D — revisa el resultado final en el marcador.
          </p>
        </CardContent>
      </Card>
    </>
  )
}
