import type PptxGen from "pptxgenjs"
import type { SchoolAnalysis, CourseAnalysis, Verdict } from "@/lib/analytics"

type TableRow = PptxGen.TableRow

const NAVY = "0F2E6B"
const BLUE = "2563EB"
const EMERALD = "059669"
const RED = "DC2626"
const AMBER = "D97706"
const SLATE = "475569"
const LIGHT = "F1F5F9"

function verdictInfo(v: Verdict): { label: string; color: string; emoji: string } {
  if (v === "mejoro") return { label: "Mejoró", color: EMERALD, emoji: "✅" }
  if (v === "bajo") return { label: "Bajó", color: RED, emoji: "⚠️" }
  return { label: "Se mantuvo", color: AMBER, emoji: "➖" }
}

/** Serie de nivel lista para pptx: solo semanas con datos. */
function levelSeries(points: { label: string; avg: number; n: number }[]) {
  const withData = points.filter((p) => p.n > 0)
  return {
    labels: withData.map((p) => p.label),
    values: withData.map((p) => p.avg),
  }
}

export async function exportImpactPpt(data: SchoolAnalysis) {
  const PptxGenJS = (await import("pptxgenjs")).default
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: "W", width: 13.33, height: 7.5 })
  pptx.layout = "W"
  pptx.author = "Desafío Fenner"
  pptx.company = "Liceo Bicentenario Industrial Ing. Ricardo Fenner Ruedi"

  const today = new Date().toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })

  // ---------- Slide 1: Portada ----------
  {
    const s = pptx.addSlide()
    s.background = { color: NAVY }
    s.addText("DESAFÍO FENNER", {
      x: 0.8,
      y: 2.3,
      w: 11.7,
      h: 1,
      fontSize: 48,
      bold: true,
      color: "FFFFFF",
      align: "left",
    })
    s.addText("Informe de Impacto del Semestre", {
      x: 0.85,
      y: 3.4,
      w: 11.7,
      h: 0.7,
      fontSize: 26,
      color: "93C5FD",
    })
    s.addText(`${data.semesterName}  ·  Cursos de 2° Medio`, {
      x: 0.85,
      y: 4.2,
      w: 11.7,
      h: 0.5,
      fontSize: 16,
      color: "CBD5E1",
    })
    s.addText(`Generado el ${today}`, {
      x: 0.85,
      y: 6.6,
      w: 11.7,
      h: 0.4,
      fontSize: 12,
      color: "64748B",
    })
  }

  // ---------- Slide 2: Resumen del colegio ----------
  {
    const s = pptx.addSlide()
    s.addText("¿Funcionó el desafío? — Resumen general", {
      x: 0.5,
      y: 0.35,
      w: 12.3,
      h: 0.6,
      fontSize: 24,
      bold: true,
      color: NAVY,
    })

    const v = verdictInfo(data.verdict)
    // Tarjetas KPI
    const kpis = [
      { t: "Logro inicial", v: data.firstAvg.toFixed(2), s: "promedio 0–3", c: SLATE },
      { t: "Logro actual", v: data.lastAvg.toFixed(2), s: "promedio 0–3", c: BLUE },
      {
        t: "Variación",
        v: `${data.delta >= 0 ? "+" : ""}${data.delta.toFixed(2)}`,
        s: `${data.deltaPct >= 0 ? "+" : ""}${data.deltaPct}%`,
        c: data.delta >= 0 ? EMERALD : RED,
      },
      { t: "Veredicto", v: v.label, s: `${data.totals.penalizaciones} penalizaciones`, c: v.color },
    ]
    kpis.forEach((k, i) => {
      const x = 0.5 + i * 3.08
      s.addShape(pptx.ShapeType.roundRect, {
        x,
        y: 1.15,
        w: 2.9,
        h: 1.5,
        fill: { color: LIGHT },
        line: { color: "E2E8F0", width: 1 },
        rectRadius: 0.08,
      })
      s.addText(k.t, { x, y: 1.25, w: 2.9, h: 0.35, fontSize: 12, color: SLATE, align: "center" })
      s.addText(String(k.v), {
        x,
        y: 1.6,
        w: 2.9,
        h: 0.6,
        fontSize: 26,
        bold: true,
        color: k.c,
        align: "center",
      })
      s.addText(k.s, { x, y: 2.25, w: 2.9, h: 0.3, fontSize: 10, color: "94A3B8", align: "center" })
    })

    // Gráfico de evolución (colegio)
    const ov = levelSeries(data.overall)
    s.addText("Evolución del nivel de logro (colegio)", {
      x: 0.5,
      y: 2.95,
      w: 6,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: NAVY,
    })
    s.addChart(
      pptx.ChartType.line,
      [{ name: "Logro promedio", labels: ov.labels, values: ov.values }],
      {
        x: 0.4,
        y: 3.3,
        w: 6.4,
        h: 3.7,
        valAxisMinVal: 0,
        valAxisMaxVal: 3,
        valAxisMajorUnit: 1,
        chartColors: [BLUE],
        lineSize: 3,
        lineSmooth: true,
        showLegend: false,
        showValue: true,
        dataLabelColor: SLATE,
        dataLabelFontSize: 9,
        catAxisLabelFontSize: 9,
        valAxisLabelFontSize: 9,
      }
    )

    // Ranking actual
    s.addText("Ranking actual (puntaje general)", {
      x: 7.1,
      y: 2.95,
      w: 5.7,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: NAVY,
    })
    const ranked = [...data.courses].sort((a, b) => a.position - b.position)
    const rows = [
      [
        { text: "#", options: { bold: true, color: "FFFFFF", fill: { color: NAVY } } },
        { text: "Curso", options: { bold: true, color: "FFFFFF", fill: { color: NAVY } } },
        { text: "Puntos", options: { bold: true, color: "FFFFFF", fill: { color: NAVY }, align: "right" } },
        { text: "Tendencia", options: { bold: true, color: "FFFFFF", fill: { color: NAVY }, align: "center" } },
      ],
      ...ranked.map((c) => {
        const vi = verdictInfo(c.verdict)
        return [
          { text: String(c.position), options: { align: "center" } },
          { text: c.courseName, options: { bold: true } },
          { text: c.totalGeneral.toLocaleString("es-CL"), options: { align: "right" } },
          { text: vi.label, options: { align: "center", color: vi.color, bold: true } },
        ]
      }),
    ] as TableRow[]
    s.addTable(rows, {
      x: 7.1,
      y: 3.3,
      w: 5.7,
      colW: [0.6, 2.4, 1.6, 1.1],
      fontSize: 12,
      rowH: 0.42,
      border: { type: "solid", color: "E2E8F0", pt: 1 },
      valign: "middle",
    })
  }

  // ---------- Slide 3: Factores (colegio) ----------
  {
    const s = pptx.addSlide()
    s.addText("¿Qué factores mejoraron más?", {
      x: 0.5,
      y: 0.35,
      w: 12.3,
      h: 0.6,
      fontSize: 24,
      bold: true,
      color: NAVY,
    })
    s.addText("Nivel de logro promedio (0–3) al inicio vs. ahora, por factor evaluado.", {
      x: 0.5,
      y: 0.95,
      w: 12.3,
      h: 0.4,
      fontSize: 13,
      color: SLATE,
    })

    const labels = data.factors.map((f) => f.name)
    s.addChart(
      pptx.ChartType.bar,
      [
        { name: "Inicio", labels, values: data.factors.map((f) => f.first) },
        { name: "Ahora", labels, values: data.factors.map((f) => f.last) },
      ],
      {
        x: 0.5,
        y: 1.5,
        w: 12.3,
        h: 5.4,
        barDir: "col",
        valAxisMinVal: 0,
        valAxisMaxVal: 3,
        valAxisMajorUnit: 1,
        chartColors: [SLATE, EMERALD],
        showLegend: true,
        legendPos: "t",
        showValue: true,
        dataLabelFontSize: 9,
        catAxisLabelFontSize: 11,
        valAxisLabelFontSize: 10,
      }
    )
  }

  // ---------- Slides: Cumplimiento docente ----------
  complianceSlides(pptx, data)

  // ---------- Slides por curso ----------
  for (const c of [...data.courses].sort((a, b) => a.courseName.localeCompare(b.courseName))) {
    courseSlide(pptx, c)
  }

  // ---------- Slide final: conclusión ----------
  {
    const s = pptx.addSlide()
    s.background = { color: NAVY }
    const best = [...data.courses].sort((a, b) => b.delta - a.delta)[0]
    const topFactor = data.factors[0]
    const mejoraron = data.courses.filter((c) => c.verdict === "mejoro").length
    const v = verdictInfo(data.verdict)
    s.addText("Conclusión", {
      x: 0.8,
      y: 0.8,
      w: 11.7,
      h: 0.8,
      fontSize: 30,
      bold: true,
      color: "FFFFFF",
    })
    const bullets = [
      `A nivel colegio el desafío ${v.label.toLowerCase()}: el logro promedio pasó de ${data.firstAvg.toFixed(2)} a ${data.lastAvg.toFixed(2)} (${data.deltaPct >= 0 ? "+" : ""}${data.deltaPct}%).`,
      `${mejoraron} de ${data.courses.length} cursos mejoraron su comportamiento durante el semestre.`,
      best
        ? `El curso con mayor mejora fue ${best.courseName} (${best.delta >= 0 ? "+" : ""}${best.delta.toFixed(2)} en nivel de logro).`
        : "",
      topFactor
        ? `El factor que más avanzó fue "${topFactor.name}" (${topFactor.delta >= 0 ? "+" : ""}${topFactor.delta.toFixed(2)}).`
        : "",
      `Se registraron ${data.totals.evaluaciones.toLocaleString("es-CL")} evaluaciones y ${data.totals.penalizaciones} penalizaciones en el periodo.`,
      data.compliance.teachers.length > 0
        ? `Cumplimiento docente promedio: ${data.compliance.avgPct}% — ${data.compliance.cumplen} profesores cumplen, ${data.compliance.noCumplen} no cumplen.`
        : "",
    ].filter(Boolean)
    s.addText(
      bullets.map((t) => ({ text: t, options: { bullet: { code: "2022" }, breakLine: true } })),
      {
        x: 0.9,
        y: 1.9,
        w: 11.5,
        h: 4.5,
        fontSize: 18,
        color: "E2E8F0",
        lineSpacingMultiple: 1.4,
      }
    )
    s.addText("Desafío Fenner · cada buena acción suma", {
      x: 0.9,
      y: 6.7,
      w: 11.5,
      h: 0.4,
      fontSize: 12,
      color: "64748B",
    })
  }

  await pptx.writeFile({
    fileName: `desafio-fenner-impacto-${new Date().toISOString().slice(0, 10)}.pptx`,
  })
}

