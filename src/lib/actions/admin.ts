"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireProfile } from "@/lib/auth"
import type { Role, IndicatorGroup } from "@/lib/constants"

type Result = { ok: true } | { ok: false; error: string }

async function requireAdmin(): Promise<Result | null> {
  const profile = await requireProfile()
  if (profile.role !== "administrador") {
    return { ok: false, error: "Solo el administrador puede hacer esto." }
  }
  return null
}

function hasServiceKey(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
}

/** Convierte un nombre de usuario simple en correo (usuario → usuario@fenner.local). */
function normalizeEmail(input: string): string {
  const v = input.trim().toLowerCase()
  return v.includes("@") ? v : `${v}@fenner.local`
}

// ---------------------------------------------------------------------------
// Publicación del ranking
// ---------------------------------------------------------------------------
export async function publishRanking(): Promise<Result> {
  const guard = await requireAdmin()
  if (guard) return guard

  const supabase = await createClient()
  const { error } = await supabase.rpc("publish_ranking")
  if (error) return { ok: false, error: error.message }

  revalidatePath("/ranking")
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Gestión de usuarios (requiere SUPABASE_SERVICE_ROLE_KEY)
// ---------------------------------------------------------------------------
export async function createUser(input: {
  email: string
  password: string
  fullName: string
  role: Role
}): Promise<Result> {
  const guard = await requireAdmin()
  if (guard) return guard
  if (!hasServiceKey()) {
    return {
      ok: false,
      error:
        "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local (Settings → API → service_role).",
    }
  }
  if (input.password.length < 6) {
    return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." }
  }

  const email = normalizeEmail(input.email)
  const admin = createAdminClient()

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  })
  if (error) return { ok: false, error: error.message }

  // Crea/actualiza el perfil con el rol elegido (bypass RLS con service role).
  const { error: pErr } = await admin.from("profiles").upsert({
    id: data.user.id,
    full_name: input.fullName,
    email,
    role: input.role,
    active: true,
  })
  if (pErr) return { ok: false, error: pErr.message }

  revalidatePath("/admin/usuarios")
  return { ok: true }
}

export async function setUserRole(userId: string, role: Role): Promise<Result> {
  const guard = await requireAdmin()
  if (guard) return guard

  const supabase = await createClient()
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId)
  if (error) return { ok: false, error: error.message }

  revalidatePath("/admin/usuarios")
  return { ok: true }
}

export async function setUserActive(
  userId: string,
  active: boolean
): Promise<Result> {
  const guard = await requireAdmin()
  if (guard) return guard

  const supabase = await createClient()
  const { error } = await supabase
    .from("profiles")
    .update({ active })
    .eq("id", userId)
  if (error) return { ok: false, error: error.message }

  revalidatePath("/admin/usuarios")
  return { ok: true }
}

export async function resetUserPassword(
  userId: string,
  password: string
): Promise<Result> {
  const guard = await requireAdmin()
  if (guard) return guard
  if (!hasServiceKey()) {
    return {
      ok: false,
      error:
        "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local (Settings → API → service_role).",
    }
  }
  if (password.length < 6) {
    return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." }
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(userId, { password })
  if (error) return { ok: false, error: error.message }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Asignación de indicadores a grupos
// ---------------------------------------------------------------------------
export async function setIndicatorGroup(
  indicatorId: string,
  group: IndicatorGroup
): Promise<Result> {
  const guard = await requireAdmin()
  if (guard) return guard

  const supabase = await createClient()
  const { error } = await supabase
    .from("indicators")
    .update({ assigned_group: group })
    .eq("id", indicatorId)
  if (error) return { ok: false, error: error.message }

  revalidatePath("/admin/indicadores")
  revalidatePath("/evaluar")
  return { ok: true }
}
