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
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export function HistorialExport() {
  const [loading, setLoading] = useState(false)

  async function handleExport() {
    setLoading(true)
    try {
      const supabase = createClient()

      const [{ data: profiles }, { data: evals }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, role, active")
          .in("role", REGISTER_ROLES)
          .order("full_name"),
        supabase
          .from("class_evaluations")
          .select("evaluator_id, class_date, created_at"),
      ])

      const monday = iso(mondayOf(new Date()))
      const friday = iso(
        new Date(mondayOf(new Date()).getTime() + 4 * 86400000)
      )

      type Agg = { total: number; week: number; last: string | null }
      const agg = new Map<string, Agg>()
      for (const e of evals ?? []) {
        const a = agg.get(e.evaluator_id) ?? { total: 0, week: 0, last: null }
        a.total++
        if (e.class_date >= monday && e.class_date <= friday) a.week++
        if (!a.last || e.created_at > a.last) a.last = e.created_at
        agg.set(e.evaluator_id, a)
      }

      const rows = (profiles ?? []).map((p) => {
        const a = agg.get(p.id) ?? { total: 0, week: 0, last: null }
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

      // Orden: primero quienes NO han registrado esta semana
      rows.sort(
        (x, y) => x.semana - y.semana || x.nombre.localeCompare(y.nombre)
      )

      const header = [
        "Nombre",
        "Correo",
        "Rol",
        "Grupo",
        "Registros esta semana",
        "Registros total",
        "Último registro",
        "Activo",
      ]
      const body = rows
        .map(
          (r) => `<tr>
            <td>${esc(r.nombre)}</td>
            <td>${esc(r.correo)}</td>
            <td>${esc(r.rol)}</td>
            <td>${esc(r.grupo)}</td>
            <td>${r.semana === 0 ? '<b style="color:#c0392b">0</b>' : r.semana}</td>
            <td>${r.total}</td>
            <td>${esc(r.ultimo)}</td>
            <td>${r.activo}</td>
          </tr>`
        )
        .join("")

      const table = `<table border="1"><thead><tr>${header
        .map((h) => `<th style="background:#1e40af;color:#fff">${h}</th>`)
        .join("")}</tr></thead><tbody>${body}</tbody></table>`

      const html = `﻿<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>
        <h3>Desafío Fenner — Registros por persona</h3>
        <p>Generado: ${new Date().toLocaleString("es-CL")} · Semana: ${monday} al ${friday}</p>
        ${table}</body></html>`

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
      toast.success("Excel descargado.")
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
