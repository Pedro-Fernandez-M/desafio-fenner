import { ScoreboardLive } from "@/components/scoreboard/scoreboard-live"

export const metadata = {
  title: "¿Cómo vamos? · Desafío Fenner",
  description:
    "Marcador en tiempo real del Desafío Fenner — puntaje acumulado de los cursos de 2° medio.",
}

export default function PuntajesPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-950 via-indigo-950 to-slate-950 px-4 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-10 text-center">
          <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-white/10 text-2xl font-black ring-1 ring-white/20">
            DF
          </div>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            Desafío Fenner
          </h1>
          <p className="mt-2 text-lg text-blue-200">
            ¿Cómo vamos? 🏁 Puntaje acumulado del semestre
          </p>
        </header>

        <ScoreboardLive />

        <footer className="mt-10 text-center text-sm text-blue-300">
          El curso con más puntos al final del semestre gana el gran premio · ¡Cada
          buena acción suma! 💪
        </footer>
      </div>
    </main>
  )
}
