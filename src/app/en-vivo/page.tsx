import { LiveBoard } from "@/components/live/live-board"

export const metadata = {
  title: "Marcador en vivo · Desafío Fenner",
  description:
    "Puntaje en tiempo real del Desafío Fenner — cada punto se refleja al instante.",
}

export default function EnVivoPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-950 via-slate-950 to-slate-950 px-4 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-white/10 text-2xl font-black ring-1 ring-white/20">
            DF
          </div>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            Desafío Fenner
          </h1>
          <p className="mt-2 text-lg text-emerald-200">
            Marcador en tiempo real ⚡
          </p>
        </header>
        <LiveBoard />
        <footer className="mt-10 text-center text-sm text-emerald-300/70">
          Puntaje General acumulado del semestre · el ranking oficial se publica
          los lunes
        </footer>
      </div>
    </main>
  )
}
