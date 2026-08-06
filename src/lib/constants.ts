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

/**
 * Niveles de logro. Cada nivel entrega XP (canjeable) y el DOBLE en
 * Puntaje General (ranking): 1 = 10/20 · 2 = 20/40 · 3 = 30/60.
 */
export const LEVELS = [
  { level: 0, label: "Insuficiente", xp: 0, general: 0, color: "text-red-600" },
  { level: 1, label: "Suficiente", xp: 10, general: 20, color: "text-amber-600" },
  { level: 2, label: "Bueno", xp: 20, general: 40, color: "text-blue-600" },
  { level: 3, label: "Excelente", xp: 30, general: 60, color: "text-emerald-600" },
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

/**
 * Acceso por rol. Los PROFESORES solo registran sus clases: no ven ranking,
 * historial, faltas ni canjes (el ranking público vive en /puntajes y
 * /en-vivo). Convivencia tampoco ve el ranking interno. Admin ve todo.
 */
export const NAV_ACCESS: Record<NavKey, Role[]> = {
  dashboard: [...ROLES],
  ranking: ["administrador", "direccion"],
  historial: ["administrador", "convivencia", "inspectoria", "residencia", "direccion"],
  evaluar: ["administrador", "profesor", "convivencia", "inspectoria", "residencia"],
  canjes: ["administrador", "convivencia", "direccion"],
  bonos: ["administrador", "direccion"],
  penalizaciones: ["administrador", "inspectoria", "convivencia", "residencia", "direccion"],
  reciclaje: ["administrador", "inspectoria", "convivencia", "direccion"],
  admin: ["administrador"],
}

/**
 * Acceso a un módulo. Si el perfil tiene `allowedModules` definido, esa lista
 * manda (puede ampliar o restringir respecto del rol). Si no, se usa el rol.
 */
export function canAccess(
  key: NavKey,
  role: Role | null | undefined,
  allowedModules?: string[] | null
): boolean {
  if (!role) return false
  if (allowedModules && allowedModules.length > 0) {
    return allowedModules.includes(key)
  }
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
  colun: "Envases de yogurt",
}
