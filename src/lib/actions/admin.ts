"use server"

import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireProfile } from "@/lib/auth"
import type { Role, IndicatorGroup } from "@/lib/constants"

type Result = { ok: true } | { ok: false; error: string }

async function requireAdmin(): Promise<{ ok: false; error: string } | null> {
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

const POINTS: Record<number, number> = { 0: 0, 1: 10, 2: 20, 3: 30 }

/**
 * Elimina un registro erróneo y revierte su efecto en el puntaje. Se hace con
 * el cliente service-role (solo admin), insertando un ajuste compensatorio para
 * que course_standings se corrija por el trigger.
 */
export async function undoRecord(
  table: string,
  id: string
): Promise<Result> {
  const guard = await requireAdmin()
  if (guard) return guard
  if (!hasServiceKey()) {
    return {
      ok: false,
      error: "Falta SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor.",
    }
  }

  const admin = createAdminClient()

  const EVENT_TABLES = ["penalties", "bonuses", "recycling_records", "redemptions"]

  if (EVENT_TABLES.includes(table)) {
    // Las 4 tablas comparten columnas id/course_id/semester_id.
    const t = table as "penalties"
    const { data: src } = await admin
      .from(t)
      .select("course_id, semester_id")
      .eq("id", id)
      .maybeSingle()
    if (!src) return { ok: false, error: "Registro no encontrado." }

    const { data: evs } = await admin
      .from("score_events")
      .select("general_delta, xp_delta")
      .eq("reference_table", table)
      .eq("reference_id", id)
    const gen = (evs ?? []).reduce((s, e) => s + e.general_delta, 0)
    const xp = (evs ?? []).reduce((s, e) => s + e.xp_delta, 0)

    if (gen !== 0 || xp !== 0) {
      await admin.from("score_events").insert({
        course_id: src.course_id,
        semester_id: src.semester_id,
        type: "ajuste",
        general_delta: -gen,
        xp_delta: -xp,
        description: "Anulación de registro",
      })
    }
    await admin.from(t).delete().eq("id", id)
  } else if (table === "class_evaluations") {
    const { data: ce } = await admin
      .from("class_evaluations")
      .select("course_id, semester_id, week_number")
      .eq("id", id)
      .maybeSingle()
    if (!ce) return { ok: false, error: "Registro no encontrado." }

    await admin.from("class_evaluation_scores").delete().eq("class_evaluation_id", id)
    await admin.from("class_evaluations").delete().eq("id", id)

    // Recomputar promedio por indicador de la semana
    const { data: evals } = await admin
      .from("class_evaluations")
      .select("id")
      .eq("course_id", ce.course_id)
      .eq("semester_id", ce.semester_id)
      .eq("week_number", ce.week_number)
    const evalIds = (evals ?? []).map((e) => e.id)

    const { data: inds } = await admin
      .from("indicators")
      .select("id, assigned_group")
    const groupOf = new Map(
      (inds ?? []).map((i) => [i.id, i.assigned_group as string])
    )

    let tt = 0
    let ct = 0
    if (evalIds.length > 0) {
      const { data: scores } = await admin
        .from("class_evaluation_scores")
        .select("indicator_id, level")
        .in("class_evaluation_id", evalIds)
      const byInd = new Map<string, number[]>()
      for (const s of scores ?? []) {
        if (!byInd.has(s.indicator_id)) byInd.set(s.indicator_id, [])
        byInd.get(s.indicator_id)!.push(s.level)
      }
      for (const [indId, levels] of byInd) {
        const avg = levels.reduce((a, b) => a + b, 0) / levels.length
        const pts = POINTS[Math.round(avg)] ?? 0
        if (groupOf.get(indId) === "profesores") tt += pts
        else ct += pts
      }
    }

    const { data: cwt } = await admin
      .from("class_week_totals")
      .select("conviv_posted, teacher_consolidated")
      .eq("course_id", ce.course_id)
      .eq("semester_id", ce.semester_id)
      .eq("week_number", ce.week_number)
      .maybeSingle()
    if (!cwt) {
      revalidatePath("/historial")
      revalidatePath("/ranking")
      return { ok: true }
    }

    const convivDelta = ct - cwt.conviv_posted
    if (convivDelta !== 0) {
      await admin.from("score_events").insert({
        course_id: ce.course_id,
        semester_id: ce.semester_id,
        type: "evaluacion",
        general_delta: convivDelta * 2,
        xp_delta: convivDelta,
        description: "Ajuste convivencia (anulación)",
      })
    }
    const teacherDelta = tt - cwt.teacher_consolidated
    if (cwt.teacher_consolidated !== 0 && teacherDelta !== 0) {
      await admin.from("score_events").insert({
        course_id: ce.course_id,
        semester_id: ce.semester_id,
        type: "evaluacion",
        general_delta: teacherDelta * 2,
        xp_delta: teacherDelta,
        description: "Ajuste clases (anulación)",
      })
    }
    await admin
      .from("class_week_totals")
      .update({
        teacher_points: tt,
        conviv_points: ct,
        conviv_posted: ct,
        teacher_consolidated:
          cwt.teacher_consolidated !== 0 ? tt : cwt.teacher_consolidated,
        total_points: tt + ct,
      })
      .eq("course_id", ce.course_id)
      .eq("semester_id", ce.semester_id)
      .eq("week_number", ce.week_number)
  } else {
    return { ok: false, error: "Tipo de registro no soportado." }
  }

  revalidatePath("/historial")
  revalidatePath("/ranking")
  return { ok: true }
}

/** Consolida el promedio de clases de profesores (se automatiza los viernes). */
export async function consolidateClasses(): Promise<
  { ok: true; count: number } | { ok: false; error: string }
> {
  const guard = await requireAdmin()
  if (guard) return guard

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("consolidate_class_scores")
  if (error) return { ok: false, error: error.message }

  revalidatePath("/ranking")
  return { ok: true, count: (data as number) ?? 0 }
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