// ---------------------------------------------------------------------------
function complianceSlides(pptx: PptxGen, data: SchoolAnalysis) {
  const list = data.compliance.teachers
  if (list.length === 0) return
  const statusColor = (s: string) =>
    s === "cumple" ? EMERALD : s === "parcial" ? AMBER : RED
  const statusLabel = (s: string) =>
    s === "cumple" ? "Cumple" : s === "parcial" ? "Parcial" : "No cumple"

  const PER = 15
  const pages = Math.ceil(list.length / PER)
  for (let p = 0; p < pages; p++) {
    const s = pptx.addSlide()
    const suffix = pages > 1 ? `  (${p + 1}/${pages})` : ""
    s.addText(`Cumplimiento docente${suffix}`, {
      x: 0.5,
      y: 0.35,
      w: 12.3,
      h: 0.6,
      fontSize: 24,
      bold: true,
      color: NAVY,
    })
    if (p === 0) {
      s.addText(
        `Promedio ${data.compliance.avgPct}%  ·  Cumplen ${data.compliance.cumplen}  ·  Parcial ${data.compliance.parcial}  ·  No cumplen ${data.compliance.noCumplen}   —   % de clases registradas vs. esperadas (horario), sobre ${data.compliance.weeks} semanas`,
        { x: 0.5, y: 0.95, w: 12.3, h: 0.4, fontSize: 12, color: SLATE }
      )
    }
    const chunk = list.slice(p * PER, p * PER + PER)
    const head: TableRow = [
      { text: "Profesor", options: { bold: true, color: "FFFFFF", fill: { color: NAVY } } },
      { text: "Clases/sem", options: { bold: true, color: "FFFFFF", fill: { color: NAVY }, align: "center" } },
      { text: "Registró", options: { bold: true, color: "FFFFFF", fill: { color: NAVY }, align: "center" } },
      { text: "Cumplimiento", options: { bold: true, color: "FFFFFF", fill: { color: NAVY }, align: "center" } },
      { text: "Estado", options: { bold: true, color: "FFFFFF", fill: { color: NAVY }, align: "center" } },
    ]
    const rows = [
      head,
      ...chunk.map((t) => [
        { text: t.name, options: {} },
        { text: String(t.expectedWeekly), options: { align: "center" } },
        { text: `${t.registered}/${t.expectedTotal}`, options: { align: "center" } },
        { text: `${t.pct}%`, options: { align: "center", bold: true, color: statusColor(t.status) } },
        {
          text: statusLabel(t.status),
          options: { align: "center", bold: true, color: "FFFFFF", fill: { color: statusColor(t.status) } },
        },
      ]),
    ] as TableRow[]
    s.addTable(rows, {
      x: 0.5,
      y: 1.5,
      w: 12.3,
      colW: [5.3, 1.7, 2.0, 1.8, 1.5],
      fontSize: 12,
      rowH: 0.34,
      border: { type: "solid", color: "E2E8F0", pt: 1 },
      valign: "middle",
    })
  }
}

