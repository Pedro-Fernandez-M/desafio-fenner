import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { Tables } from "@/lib/database.types"
import { canAccess, type NavKey } from "@/lib/constants"

export type Profile = Tables<"profiles">

/** Perfil del usuario autenticado, o null si no hay sesión. */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()

  if (data) return data

  // Self-heal: si el trigger de auth.users no está disponible, creamos el
  // perfil en el primer acceso (rol por defecto: profesor).
  const fullName =
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "Usuario"

  const { data: created } = await supabase
    .from("profiles")
    .insert({ id: user.id, full_name: fullName, email: user.email ?? null })
    .select("*")
    .maybeSingle()

  return created ?? null
}

/** Igual que getProfile pero redirige a /login si no hay sesión. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  return profile
}

/**
 * Requiere sesión y que el rol tenga acceso al módulo. Redirige a "/" si el rol
 * no está autorizado (la autorización dura vive además en RLS/RPC).
 */
export async function requireAccess(key: NavKey): Promise<Profile> {
  const profile = await requireProfile()
  if (!canAccess(key, profile.role, profile.allowed_modules)) redirect("/")
  return profile
}

/** Semestre activo (o null). */
export async function getActiveSemester() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("semesters")
    .select("*")
    .eq("active", true)
    .maybeSingle()
  return data ?? null
}
