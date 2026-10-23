import { createClient } from "@/lib/supabase/server"

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export type WeekPoint = { week: number; label: string; avg: number; n: number }

export type FactorSeries = {
  slug: string
  name: string
  series: WeekPoint[]
  first: number
  last: number
  delta: number
}

export type Verdict = "mejoro" | "estable" | "bajo"

export type CourseAnalysis = {
  courseId: string
  courseName: string
  /** Promedio de logro (0–3) por semana, considerando todos los factores. */
  overall: WeekPoint[]
  /** Evolución por cada factor/área. */
  factors: FactorSeries[]
  /** Penalizaciones por semana (cantidad y puntos descontados). */
  penaltiesByWeek: { week: number; label: string; count: number; points: number }[]
  firstAvg: number
  lastAvg: number
  delta: number
  deltaPct: number
  verdict: Verdict
  totalGeneral: number
  position: number
  penaltyCount: number
  penaltyPoints: number
  recordCount: number
}

export type ComplianceStatus = "cumple" | "parcial" | "no_cumple"

export type TeacherCompliance = {
  teacherId: string
  name: string
  /** Clases esperadas por semana, según el horario cargado. */
  expectedWeekly: number
  /** Semanas válidas del semestre (denominador). */
  activeWeeks: number
  expectedTotal: number
  /** Registros efectivos en semanas válidas. */
  registered: number
  /** En cuántas semanas válidas registró al menos una clase. */
  weeksWithRegistro: number
  /** % de clases registradas sobre las esperadas (tope 100). */
  pct: number
  status: ComplianceStatus
}

export type ComplianceSummary = {
  weeks: number
  teachers: TeacherCompliance[]
  avgPct: number
  cumplen: number
  parcial: number
  noCumplen: number
}

export type SchoolAnalysis = {
  semesterName: string
  weeks: { week: number; label: string }[]
  /** Promedio de logro del colegio (todos los cursos) por semana. */
  overall: WeekPoint[]
  firstAvg: number
  lastAvg: number
  delta: number
  deltaPct: number
  verdict: Verdict
  /** Penalizaciones de todo 2° medio por semana. */
  penaltiesByWeek: { week: number; label: string; count: number; points: number }[]
  /** Factores ordenados por cuánto mejoraron (colegio completo). */
  factors: FactorSeries[]
  courses: CourseAnalysis[]
  compliance: ComplianceSummary
  totals: {
    evaluaciones: number
    penalizaciones: number
    puntosGeneral: number
  }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const MS_WEEK = 7 * 24 * 3600 * 1000

/** Lunes de la fecha dada (00:00 local). */
function mondayOf(d: Date): Date {
  const m = new Date(d)
  m.setHours(0, 0, 0, 0)
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7))
  return m
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function verdictOf(delta: number): Verdict {
  if (delta >= 0.15) return "mejoro"
  if (delta <= -0.15) return "bajo"
  return "estable"
}

/** Promedio de una ventana de semanas (las primeras/últimas con datos). */
function windowAvg(points: WeekPoint[], side: "first" | "last", size = 3): number {
  const withData = points.filter((p) => p.n > 0)
  if (withData.length === 0) return 0
  const slice =
    side === "first"
      ? withData.slice(0, Math.min(size, withData.length))
      : withData.slice(-Math.min(size, withData.length))
  // Promedio ponderado por cantidad de registros
  let sum = 0
  let n = 0
  for (const p of slice) {
    sum += p.avg * p.n
    n += p.n
  }
  return n > 0 ? round2(sum / n) : 0
}

