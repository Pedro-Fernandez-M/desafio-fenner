import {
  LayoutDashboard,
  Trophy,
  History,
  ClipboardCheck,
  Gift,
  Sparkles,
  MinusCircle,
  Recycle,
  Settings,
  type LucideIcon,
} from "lucide-react"
import { NAV_ACCESS, type NavKey, type Role } from "@/lib/constants"

export type NavItem = {
  key: NavKey
  label: string
  href: string
  icon: LucideIcon
  description: string
}

export const NAV_ITEMS: NavItem[] = [
  {
    key: "dashboard",
    label: "Inicio",
    href: "/",
    icon: LayoutDashboard,
    description: "Resumen general",
  },
  {
    key: "ranking",
    label: "Ranking",
    href: "/ranking",
    icon: Trophy,
    description: "Posiciones de los cursos",
  },
  {
    key: "historial",
    label: "Historial",
    href: "/historial",
    icon: History,
    description: "Últimas modificaciones en vivo",
  },
  {
    key: "evaluar",
    label: "Registrar",
    href: "/evaluar",
    icon: ClipboardCheck,
    description: "Registro diario por clase",
  },
  {
    key: "canjes",
    label: "Canjes",
    href: "/canjes",
    icon: Gift,
    description: "Premios y canjes con XP",
  },
  {
    key: "bonos",
    label: "Bonos",
    href: "/bonos",
    icon: Sparkles,
    description: "Bonificaciones académicas",
  },
  {
    key: "penalizaciones",
    label: "Penalizaciones",
    href: "/penalizaciones",
    icon: MinusCircle,
    description: "Descuentos de puntaje",
  },
  {
    key: "reciclaje",
    label: "Reciclaje",
    href: "/reciclaje",
    icon: Recycle,
    description: "Bonus semanal de reciclaje",
  },
  {
    key: "admin",
    label: "Administración",
    href: "/admin",
    icon: Settings,
    description: "Gestión del sistema",
  },
]

/** Items de navegación visibles para un rol. */
export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => NAV_ACCESS[item.key].includes(role))
}

/**
 * Items visibles considerando `allowedModules` del perfil (si está definido,
 * manda sobre el rol).
 */
export function navItemsFor(
  role: Role,
  allowedModules?: string[] | null
): NavItem[] {
  if (allowedModules && allowedModules.length > 0) {
    return NAV_ITEMS.filter((item) => allowedModules.includes(item.key))
  }
  return navItemsForRole(role)
}
