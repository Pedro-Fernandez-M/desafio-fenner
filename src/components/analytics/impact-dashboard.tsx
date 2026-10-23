"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Download,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  ShieldAlert,
  ClipboardCheck,
} from "lucide-react"

import type {
  SchoolAnalysis,
  CourseAnalysis,
  Verdict,
  ComplianceStatus,
} from "@/lib/analytics"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LineChart, BarChart, FactorBars, type Pt } from "./charts"

function verdictMeta(v: Verdict) {
  if (v === "mejoro")
    return { label: "Mejoró", cls: "bg-emerald-100 text-emerald-700", Icon: TrendingUp }
  if (v === "bajo")
    return { label: "Bajó", cls: "bg-red-100 text-red-700", Icon: TrendingDown }
  return { label: "Se mantuvo", cls: "bg-amber-100 text-amber-700", Icon: Minus }
}

function VerdictBadge({ v }: { v: Verdict }) {
  const m = verdictMeta(v)
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${m.cls}`}
    >
      <m.Icon className="size-3.5" /> {m.label}
    </span>
  )
}

function complianceMeta(s: ComplianceStatus) {
  if (s === "cumple")
    return { label: "Cumple", cls: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500" }
  if (s === "parcial")
    return { label: "Parcial", cls: "bg-amber-100 text-amber-700", bar: "bg-amber-500" }
  return { label: "No cumple", cls: "bg-red-100 text-red-700", bar: "bg-red-500" }
}

function Kpi({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string
  value: string
  sub?: string
  tone?: "default" | "up" | "down" | "accent"
}) {
  const color =
    tone === "up"
      ? "text-emerald-600"
      : tone === "down"
        ? "text-red-600"
        : tone === "accent"
          ? "text-blue-600"
          : "text-foreground"
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <p className={`mt-1 text-2xl font-black ${color}`}>{value}</p>
        {sub && <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function overallToPts(points: { label: string; avg: number; n: number }[]): Pt[] {
  return points.map((p) => ({ label: p.label, value: p.n > 0 ? p.avg : null }))
}

export function ImpactDashboard({ data }: { data: SchoolAnalysis }) {
  const [sel, setSel] = useState<string>("all")
  const [downloading, setDownloading] = useState(false)

  const courseItems = useMemo(
    () => [
      { value: "all", label: "Todos los cursos (colegio)" },
      ...[...data.courses]
        .sort((a, b) => a.courseName.localeCompare(b.courseName))
        .map((c) => ({ value: c.courseId, label: c.courseName })),
    ],
    [data.courses]
  )

  const course: CourseAnalysis | null =
    sel === "all" ? null : data.courses.find((c) => c.courseId === sel) ?? null

  async function handleDownload() {
    setDownloading(true)
    try {
      const { exportImpactPpt } = await import("./ppt")
      await exportImpactPpt(data)
      toast.success("Presentación (.pptx) descargada.")
    } catch (e) {
      console.error(e)
      toast.error("No se pudo generar el PPT.")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Controles */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:w-72">
          <Select items={courseItems} value={sel} onValueChange={(v) => v && setSel(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Elige una vista" />
            </SelectTrigger>
            <SelectContent>
              {courseItems.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleDownload} disabled={downloading}>
          {downloading ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Download className="mr-2 size-4" />
          )}
          Descargar PPT
        </Button>
      </div>

      {sel === "all" ? <SchoolView data={data} /> : course && <CourseView c={course} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Vista colegio
// ---------------------------------------------------------------------------
function SchoolView({ data }: { data: SchoolAnalysis }) {
  const mejoraron = data.courses.filter((c) => c.verdict === "mejoro").length
  const ranked = [...data.courses].sort((a, b) => a.position - b.position)

  return (
    <div className="space-y-6">
      {/* Veredicto principal */}
      <Card className="border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50">
        <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-muted-foreground text-sm font-medium">
              ¿Funcionó el Desafío Fenner este semestre?
            </p>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-3xl font-black text-blue-900">
                {verdictMeta(data.verdict).label}
              </span>
              <VerdictBadge v={data.verdict} />
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              El nivel de logro promedio pasó de{" "}
              <b>{data.firstAvg.toFixed(2)}</b> a <b>{data.lastAvg.toFixed(2)}</b> (de 0 a 3).{" "}
              {mejoraron} de {data.courses.length} cursos mejoraron.
            </p>
          </div>
          <div className="text-right">
            <p
              className={`text-4xl font-black ${data.delta >= 0 ? "text-emerald-600" : "text-red-600"}`}
            >
              {data.deltaPct >= 0 ? "+" : ""}
              {data.deltaPct}%
            </p>
            <p className="text-muted-foreground text-xs">variación global</p>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Cursos que mejoraron" value={`${mejoraron} / ${data.courses.length}`} tone="up" />
        <Kpi
          label="Evaluaciones registradas"
          value={data.totals.evaluaciones.toLocaleString("es-CL")}
        />
        <Kpi
          label="Penalizaciones"
          value={String(data.totals.penalizaciones)}
          tone="down"
        />
        <Kpi
          label="Puntaje general total"
          value={data.totals.puntosGeneral.toLocaleString("es-CL")}
          tone="accent"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evolución del nivel de logro (colegio)</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart series={overallToPts(data.overall)} color="#2563eb" />
            <p className="text-muted-foreground mt-2 text-xs">
              Promedio de todos los factores evaluados, semana a semana (escala 0–3).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Factores: qué mejoró más</CardTitle>
          </CardHeader>
          <CardContent>
            <FactorBars factors={data.factors} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Penalizaciones por semana (todo 2° medio)</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            data={data.penaltiesByWeek.map((p) => ({ label: p.label, value: p.count }))}
          />
        </CardContent>
      </Card>

      {/* Ranking / tabla de cursos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="size-4 text-amber-500" /> Resumen por curso
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Curso</th>
                <th className="py-2 pr-2 text-right">Puntos</th>
                <th className="py-2 pr-2 text-center">Inicio → Ahora</th>
                <th className="py-2 pr-2 text-right">Δ</th>
                <th className="py-2 pr-2 text-center">Penaliz.</th>
                <th className="py-2 pr-2 text-center">Tendencia</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((c) => (
                <tr key={c.courseId} className="border-b last:border-0">
                  <td className="py-2 pr-2 font-bold text-slate-500">{c.position}°</td>
                  <td className="py-2 pr-2 font-semibold">{c.courseName}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {c.totalGeneral.toLocaleString("es-CL")}
                  </td>
                  <td className="py-2 pr-2 text-center tabular-nums">
                    {c.firstAvg.toFixed(1)} → {c.lastAvg.toFixed(1)}
                  </td>
                  <td
                    className={`py-2 pr-2 text-right font-semibold tabular-nums ${c.delta > 0 ? "text-emerald-600" : c.delta < 0 ? "text-red-600" : "text-muted-foreground"}`}
                  >
                    {c.delta >= 0 ? "+" : ""}
                    {c.delta.toFixed(1)}
                  </td>
                  <td className="py-2 pr-2 text-center tabular-nums">{c.penaltyCount}</td>
                  <td className="py-2 pr-2 text-center">
                    <VerdictBadge v={c.verdict} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <ComplianceSection c={data.compliance} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cumplimiento docente
// ---------------------------------------------------------------------------
function ComplianceSection({ c }: { c: SchoolAnalysis["compliance"] }) {
  if (c.teachers.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="size-4 text-blue-500" /> Cumplimiento docente
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Cumplimiento promedio" value={`${c.avgPct}%`} tone="accent" />
          <Kpi label="Cumplen (≥80%)" value={String(c.cumplen)} tone="up" />
          <Kpi label="Parcial (50–79%)" value={String(c.parcial)} />
          <Kpi label="No cumplen (<50%)" value={String(c.noCumplen)} tone="down" />
        </div>

        <p className="text-muted-foreground text-xs">
          % de clases registradas respecto de las esperadas según el horario cargado,
          sobre {c.weeks} semanas del semestre. Ordenado de mayor a menor cumplimiento.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th className="py-2 pr-2">Profesor</th>
                <th className="py-2 pr-2 text-center">Clases/sem</th>
                <th className="py-2 pr-2 text-center">Registró</th>
                <th className="py-2 pr-2">Cumplimiento</th>
                <th className="py-2 pr-2 text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {c.teachers.map((t) => {
                const m = complianceMeta(t.status)
                return (
                  <tr key={t.teacherId} className="border-b last:border-0">
                    <td className="py-2 pr-2 font-medium">{t.name}</td>
                    <td className="py-2 pr-2 text-center tabular-nums">{t.expectedWeekly}</td>
                    <td className="py-2 pr-2 text-center tabular-nums">
                      {t.registered}
                      <span className="text-muted-foreground">/{t.expectedTotal}</span>
                    </td>
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${m.bar}`}
                            style={{ width: `${t.pct}%` }}
                          />
                        </div>
                        <span className="w-9 text-right text-xs font-semibold tabular-nums">
                          {t.pct}%
                        </span>
                      </div>
                    </td>
                    <td className="py-2 pr-2 text-center">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${m.cls}`}
                      >
                        {m.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Vista de un curso
// ---------------------------------------------------------------------------
function CourseView({ c }: { c: CourseAnalysis }) {
  return (
    <div className="space-y-6">
      <Card className="border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50">
        <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-black text-blue-900">{c.courseName}</span>
              <VerdictBadge v={c.verdict} />
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              Nivel de logro: <b>{c.firstAvg.toFixed(2)}</b> → <b>{c.lastAvg.toFixed(2)}</b> (0 a 3).
            </p>
          </div>
          <div className="text-right">
            <p
              className={`text-4xl font-black ${c.delta >= 0 ? "text-emerald-600" : "text-red-600"}`}
            >
              {c.deltaPct >= 0 ? "+" : ""}
              {c.deltaPct}%
            </p>
            <p className="text-muted-foreground text-xs">variación</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Puesto actual" value={`${c.position}°`} tone="accent" />
        <Kpi label="Puntaje general" value={c.totalGeneral.toLocaleString("es-CL")} />
        <Kpi label="Evaluaciones" value={c.recordCount.toLocaleString("es-CL")} />
        <Kpi
          label="Penalizaciones"
          value={`${c.penaltyCount}`}
          sub={`${c.penaltyPoints} pts`}
          tone="down"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evolución del nivel de logro</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart
              series={overallToPts(c.overall)}
              color={c.verdict === "bajo" ? "#dc2626" : c.verdict === "mejoro" ? "#059669" : "#d97706"}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Factores evaluados (inicio → ahora)</CardTitle>
          </CardHeader>
          <CardContent>
            {c.factors.length > 0 ? (
              <FactorBars factors={c.factors} />
            ) : (
              <p className="text-muted-foreground text-sm">Sin datos de factores para este curso.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="size-4 text-red-500" /> Penalizaciones por semana
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart data={c.penaltiesByWeek.map((p) => ({ label: p.label, value: p.count }))} />
        </CardContent>
      </Card>
    </div>
  )
}