// ---------------------------------------------------------------------------
// Builder principal
// ---------------------------------------------------------------------------
export async function buildImpactAnalysis(
  semesterId: string,
  semesterName: string,
  semesterStart: string
): Promise<SchoolAnalysis> {
  const supabase = await createClient()

  const start = mondayOf(new Date(`${semesterStart}T00:00:00`))
  const labelFor = (week: number) => {
    const d = new Date(start.getTime() + (week - 1) * MS_WEEK)
    return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" })
  }
  const weekFromDate = (iso: string) => {
    const diff = mondayOf(new Date(iso)).getTime() - start.getTime()
    return Math.max(1, Math.round(diff / MS_WEEK) + 1)
  }

  // --- Carga de datos en paralelo ---
  const [
    { data: courses },
    { data: areas },
    { data: indicators },
    { data: evals },
    { data: standings },
  ] = await Promise.all([
    supabase.from("courses").select("id, name").eq("active", true).order("name"),
    supabase.from("areas").select("id, slug, name, order_index").order("order_index"),
    supabase.from("indicators").select("id, area_id"),
    supabase
      .from("class_evaluations")
      .select("id, course_id, week_number, evaluator_id")
      .eq("semester_id", semesterId),
    supabase.from("course_standings").select("*").eq("semester_id", semesterId),
  ])

  // Datos para cumplimiento docente: horario (clases esperadas por semana) y
  // nómina de profesores.
  const [{ data: schedule }, { data: teacherProfiles }] = await Promise.all([
    supabase.from("class_schedule").select("teacher_id"),
    supabase.from("profiles").select("id, full_name, role, active"),
  ])

  // class_evaluation_scores: paginado (supera el tope de 1000)
  type ScoreRow = { class_evaluation_id: string; indicator_id: string; level: number }
  const scores: ScoreRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("class_evaluation_scores")
      .select("class_evaluation_id, indicator_id, level")
      .range(from, from + 999)
    const chunk = (data ?? []) as ScoreRow[]
    scores.push(...chunk)
    if (chunk.length < 1000) break
  }

  // score_events (penalizaciones y evaluaciones) para tendencia de puntaje
  const { data: events } = await supabase
    .from("score_events")
    .select("course_id, type, general_delta, created_at")
    .eq("semester_id", semesterId)

  // --- Índices auxiliares ---
  const areaList = (areas ?? []).map((a) => ({
    id: a.id,
    slug: a.slug,
    name: a.name,
  }))
  const areaOfIndicator = new Map<string, string>()
  for (const i of indicators ?? []) areaOfIndicator.set(i.id, i.area_id)

  const evalInfo = new Map<string, { courseId: string; week: number }>()
  const weekSet = new Set<number>()
  // Registros por profesor y por semana (para el cumplimiento).
  const regByTeacher = new Map<string, Map<number, number>>()
  for (const e of evals ?? []) {
    evalInfo.set(e.id, { courseId: e.course_id, week: e.week_number })
    weekSet.add(e.week_number)
    if (e.evaluator_id) {
      const m = regByTeacher.get(e.evaluator_id) ?? new Map<number, number>()
      m.set(e.week_number, (m.get(e.week_number) ?? 0) + 1)
      regByTeacher.set(e.evaluator_id, m)
    }
  }
  let weeks = [...weekSet].sort((a, b) => a - b)

  const standingOf = new Map(
    (standings ?? []).map((s) => [s.course_id, s])
  )

  // Posición por puntaje general (con empates)
  const ordered = [...(courses ?? [])]
    .map((c) => ({ id: c.id, g: standingOf.get(c.id)?.general_total ?? 0 }))
    .sort((a, b) => b.g - a.g)
  const positionOf = new Map<string, number>()
  {
    let lastG: number | null = null
    let lastPos = 0
    ordered.forEach((row, idx) => {
      if (row.g === lastG) positionOf.set(row.id, lastPos)
      else {
        lastPos = idx + 1
        lastG = row.g
        positionOf.set(row.id, lastPos)
      }
    })
  }

  // --- Acumuladores: sum/count de nivel por [curso][semana] y [curso][area][semana] ---
  type SC = { sum: number; n: number }
  const key2 = (a: string, b: number) => `${a}|${b}`
  const key3 = (a: string, b: string, c: number) => `${a}|${b}|${c}`

  const overallAgg = new Map<string, SC>() // curso|semana
  const factorAgg = new Map<string, SC>() // curso|area|semana
  const schoolOverall = new Map<number, SC>() // semana (colegio)
  const schoolFactor = new Map<string, SC>() // area|semana (colegio)

  const bump = (m: Map<string, SC>, k: string, lvl: number) => {
    const s = m.get(k) ?? { sum: 0, n: 0 }
    s.sum += lvl
    s.n += 1
    m.set(k, s)
  }

  const recordCount = new Map<string, number>()

  for (const s of scores) {
    const info = evalInfo.get(s.class_evaluation_id)
    if (!info) continue
    const areaId = areaOfIndicator.get(s.indicator_id)
    if (!areaId) continue
    const { courseId, week } = info

    bump(overallAgg, key2(courseId, week), s.level)
    bump(factorAgg, key3(courseId, areaId, week), s.level)

    const so = schoolOverall.get(week) ?? { sum: 0, n: 0 }
    so.sum += s.level
    so.n += 1
    schoolOverall.set(week, so)

    bump(schoolFactor, key2(areaId, week), s.level)

    recordCount.set(courseId, (recordCount.get(courseId) ?? 0) + 1)
  }

  // Descarta semanas de volumen insignificante (p. ej. cargas de prueba): se
  // conservan solo las que tienen al menos el 15% de registros de la semana
  // más activa (y un mínimo absoluto de 20).
  const maxWeekN = Math.max(
    1,
    ...weeks.map((w) => schoolOverall.get(w)?.n ?? 0)
  )
  const minWeekN = Math.max(20, Math.round(maxWeekN * 0.15))
  weeks = weeks.filter((w) => (schoolOverall.get(w)?.n ?? 0) >= minWeekN)
  const weekMeta = weeks.map((w) => ({ week: w, label: labelFor(w) }))

  const avgPoint = (m: Map<string, SC>, k: string, week: number): WeekPoint => {
    const s = m.get(k) ?? { sum: 0, n: 0 }
    return {
      week,
      label: labelFor(week),
      avg: s.n > 0 ? round2(s.sum / s.n) : 0,
      n: s.n,
    }
  }

  // --- Penalizaciones por semana ---
  const penByCourseWeek = new Map<string, { count: number; points: number }>()
  const penSchoolWeek = new Map<number, { count: number; points: number }>()
  let totalPen = 0
  let totalEval = 0
  for (const e of events ?? []) {
    if (e.type === "evaluacion") totalEval++
    if (e.type !== "penalizacion") continue
    totalPen++
    const w = weekFromDate(e.created_at)
    const ck = key2(e.course_id, w)
    const cv = penByCourseWeek.get(ck) ?? { count: 0, points: 0 }
    cv.count += 1
    cv.points += e.general_delta
    penByCourseWeek.set(ck, cv)
    const sv = penSchoolWeek.get(w) ?? { count: 0, points: 0 }
    sv.count += 1
    sv.points += e.general_delta
    penSchoolWeek.set(w, sv)
  }

  // --- Armado por curso ---
  const courseAnalyses: CourseAnalysis[] = (courses ?? []).map((c) => {
    const overall = weeks.map((w) => avgPoint(overallAgg, key2(c.id, w), w))

    const factors: FactorSeries[] = areaList
      .map((a) => {
        const series = weeks.map((w) =>
          avgPoint(factorAgg, key3(c.id, a.id, w), w)
        )
        const first = windowAvg(series, "first")
        const last = windowAvg(series, "last")
        return {
          slug: a.slug,
          name: a.name,
          series,
          first,
          last,
          delta: round2(last - first),
        }
      })
      // Solo factores con datos reales para este curso
      .filter((f) => f.series.some((p) => p.n > 0))

    const penaltiesByWeek = weeks.map((w) => {
      const v = penByCourseWeek.get(key2(c.id, w)) ?? { count: 0, points: 0 }
      return { week: w, label: labelFor(w), count: v.count, points: v.points }
    })

    const firstAvg = windowAvg(overall, "first")
    const lastAvg = windowAvg(overall, "last")
    const delta = round2(lastAvg - firstAvg)
    const st = standingOf.get(c.id)
    const penAll = [...penByCourseWeek.entries()]
      .filter(([k]) => k.startsWith(`${c.id}|`))
      .reduce(
        (acc, [, v]) => {
          acc.count += v.count
          acc.points += v.points
          return acc
        },
        { count: 0, points: 0 }
      )

    return {
      courseId: c.id,
      courseName: c.name,
      overall,
      factors,
      penaltiesByWeek,
      firstAvg,
      lastAvg,
      delta,
      deltaPct: firstAvg > 0 ? Math.round((delta / firstAvg) * 100) : 0,
      verdict: verdictOf(delta),
      totalGeneral: st?.general_total ?? 0,
      position: positionOf.get(c.id) ?? 0,
      penaltyCount: penAll.count,
      penaltyPoints: penAll.points,
      recordCount: recordCount.get(c.id) ?? 0,
    }
  })

  // --- Colegio completo ---
  const schoolOverallSeries = weeks.map((w) => {
    const s = schoolOverall.get(w) ?? { sum: 0, n: 0 }
    return {
      week: w,
      label: labelFor(w),
      avg: s.n > 0 ? round2(s.sum / s.n) : 0,
      n: s.n,
    }
  })
  const schoolFirst = windowAvg(schoolOverallSeries, "first")
  const schoolLast = windowAvg(schoolOverallSeries, "last")
  const schoolDelta = round2(schoolLast - schoolFirst)

  const schoolFactors: FactorSeries[] = areaList
    .map((a) => {
      const series = weeks.map((w) => avgPoint(schoolFactor, key2(a.id, w), w))
      const first = windowAvg(series, "first")
      const last = windowAvg(series, "last")
      return {
        slug: a.slug,
        name: a.name,
        series,
        first,
        last,
        delta: round2(last - first),
      }
    })
    .filter((f) => f.series.some((p) => p.n > 0))
    .sort((a, b) => b.delta - a.delta)

  const schoolPen = weeks.map((w) => {
    const v = penSchoolWeek.get(w) ?? { count: 0, points: 0 }
    return { week: w, label: labelFor(w), count: v.count, points: v.points }
  })

  const puntosGeneral = (standings ?? []).reduce(
    (s, x) => s + (x.general_total ?? 0),
    0
  )

  // --- Cumplimiento docente ---
  // Clases esperadas por semana = filas de horario del profesor.
  const schedCount = new Map<string, number>()
  for (const s of schedule ?? [])
    schedCount.set(s.teacher_id, (schedCount.get(s.teacher_id) ?? 0) + 1)

  const activeWeeks = weeks.length
  const profileById = new Map(
    (teacherProfiles ?? []).map((p) => [p.id, p])
  )

  const compTeachers: TeacherCompliance[] = []
  for (const [teacherId, expectedWeekly] of schedCount) {
    const p = profileById.get(teacherId)
    if (!p || p.role !== "profesor" || expectedWeekly <= 0) continue
    const regMap = regByTeacher.get(teacherId)
    let registered = 0
    let weeksWithRegistro = 0
    for (const w of weeks) {
      const c = regMap?.get(w) ?? 0
      registered += c
      if (c > 0) weeksWithRegistro++
    }
    const expectedTotal = expectedWeekly * activeWeeks
    const pct =
      expectedTotal > 0
        ? Math.min(100, Math.round((registered / expectedTotal) * 100))
        : 0
    const status: ComplianceStatus =
      pct >= 80 ? "cumple" : pct >= 50 ? "parcial" : "no_cumple"
    compTeachers.push({
      teacherId,
      name: p.full_name,
      expectedWeekly,
      activeWeeks,
      expectedTotal,
      registered,
      weeksWithRegistro,
      pct,
      status,
    })
  }
  compTeachers.sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name))
  const avgPct =
    compTeachers.length > 0
      ? Math.round(
          compTeachers.reduce((s, t) => s + t.pct, 0) / compTeachers.length
        )
      : 0
  const compliance: ComplianceSummary = {
    weeks: activeWeeks,
    teachers: compTeachers,
    avgPct,
    cumplen: compTeachers.filter((t) => t.status === "cumple").length,
    parcial: compTeachers.filter((t) => t.status === "parcial").length,
    noCumplen: compTeachers.filter((t) => t.status === "no_cumple").length,
  }

  return {
    semesterName,
    weeks: weekMeta,
    overall: schoolOverallSeries,
    firstAvg: schoolFirst,
    lastAvg: schoolLast,
    delta: schoolDelta,
    deltaPct: schoolFirst > 0 ? Math.round((schoolDelta / schoolFirst) * 100) : 0,
    verdict: verdictOf(schoolDelta),
    penaltiesByWeek: schoolPen,
    factors: schoolFactors,
    courses: courseAnalyses,
    compliance,
    totals: {
      evaluaciones: totalEval,
      penalizaciones: totalPen,
      puntosGeneral,
    },
  }
}
