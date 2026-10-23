"use client"

/** Punto de una serie: value null = semana sin datos (se omite del trazo). */
export type Pt = { label: string; value: number | null }

// ---------------------------------------------------------------------------
// Gráfico de líneas (escala 0–3 por defecto, para nivel de logro)
// ---------------------------------------------------------------------------
export function LineChart({
  series,
  yMax = 3,
  color = "#2563eb",
  height = 180,
  unit = "",
}: {
  series: Pt[]
  yMax?: number
  color?: string
  height?: number
  unit?: string
}) {
  const W = 560
  const H = height
  const padL = 32
  const padR = 16
  const padT = 16
  const padB = 28
  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const n = series.length
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const y = (v: number) => padT + innerH - (Math.max(0, Math.min(yMax, v)) / yMax) * innerH

  const pts = series
    .map((p, i) => ({ i, v: p.value }))
    .filter((p): p is { i: number; v: number } => p.v !== null)

  const path = pts
    .map((p, k) => `${k === 0 ? "M" : "L"} ${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`)
    .join(" ")
  const areaPath =
    pts.length > 1
      ? `${path} L ${x(pts[pts.length - 1].i).toFixed(1)} ${y(0).toFixed(1)} L ${x(
          pts[0].i
        ).toFixed(1)} ${y(0).toFixed(1)} Z`
      : ""

  const gid = `g-${color.replace("#", "")}`
  const gridVals = Array.from({ length: yMax + 1 }, (_, k) => k)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grilla horizontal */}
      {gridVals.map((g) => (
        <g key={g}>
          <line
            x1={padL}
            x2={W - padR}
            y1={y(g)}
            y2={y(g)}
            stroke="currentColor"
            strokeOpacity={g === 0 ? 0.25 : 0.1}
            className="text-slate-400"
          />
          <text
            x={padL - 6}
            y={y(g) + 3}
            textAnchor="end"
            className="fill-slate-400 text-[9px]"
          >
            {g}
          </text>
        </g>
      ))}

      {areaPath && <path d={areaPath} fill={`url(#${gid})`} />}
      {path && (
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {/* Puntos + valores */}
      {pts.map((p) => (
        <g key={p.i}>
          <circle cx={x(p.i)} cy={y(p.v)} r={3.5} fill="#fff" stroke={color} strokeWidth={2} />
          <text
            x={x(p.i)}
            y={y(p.v) - 8}
            textAnchor="middle"
            className="fill-slate-600 text-[9px] font-semibold"
          >
            {p.v.toFixed(1)}
            {unit}
          </text>
        </g>
      ))}

      {/* Etiquetas X */}
      {series.map((p, i) =>
        n <= 12 || i % 2 === 0 ? (
          <text
            key={i}
            x={x(i)}
            y={H - 8}
            textAnchor="middle"
            className="fill-slate-400 text-[9px]"
          >
            {p.label}
          </text>
        ) : null
      )}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Barras verticales (para penalizaciones por semana)
// ---------------------------------------------------------------------------
export function BarChart({
  data,
  color = "#dc2626",
  height = 150,
}: {
  data: { label: string; value: number }[]
  color?: string
  height?: number
}) {
  const W = 560
  const H = height
  const padL = 28
  const padR = 12
  const padT = 14
  const padB = 26
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const max = Math.max(1, ...data.map((d) => d.value))
  const n = data.length
  const gap = 6
  const bw = n > 0 ? innerW / n - gap : 0

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
      <line
        x1={padL}
        x2={W - padR}
        y1={padT + innerH}
        y2={padT + innerH}
        stroke="currentColor"
        strokeOpacity={0.2}
        className="text-slate-400"
      />
      {data.map((d, i) => {
        const h = (d.value / max) * innerH
        const bx = padL + i * (bw + gap) + gap / 2
        const by = padT + innerH - h
        return (
          <g key={i}>
            {d.value > 0 && (
              <rect x={bx} y={by} width={bw} height={h} rx={3} fill={color} opacity={0.85} />
            )}
            {d.value > 0 && (
              <text
                x={bx + bw / 2}
                y={by - 4}
                textAnchor="middle"
                className="fill-slate-600 text-[9px] font-semibold"
              >
                {d.value}
              </text>
            )}
            <text
              x={bx + bw / 2}
              y={H - 8}
              textAnchor="middle"
              className="fill-slate-400 text-[9px]"
            >
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Barras "antes vs ahora" por factor (escala 0–3)
// ---------------------------------------------------------------------------
export function FactorBars({
  factors,
}: {
  factors: { name: string; first: number; last: number; delta: number }[]
}) {
  return (
    <div className="space-y-3">
      {factors.map((f) => {
        const up = f.delta > 0.01
        const down = f.delta < -0.01
        const barColor = up ? "bg-emerald-500" : down ? "bg-red-500" : "bg-slate-400"
        return (
          <div key={f.name} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{f.name}</span>
              <span
                className={
                  up
                    ? "font-semibold text-emerald-600"
                    : down
                      ? "font-semibold text-red-600"
                      : "text-muted-foreground font-medium"
                }
              >
                {up ? "▲" : down ? "▼" : "▬"} {f.first.toFixed(1)} → {f.last.toFixed(1)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${barColor} transition-all`}
                  style={{ width: `${(f.last / 3) * 100}%` }}
                />
              </div>
              <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">
                {f.delta >= 0 ? "+" : ""}
                {f.delta.toFixed(1)}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
