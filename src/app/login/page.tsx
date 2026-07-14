import Link from "next/link"
import { Trophy } from "lucide-react"

import { LoginForm } from "@/components/auth/login-form"

export const metadata = { title: "Ingresar · Desafío Fenner" }

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Panel de marca */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-blue-700 via-blue-800 to-slate-900 p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-white/10 text-xl font-bold ring-1 ring-white/20">
            DF
          </div>
          <span className="text-lg font-semibold tracking-tight">
            Desafío Fenner
          </span>
        </div>
        <div className="space-y-4">
          <h1 className="text-4xl font-bold leading-tight">
            Premiamos las buenas acciones.
          </h1>
          <p className="max-w-md text-blue-100">
            Cada curso de 2° medio compite durante el semestre desarrollando
            responsabilidad, respeto, puntualidad y trabajo en equipo. Cada buena
            acción suma puntos.
          </p>
        </div>
        <p className="text-sm text-blue-200/80">
          Liceo Bicentenario Industrial Ing. Ricardo Fenner Ruedi
        </p>
      </div>

      {/* Formulario */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 text-center lg:hidden">
            <div className="mx-auto grid size-12 place-items-center rounded-xl bg-blue-700 text-lg font-bold text-white">
              DF
            </div>
            <h1 className="text-2xl font-bold">Desafío Fenner</h1>
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">
              Iniciar sesión
            </h2>
            <p className="text-muted-foreground text-sm">
              Ingresa con tu correo institucional.
            </p>
          </div>
          <LoginForm />
          <p className="text-center">
            <Link
              href="/puntajes"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
            >
              <Trophy className="size-4 text-amber-500" />
              Ver el marcador del Desafío (sin ingresar)
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
