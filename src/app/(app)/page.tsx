import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { requireProfile, getActiveSemester } from "@/lib/auth"
import { ROLE_LABELS } from "@/lib/constants"
import { navItemsFor } from "@/lib/nav"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

export default async function DashboardPage() {
  const profile = await requireProfile()
  const semester = await getActiveSemester()
  const modules = navItemsFor(profile.role, profile.allowed_modules).filter(
    (m) => m.key !== "dashboard"
  )

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <Badge variant="secondary">{ROLE_LABELS[profile.role]}</Badge>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Hola, {profile.full_name.split(" ")[0]} 👋
        </h1>
        <p className="text-muted-foreground">
          {semester ? (
            <>
              Semestre activo:{" "}
              <span className="text-foreground font-medium">
                {semester.name}
              </span>{" "}
              · finaliza el{" "}
              {new Date(semester.end_date + "T00:00:00").toLocaleDateString(
                "es-CL",
                { day: "numeric", month: "long" }
              )}
              .
            </>
          ) : (
            "No hay semestre activo configurado."
          )}
        </p>
      </header>

      <section>
        <h2 className="text-muted-foreground mb-3 text-sm font-medium">
          Tus módulos
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => {
            const Icon = m.icon
            return (
              <Link key={m.key} href={m.href} className="group">
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardContent className="flex items-start gap-4">
                    <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 font-semibold">
                        {m.label}
                        <ArrowRight className="size-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {m.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
