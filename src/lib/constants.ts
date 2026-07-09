export const ROLES = [
  "administrador",
  "profesor",
  "convivencia",
  "inspectoria",
  "residencia",
  "direccion",
] as const

export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  administrador: "Administrador",
  profesor: "Profesor",
  convivencia: "Convivencia Escolar",
  inspectoria: "Inspectoría",
  residencia: "Residencia",
  direccion: "Dirección",
}

/** Niveles de logro y su equivalencia en puntos/XP. */
export const LEVELS = [
  { level: 0, label: "Insuficiente", points: 0, color: "text-red-600" },
  { level: 1, label: "Suficiente", points: 10, color: "text-amber-600" },
  { level: 2, label: "Bueno", points: 20, color: "text-blue-600" },
  { level: 3, label: "Excelente", points: 30, color: "text-emerald-600" },
] as const

export function pointsForLevel(level: number): number {
  return { 0: 0, 1: 10, 2: 20, 3: 30 }[level as 0 | 1 | 2 | 3] ?? 0
}

export const REWARD_TIERS = {
  basico: { label: "Básico", color: "bg-slate-100 text-slate-700" },
  medio: { label: "Medio", color: "bg-blue-100 text-blue-700" },
  avanzado: { label: "Avanzado", color: "bg-violet-100 text-violet-700" },
  alto: { label: "Alto / Máximo", color: "bg-amber-100 text-amber-800" },
} as const

export const SCORE_EVENT_LABELS: Record<string, string> = {
  evaluacion: "Evaluación",
  bonus: "Bono",
  penalizacion: "Penalización",
  reciclaje: "Reciclaje",
  canje: "Canje",
  ajuste: "Ajuste",
}

export const REDEMPTION_STATUS_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  entregado: "Entregado",
}

/**
 * Módulos accesibles por rol. Fuente única para la navegación y para el
 * gating en el frontend (la autorización dura vive en RLS/RPC).
 */
export type NavKey =
  | "dashboard"
  | "ranking"
  | "historial"
  | "evaluar"
  | "canjes"
  | "bonos"
  | "penalizaciones"
  | "reciclaje"
  | "admin"

export const NAV_ACCESS: Record<NavKey, Role[]> = {
  dashboard: [...ROLES],
  ranking: [...ROLES],
  historial: [...ROLES],
  evaluar: ["administrador", "profesor", "convivencia", "inspectoria", "residencia"],
  canjes: ["administrador", "convivencia", "direccion", "profesor"],
  bonos: ["administrador", "direccion"],
  penalizaciones: ["administrador", "inspectoria", "convivencia", "residencia", "direccion"],
  reciclaje: ["administrador", "inspectoria", "convivencia", "profesor", "direccion"],
  admin: ["administrador"],
}

export function canAccess(key: NavKey, role: Role | null | undefined): boolean {
  if (!role) return false
  return NAV_ACCESS[key].includes(role)
}

export type IndicatorGroup = "profesores" | "convivencia"

export const GROUP_LABELS: Record<IndicatorGroup, string> = {
  profesores: "Profesores",
  convivencia: "Convivencia Escolar",
}

/**
 * Grupo de registro que corresponde a cada rol.
 * El administrador registra en cualquiera (null = ambos).
 */
export function groupForRole(role: Role): IndicatorGroup | null {
  if (role === "profesor") return "profesores"
  if (
    role === "convivencia" ||
    role === "inspectoria" ||
    role === "residencia" ||
    role === "direccion"
  ) {
    return "convivencia"
  }
  return null
}

export const RECYCLING_MATERIALS = [
  "carton",
  "papel",
  "aluminio",
  "pet",
  "colun",
] as const

export const MATERIAL_LABELS: Record<string, string> = {
  carton: "Cartón",
  papel: "Papel",
  aluminio: "Aluminio",
  pet: "PET",
  colun: "Colun (potes)",
}
