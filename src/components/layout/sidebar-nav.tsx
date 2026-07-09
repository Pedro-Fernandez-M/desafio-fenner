"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { navItemsForRole } from "@/lib/nav"
import type { Role } from "@/lib/constants"

export function SidebarNav({
  role,
  onNavigate,
}: {
  role: Role
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const items = navItemsForRole(role)

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href)
        const Icon = item.icon
        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
