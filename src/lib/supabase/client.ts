import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "@/lib/database.types"

/**
 * Cliente de Supabase para componentes cliente ("use client").
 * Usa la anon key pública; la autorización real vive en las políticas RLS.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
