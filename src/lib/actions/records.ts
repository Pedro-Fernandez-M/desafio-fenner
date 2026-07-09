"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

type Result = { ok: true } | { ok: false; error: string }

async function activeSemester() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("semesters")
    .select("id, start_date")
    .eq("active", true)
    .maybeSingle()
  return data
}

/**
 * Aplica una penalización (descuento INMEDIATO al Puntaje General).
 * El trigger penalties_ledger publica el evento en el ledger al instante.
 */
export async function addPenalty(input: {
  courseId: string
  catalogId: string | null
  points: number // negativo
  studentName?: string | null
  description?: string | null
}): Promise<Result> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "No autenticado." }

  const sem = await activeSemester()
  if (!sem) return { ok: false, error: "No hay semestre activo." }

  if (!Number.isInteger(input.points) || input.points >= 0) {
    return { ok: false, error: "El descuento debe ser un número negativo." }
  }

  const { error } = await supabase.from("penalties").insert({
    course_id: input.courseId,
    semester_id: sem.id,
    catalog_id: input.catalogId,
    points: input.points,
    student_name: input.studentName?.trim() || null,
    description: input.description?.trim() || null,
    applied_by: user.id,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath("/penalizaciones")
  revalidatePath("/ranking")
  return { ok: true }
}

/** Aplica un bono al Puntaje General (admin / dirección). */
export async function addBonus(input: {
  courseId: string
  kind: string
  points: number // positivo
  description?: string | null
}): Promise<Result> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "No autenticado." }

  const sem = await activeSemester()
  if (!sem) return { ok: false, error: "No hay semestre activo." }

  if (!Number.isInteger(input.points) || input.points <= 0) {
    return { ok: false, error: "El bono debe ser un número positivo." }
  }

  const { error } = await supabase.from("bonuses").insert({
    course_id: input.courseId,
    semester_id: sem.id,
    kind: input.kind,
    points: input.points,
    description: input.description?.trim() || null,
    applied_by: user.id,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath("/bonos")
  revalidatePath("/ranking")
  return { ok: true }
}

/**
 * Registra reciclaje semanal: 30 pts por kilo ENTERO de un material único
 * (mínimo 1 kg). El trigger calcula los puntos y publica al ledger.
 */
export async function addRecycling(input: {
  courseId: string
  material: string
  kilos: number
  recordDate: string
}): Promise<Result> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "No autenticado." }

  const sem = await activeSemester()
  if (!sem) return { ok: false, error: "No hay semestre activo." }

  if (!(input.kilos > 0)) {
    return { ok: false, error: "Los kilos deben ser mayores a 0." }
  }

  const { data: week, error: wErr } = await supabase.rpc(
    "semester_week_number",
    { p_start: sem.start_date, p_date: input.recordDate }
  )
  if (wErr) return { ok: false, error: wErr.message }

  const { error } = await supabase.from("recycling_records").insert({
    course_id: input.courseId,
    semester_id: sem.id,
    week_number: week as number,
    record_date: input.recordDate,
    material: input.material,
    kilos: input.kilos,
    registered_by: user.id,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath("/reciclaje")
  revalidatePath("/ranking")
  return { ok: true }
}
