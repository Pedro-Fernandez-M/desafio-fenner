"use client"

import { useTransition } from "react"
import { LogOut, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { signOut } from "@/lib/actions/auth"
import { Button } from "@/components/ui/button"

export function SignOutButton() {
  const [pending, startTransition] = useTransition()

  function handleSignOut() {
    startTransition(async () => {
      try {
        await signOut()
      } catch {
        toast.error("No se pudo cerrar la sesión.")
      }
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSignOut}
      disabled={pending}
      className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <LogOut className="size-4" />
      )}
      <span className="hidden sm:inline">Cerrar sesión</span>
    </Button>
  )
}
