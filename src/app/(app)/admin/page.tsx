import Link from "next/link"
import { Users, ListChecks, ArrowRight, Gift, School } from "lucide-react"

import { requireAccess } from "@/lib/auth"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const SECTIONS = [
  {
    href: "/admin/usuarios",
    icon: Users,
    title: "Usuarios",
    description: "Crear cuentas de profesores y convivencia, roles y accesos.",
    ready: true,
  },
  {
    href: "/admin/indicadores",
    icon: ListChecks,
    title: "Indicadores",
    description: "Asignar cada indicador al grupo Profesores o Convivencia.",
    ready: true,
  },
  {
    href: "/admin",
    icon: School,
    title: "Cursos y semestres",
    description: "Próximamente (Etapa 7).",
    ready: false,
  },
  {
    href: "/admin",
    icon: Gift,
    title: "Premios y penalizaciones",
    description: "Próximamente (Etapas 5–7).",
    ready: false,
  },
]

export default async function AdminPage() {
  await requireAccess("admin")

  return (
    <>
      <PageHeader
        title="Administración"
        description="Gestión del sistema Desafío Fenner."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => {
          const Icon = s.icon
          const card = (
            <Card
              className={
                s.ready ? "h-full transition-shadow hover:shadow-md" : "h-full opacity-60"
              }
            >
              <CardContent className="flex items-start gap-4">
                <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold">
                    {s.title}
                    {s.ready ? (
                      <ArrowRight className="size-4" />
                    ) : (
                      <Badge variant="secondary">Pronto</Badge>
                    )}
                  </p>
                  <p className="text-muted-foreground text-sm">{s.description}</p>
                </div>
              </CardContent>
            </Card>
          )
          return s.ready ? (
            <Link key={s.title} href={s.href}>
              {card}
            </Link>
          ) : (
            <div key={s.title}>{card}</div>
          )
        })}
      </div>
    </>
  )
}