// ---------------------------------------------------------------------------
function courseSlide(pptx: PptxGen, c: CourseAnalysis) {
  const s = pptx.addSlide()
  const v = verdictInfo(c.verdict)

  s.addText(`${c.courseName}`, {
    x: 0.5,
    y: 0.35,
    w: 6,
    h: 0.6,
    fontSize: 26,
    bold: true,
    color: NAVY,
  })
  // Badge veredicto
  s.addShape(pptx.ShapeType.roundRect, {
    x: 9.6,
    y: 0.42,
    w: 3.2,
    h: 0.65,
    fill: { color: v.color },
    rectRadius: 0.1,
  })
  s.addText(`${v.emoji} ${v.label}  (${c.deltaPct >= 0 ? "+" : ""}${c.deltaPct}%)`, {
    x: 9.6,
    y: 0.42,
    w: 3.2,
    h: 0.65,
    fontSize: 15,
    bold: true,
    color: "FFFFFF",
    align: "center",
    valign: "middle",
  })

  // Línea de logro del curso
  const ov = levelSeries(c.overall)
  s.addText("Evolución del nivel de logro", {
    x: 0.5,
    y: 1.1,
    w: 6,
    h: 0.35,
    fontSize: 13,
    bold: true,
    color: NAVY,
  })
  s.addChart(
    pptx.ChartType.line,
    [{ name: "Logro", labels: ov.labels, values: ov.values }],
    {
      x: 0.4,
      y: 1.45,
      w: 6.3,
      h: 3,
      valAxisMinVal: 0,
      valAxisMaxVal: 3,
      valAxisMajorUnit: 1,
      chartColors: [c.verdict === "bajo" ? RED : c.verdict === "mejoro" ? EMERALD : AMBER],
      lineSize: 3,
      lineSmooth: true,
      showLegend: false,
      showValue: true,
      dataLabelFontSize: 9,
      dataLabelColor: SLATE,
      catAxisLabelFontSize: 9,
      valAxisLabelFontSize: 9,
    }
  )

  // Penalizaciones por semana
  s.addText("Penalizaciones por semana", {
    x: 0.5,
    y: 4.55,
    w: 6,
    h: 0.35,
    fontSize: 13,
    bold: true,
    color: NAVY,
  })
  const pw = c.penaltiesByWeek
  s.addChart(
    pptx.ChartType.bar,
    [{ name: "Penalizaciones", labels: pw.map((p) => p.label), values: pw.map((p) => p.count) }],
    {
      x: 0.4,
      y: 4.9,
      w: 6.3,
      h: 2.2,
      barDir: "col",
      valAxisMinVal: 0,
      chartColors: [RED],
      showLegend: false,
      showValue: true,
      dataLabelFontSize: 9,
      catAxisLabelFontSize: 9,
      valAxisLabelFontSize: 9,
    }
  )

  // Tabla de factores
  s.addText("Factores: inicio → ahora", {
    x: 7,
    y: 1.1,
    w: 5.8,
    h: 0.35,
    fontSize: 13,
    bold: true,
    color: NAVY,
  })
  const rows = [
    [
      { text: "Factor", options: { bold: true, color: "FFFFFF", fill: { color: NAVY } } },
      { text: "Inicio", options: { bold: true, color: "FFFFFF", fill: { color: NAVY }, align: "center" } },
      { text: "Ahora", options: { bold: true, color: "FFFFFF", fill: { color: NAVY }, align: "center" } },
      { text: "Δ", options: { bold: true, color: "FFFFFF", fill: { color: NAVY }, align: "center" } },
    ],
    ...c.factors.map((f) => {
      const col = f.delta > 0.01 ? EMERALD : f.delta < -0.01 ? RED : SLATE
      return [
        { text: f.name, options: {} },
        { text: f.first.toFixed(1), options: { align: "center" } },
        { text: f.last.toFixed(1), options: { align: "center" } },
        {
          text: `${f.delta >= 0 ? "+" : ""}${f.delta.toFixed(1)}`,
          options: { align: "center", color: col, bold: true },
        },
      ]
    }),
  ] as TableRow[]
  s.addTable(rows, {
    x: 7,
    y: 1.45,
    w: 5.8,
    colW: [3.0, 0.93, 0.93, 0.94],
    fontSize: 11,
    rowH: 0.38,
    border: { type: "solid", color: "E2E8F0", pt: 1 },
    valign: "middle",
  })

  // Pie de datos
  s.addText(
    `Puesto ${c.position}°  ·  ${c.totalGeneral.toLocaleString("es-CL")} pts  ·  ${c.penaltyCount} penalizaciones (${c.penaltyPoints} pts)  ·  ${c.recordCount.toLocaleString("es-CL")} evaluaciones`,
    { x: 7, y: 6.4, w: 5.8, h: 0.6, fontSize: 12, color: SLATE }
  )
}
