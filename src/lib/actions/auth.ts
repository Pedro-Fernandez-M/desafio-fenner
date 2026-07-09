"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export type AuthResult = { error: string } | void

export async function signIn(
  email: string,
  password: string
): Promise<AuthResult> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: mapAuthError(error.message) }
  }
  revalidatePath("/", "layout")
  redirect("/")
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath("/", "layout")
  redirect("/login")
}

function mapAuthError(message: string): string {
  if (message.includes("Invalid login credentials")) {
    return "Correo o contraseña incorrectos."
  }
  if (message.includes("Email not confirmed")) {
    return "Debes confirmar tu correo antes de ingresar."
  }
  return message
}
