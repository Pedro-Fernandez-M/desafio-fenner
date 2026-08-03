-- =============================================================================
-- Desafío Fenner · 0014 · Rúbrica actualizada (documento "DESAFÍO FENNER 2026")
-- =============================================================================
-- Reconstruye el set de indicadores según el documento vigente. Grupo por
-- defecto: 'profesores' (promedio del viernes) para lo observado en clase,
-- 'convivencia' (inmediato) para asistencia/incidencias/residencia. El admin
-- puede reasignar grupos en /admin/indicadores.
-- =============================================================================

-- Fin de semestre: 30 de octubre
update public.semesters set end_date = date '2026-10-30' where active;

-- Premio Alto vuelve a "Completada"
update public.rewards
set name = 'Completada', description = 'Completada para el curso.', monthly_limit = 1
where tier = 'alto';

-- Reconstrucción de indicadores (base sin evaluaciones registradas)
delete from public.indicators;

do $$
declare
  a_aca  uuid := (select id from public.areas where slug='academica');
  a_con  uuid := (select id from public.areas where slug='convivencia');
  a_esp  uuid := (select id from public.areas where slug='espacios');
  a_tec  uuid := (select id from public.areas where slug='tecnologia');
  a_res  uuid := (select id from public.areas where slug='residencia');
begin
  insert into public.indicators
    (area_id, name, level_0_desc, level_1_desc, level_2_desc, level_3_desc,
     allowed_roles, frequency, assigned_group, order_index) values

  -- Responsabilidad Académica
  (a_aca, 'Asistencia semanal del curso',
   'Menos del 89,9%', '90%–94,9%', '95%–99,9%', '100% de asistencia',
   '{convivencia,inspectoria}', 'semanal', 'convivencia', 1),
  (a_aca, 'Puntualidad al ingresar a clases',
   'Menos del 85% ingresa puntualmente', '85%–89%', '90%–94%', '95% o más',
   '{convivencia,inspectoria}', 'semanal', 'convivencia', 2),
  (a_aca, 'Trabajo en clases',
   'Menos del 85% trabaja en clases', '85%–89%', '90%–94%', '95% o más',
   '{profesor}', 'clase', 'profesores', 3),

  -- Convivencia y Respeto
  (a_con, 'Incidencias negativas semanales',
   '5 o más estudiantes', '3–4 estudiantes', '1–2 estudiantes', 'Ninguna incidencia negativa',
   '{convivencia}', 'semanal', 'convivencia', 1),
  (a_con, 'Incidencias positivas semanales',
   'Ninguna', '1–2 estudiantes', '3–4 estudiantes', '5 o más estudiantes',
   '{convivencia}', 'semanal', 'convivencia', 2),
  (a_con, 'Tiempo de inicio de la clase',
   'Después de 15 minutos', 'Entre 10 y 14 min', 'Entre 5 y 9 min', 'Antes de 5 min',
   '{profesor}', 'clase', 'profesores', 3),
  (a_con, 'Ausencia de interrupciones a la clase',
   '3 o más interrupciones', '2 interrupciones', '1 interrupción', 'Ninguna interrupción',
   '{profesor}', 'clase', 'profesores', 4),
  (a_con, 'Comunicación respetuosa',
   'Frecuentes groserías, burlas o gestos ofensivos',
   'Expresiones irrespetuosas que requieren varias intervenciones',
   'Situaciones aisladas corregidas rápidamente',
   'Comunicación respetuosa durante toda la clase',
   '{profesor}', 'clase', 'profesores', 5),

  -- Cuidado de Espacios
  (a_esp, 'Limpieza y orden del aula/taller',
   'Más de 10 residuos y desorden evidente', 'Entre 6 y 10 residuos y orden parcial',
   'Entre 1 y 5 residuos y casi ordenado', 'Sin residuos y completamente ordenado',
   '{profesor}', 'clase', 'profesores', 1),
  (a_esp, 'Daños al mobiliario',
   '3 o más daños nuevos', '2 daños nuevos', '1 daño nuevo', 'Ningún daño nuevo',
   '{profesor}', 'clase', 'profesores', 2),

  -- Autonomía (materiales, EPP, normas de taller y uniforme)
  (a_tec, 'Materiales y EPP',
   'Menos del 85% asiste con materiales y/o EPP', '85%–89%', '90%–94%', '95% o más',
   '{profesor}', 'clase', 'profesores', 1),
  (a_tec, 'Cumplimiento de normas en sala/taller',
   '3 o más incumplimientos', '2 incumplimientos', '1 incumplimiento', 'Ningún incumplimiento',
   '{profesor}', 'clase', 'profesores', 2),
  (a_tec, 'Uso del uniforme dentro del aula',
   'Menos del 80% con uniforme completo', 'Entre 80% y 84%', 'Entre 85% y 94%', '95% o más correcto',
   '{profesor}', 'clase', 'profesores', 3),

  -- Convivencia en la Residencia
  (a_res, 'Resolución de conflictos',
   '3 o más conflictos', '2 conflictos', '1 conflicto', 'Ningún conflicto interpersonal',
   '{residencia}', 'semanal', 'convivencia', 1),
  (a_res, 'Cumplimiento de horarios',
   'Menos del 60% cumple', '60–79%', '80–94%', '95% o más',
   '{residencia}', 'semanal', 'convivencia', 2),
  (a_res, 'Asistencia de internado por curso',
   'Menos del 89,9%', '90%–94,9%', '95%–99,9%', '100% de asistencia',
   '{residencia}', 'semanal', 'convivencia', 3);
end $$;
