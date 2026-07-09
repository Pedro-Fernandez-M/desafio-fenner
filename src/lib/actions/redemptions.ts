"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

type Result = { ok: true } | { ok: false; error: string }

/** Solicita un canje. El RPC valida XP disponible y tope mensual. */
export async function requestRedemption(input: {
  courseId: string
  rewardId: string
  note?: string | null
}): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc("request_redemption", {
    p_course_id: input.courseId,
    p_reward_id: input.rewardId,
    p_note: input.note?.trim() || null,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath("/canjes")
  return { ok: true }
}

/** Aprueba o rechaza un canje pendiente (admin / convivencia / dirección). */
export async function decideRedemption(
  redemptionId: string,
  approve: boolean
): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc("decide_redemption", {
    p_redemption_id: redemptionId,
    p_approve: approve,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath("/canjes")
  revalidatePath("/ranking")
  return { ok: true }
}
