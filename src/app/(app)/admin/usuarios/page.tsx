import Link from "next/link"
import { ArrowLeft, AlertCircle } from "lucide-react"

import { requireAccess } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/layout/page-header"
import { UsersManager, type UserRow } from "@/components/admin/users-manager"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export const metadata = { title: "Usuarios · Desafío Fenner" }

export default async function UsuariosPage() {
  await requireAccess("admin")
  const supabase = await createClient()

  const { data: users } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, active")
    .order("full_name")

  const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)

  return (
    <>
      <Link
        href="/admin"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> Administración
      </Link>
      <PageHeader
        title="Usuarios"
        description="Crea las cuentas de profesores y convivencia, define roles y gestiona accesos."
      />
      {!hasServiceKey && (
        <Alert className="mb-4" variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Falta la service role key</AlertTitle>
          <AlertDescription>
            Para crear usuarios o cambiar claves agrega SUPABASE_SERVICE_ROLE_KEY
            en .env.local (Supabase → Settings → API → service_role) y reinicia
            el servidor. Cambiar rol o activar/desactivar sí funciona sin ella.
          </AlertDescription>
        </Alert>
      )}
      <UsersManager users={(users ?? []) as UserRow[]} />
    </>
  )
}
