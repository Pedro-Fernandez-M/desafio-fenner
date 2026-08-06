"use client"

import { useState } from "react"
import Link from "next/link"
import { Menu } from "lucide-react"

import type { Role } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import { UserMenu } from "@/components/layout/user-menu"
import { SignOutButton } from "@/components/layout/sign-out-button"

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <div className="grid size-9 place-items-center rounded-lg bg-blue-600 text-sm font-bold text-white">
        DF
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold tracking-tight">Desafío Fenner</p>
        <p className="text-muted-foreground text-[11px]">Liceo R. Fenner</p>
      </div>
    </Link>
  )
}

export function AppShell({
  fullName,
  role,
  photoUrl,
  allowedModules,
  children,
}: {
  fullName: string
  role: Role
  photoUrl: string | null
  allowedModules?: string[] | null
  children: React.ReactNode
}) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar fijo (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-white px-4 py-5 lg:flex">
        <div className="px-2">
          <Brand />
        </div>
        <div className="mt-8 flex-1 overflow-y-auto">
          <SidebarNav role={role} allowedModules={allowedModules} />
        </div>
        <p className="text-muted-foreground px-2 text-[11px]">
          © {new Date().getFullYear()} Desafío Fenner
        </p>
      </aside>

      {/* Drawer (mobile) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Menú</SheetTitle>
          <div className="px-4 py-5">
            <Brand />
            <div className="mt-8">
              <SidebarNav role={role} allowedModules={allowedModules} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Contenido */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b bg-white/80 px-4 backdrop-blur-sm sm:px-6">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu className="size-5" />
            </Button>
            <div className="lg:hidden">
              <Brand />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <UserMenu fullName={fullName} role={role} photoUrl={photoUrl} />
            <SignOutButton />
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
