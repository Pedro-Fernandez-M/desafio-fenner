"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Megaphone, CalendarSync } from "lucide-react"

import { publishRanking, consolidateClasses } from "@/lib/actions/admin"
import { Button } from "@/components/ui/button"

export function PublishButton() {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function handlePublish() {
    startTransition(async () => {
      const res = await publishRanking()
      if (res.ok) {
        toast.success("Ranking publicado. Ya es visible para todos.")
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  function handleConsolidate() {
    startTransition(async () => {
      const res = await consolidateClasses()
      if (res.ok) {
        toast.success(
          res.count > 0
            ? `Clases consolidadas (${res.count} semana(s) de curso).`
            : "No había clases pendientes por consolidar."
        )
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        onClick={handleConsolidate}
        disabled={pending}
        title="Aplica el promedio de las clases de los profesores (automático los viernes)"
      >
        {pending ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <CalendarSync className="mr-2 size-4" />
        )}
        Consolidar clases
      </Button>
      <Button onClick={handlePublish} disabled={pending}>
        {pending ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <Megaphone className="mr-2 size-4" />
        )}
        Publicar ahora
      </Button>
    </div>
  )
}
