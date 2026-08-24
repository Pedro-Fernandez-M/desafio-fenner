"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Download, Loader2 } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { ROLE_LABELS, type Role } from "@/lib/constants"
import { Button } from "@/components/ui/button"

const REGISTER_ROLES: Role[] = [
  "profesor",
  "convivencia",
  "inspectoria",
  "residencia",
]

function mondayOf(d: Date) {
  const m = new Date(d)
  m.setHours(0, 0, 0, 0)
  m.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return m
}
function iso(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10)
}
const esc = (v: string | number) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

type DetailRow = {
  id: string
  class_date: string
  block: number | null
  subject: string | null
  note: string | null
  created_at: string
  courses: { name: string } | null
  evaluator: { full_name: string; role: string } | null
  class_evaluation_scores: { count: number }[]
}

export function HistorialExport() {
  const [loading, setLoading] = useState(false)

  async function handleExport() {
    setLoading(true)
    try {
      const supabase = createClient()

      // Perfiles que deberían registrar
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, active")
        .in("role", REGISTER_ROLES)
        .order("full_name")

      // TODOS los registros (paginado para superar el tope de 1000)
      const details: DetailRow[] = []
      const PAGE = 1000
      for (let from = 0; ; from += PAGE) {
        const { data } = await supabase
          .from("class_evaluations")
          .select(
            "id, class_date, block, subject, note, created_at, courses(name), evaluator:profiles!class_evaluations_evaluator_id_fkey(full_name, role), class_evaluation_scores(count)"
          )
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1)
        const chunk = (data ?? []) as unknown as DetailRow[]
        details.push(...chunk)
        if (chunk.length < PAGE) break
      }

      const monday = iso(mondayOf(new Date()))
      const friday = iso(
        new Date(mondayOf(new Date()).getTime() + 4 * 86400000)
      )

      // Índice por evaluador (nombre → conteos)
      type Agg = { total: number; week: number; last: string | null }
      const agg = new Map<string, Agg>()
      for (const d of details) {
        const name = d.evaluator?.full_name ?? "—"
        const a = agg.get(name) ?? { total: 0, week: 0, last: null }
        a.total++
        if (d.class_date >= monday && d.class_date <= friday) a.week++
        if (!a.last || d.created_at > a.last) a.last = d.created_at
        agg.set(name, a)
      }

      // ---- Hoja 1: Resumen ----
      const resumen = (profiles ?? [])
        .map((p) => {
          const a = agg.get(p.full_name) ?? { total: 0, week: 0, last: null }
          return {
            nombre: p.full_name,
            correo: p.email ?? "",
            rol: ROLE_LABELS[p.role as Role] ?? p.role,
            grupo: p.role === "profesor" ? "Profesores" : "Convivencia",
            semana: a.week,
            total: a.total,
            ultimo: a.last
              ? new Date(a.last).toLocaleString("es-CL", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "— sin registros —",
            activo: p.active ? "Sí" : "No",
          }
        })
        .sort((x, y) => x.total - y.total || x.nombre.localeCompare(y.nombre))

      const resHead = [
        "Nombre",
        "Correo",
        "Rol",
        "Grupo",
        "Registros esta semana",
        "Registros total",
        "Último registro",
        "Activo",
      ]
      const resBody = resumen
        .map(
          (r) => `<tr>
            <td>${esc(r.nombre)}</td><td>${esc(r.correo)}</td>
            <td>${esc(r.rol)}</td><td>${esc(r.grupo)}</td>
            <td>${r.total === 0 ? '<b style="color:#c0392b">0</b>' : r.total}</td>
            <td>${r.total}</td><td>${esc(r.ultimo)}</td><td>${r.activo}</td>
          </tr>`
        )
        .join("")

      // ---- Hoja 2: Detalle (todos los registros) ----
      const detHead = [
        "Fecha clase",
        "Fecha/hora registro",
        "Nombre",
        "Rol",
        "Curso",
        "Asignatura",
        "Bloque",
        "N° indicadores",
        "Observación",
      ]
      const detBody = details
        .map((d) => {
          const n = d.class_evaluation_scores?.[0]?.count ?? 0
          return `<tr>
            <td>${esc(d.class_date)}</td>
            <td>${esc(new Date(d.created_at).toLocaleString("es-CL"))}</td>
            <td>${esc(d.evaluator?.full_name ?? "—")}</td>
            <td>${esc(ROLE_LABELS[(d.evaluator?.role ?? "") as Role] ?? d.evaluator?.role ?? "")}</td>
            <td>${esc(d.courses?.name ?? "—")}</td>
            <td>${esc(d.subject ?? "")}</td>
            <td>${d.block ?? ""}</td>
            <td>${n}</td>
            <td>${esc(d.note ?? "")}</td>
          </tr>`
        })
        .join("")

      const th = (cols: string[]) =>
        `<tr>${cols
          .map((h) => `<th style="background:#1e40af;color:#fff">${h}</th>`)
          .join("")}</tr>`

      const html = `﻿<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">
        <xml><x:ExcelWorkbook><x:ExcelWorksheets>
          <x:ExcelWorksheet><x:Name>Resumen</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>
          <x:ExcelWorksheet><x:Name>Detalle</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>
        </x:ExcelWorksheets></x:ExcelWorkbook></xml>
        </head><body>
        <table border="1"><thead>${th(resHead)}</thead><tbody>${resBody}</tbody></table>
        <table border="1"><thead>${th(detHead)}</thead><tbody>${detBody}</tbody></table>
        </body></html>`

      const blob = new Blob([html], {
        type: "application/vnd.ms-excel;charset=utf-8",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `desafio-fenner-registros-${iso(new Date())}.xls`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success(`Excel descargado (${details.length} registros).`)
    } catch {
      toast.error("No se pudo generar el Excel.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" onClick={handleExport} disabled={loading}>
      {loading ? (
        <Loader2 className="mr-2 size-4 animate-spin" />
      ) : (
        <Download className="mr-2 size-4" />
      )}
      Descargar Excel
    </Button>
  )
}
