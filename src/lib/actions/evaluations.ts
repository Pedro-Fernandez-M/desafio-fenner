"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export type EvaluationScoreInput = { indicator_id: string; level: number }

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

/**
 * Registra (o corrige) la pauta de UNA clase / un día. Los puntos NO se suman
 * directo: el RPC recalcula el promedio semanal por indicador y publica solo
 * el delta en el ledger interno. El ranking público se publica los viernes.
 */
export async function submitClassEvaluation(input: {
  courseId: string
  classDate: string
  block?: number | null
  subject?: string | null
  scores: EvaluationScoreInput[]
  note?: string | null
}): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "No autenticado." }

  if (input.scores.length === 0) {
    return { ok: false, error: "Registra al menos un indicador." }
  }

  const { data, error } = await supabase.rpc("submit_class_evaluation", {
    p_course_id: input.courseId,
    p_class_date: input.classDate,
    p_scores: input.scores,
    p_block: input.block ?? null,
    p_subject: input.subject?.trim() || null,
    p_note: input.note?.trim() || null,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath("/ranking")
  revalidatePath("/")
  return { ok: true, id: data as string }
}
