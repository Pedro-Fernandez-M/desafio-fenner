"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Megaphone } from "lucide-react"

import { publishRanking } from "@/lib/actions/admin"
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

  return (
    <Button onClick={handlePublish} disabled={pending}>
      {pending ? (
        <Loader2 className="mr-2 size-4 animate-spin" />
      ) : (
        <Megaphone className="mr-2 size-4" />
      )}
      Publicar ahora
    </Button>
  )
}
