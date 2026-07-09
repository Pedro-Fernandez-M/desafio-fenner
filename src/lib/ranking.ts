import type { Tables } from "@/lib/database.types"

export type CourseLite = Pick<
  Tables<"courses">,
  "id" | "name" | "photo_url"
>
export type Standing = Tables<"course_standings">

export type RankRow = {
  courseId: string
  courseName: string
  coursePhoto: string | null
  general: number
  xpEarned: number
  xpSpent: number
  xpAvailable: number
  position: number
}

/**
 * Combina cursos activos con sus acumulados y calcula la posición (con empates
 * al mismo puntaje). Todo curso aparece, aunque tenga 0 puntos.
 */
export function mergeRanking(
  courses: CourseLite[],
  standings: Standing[]
): RankRow[] {
  const byCourse = new Map(standings.map((s) => [s.course_id, s]))

  const rows = courses
    .map((c) => {
      const s = byCourse.get(c.id)
      return {
        courseId: c.id,
        courseName: c.name,
        coursePhoto: c.photo_url,
        general: s?.general_total ?? 0,
        xpEarned: s?.xp_earned ?? 0,
        xpSpent: s?.xp_spent ?? 0,
        xpAvailable: s?.xp_available ?? 0,
        position: 0,
      }
    })
    .sort((a, b) => b.general - a.general || a.courseName.localeCompare(b.courseName))

  let lastPoints: number | null = null
  let lastPosition = 0
  rows.forEach((row, idx) => {
    if (row.general === lastPoints) {
      row.position = lastPosition
    } else {
      row.position = idx + 1
      lastPosition = row.position
      lastPoints = row.general
    }
  })

  return rows
}
