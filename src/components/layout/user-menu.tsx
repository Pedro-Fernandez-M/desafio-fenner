"use client"

import { useTransition } from "react"
import { LogOut, User } from "lucide-react"
import { toast } from "sonner"

import { signOut } from "@/lib/actions/auth"
import { ROLE_LABELS, type Role } from "@/lib/constants"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function UserMenu({
  fullName,
  role,
  photoUrl,
}: {
  fullName: string
  role: Role
  photoUrl: string | null
}) {
  const [pending, startTransition] = useTransition()

  const initials = fullName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

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
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-3 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        <Avatar className="size-9 border">
          {photoUrl && <AvatarImage src={photoUrl} alt={fullName} />}
          <AvatarFallback className="bg-blue-100 text-sm font-medium text-blue-700">
            {initials || <User className="size-4" />}
          </AvatarFallback>
        </Avatar>
        <div className="hidden text-left sm:block">
          <p className="text-sm leading-tight font-medium">{fullName}</p>
          <p className="text-muted-foreground text-xs leading-tight">
            {ROLE_LABELS[role]}
          </p>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <p className="font-medium">{fullName}</p>
          <p className="text-muted-foreground text-xs font-normal">
            {ROLE_LABELS[role]}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending}
          onSelect={(e) => {
            e.preventDefault()
            handleSignOut()
          }}
          className="text-red-600 focus:text-red-600"
        >
          <LogOut className="mr-2 size-4" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
