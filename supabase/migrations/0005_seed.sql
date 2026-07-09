-- =============================================================================
-- Desafío Fenner · 0005 · Datos semilla (áreas, rúbrica, premios, catálogos)
-- =============================================================================

-- ---- Áreas -----------------------------------------------------------------
insert into public.areas (slug, name, description, order_index) values
  ('academica',  'Responsabilidad Académica', 'Asistencia, puntualidad, trabajo y entregas.', 1),
  ('convivencia','Convivencia y Respeto',     'Incidencias, participación e inicio de clases.', 2),
  ('espacios',   'Cuidado de Espacios',       'Limpieza, orden, energía y mobiliario.', 3),
  ('tecnologia', 'Autonomía y Uso Responsable de Tecnología', 'Materiales, EPP y normas de taller.', 4),
  ('pertenencia','Sentido de Pertenencia',    'Uso correcto del uniforme.', 5),
  ('residencia', 'Convivencia en la Residencia', 'Conflictos, horarios y asistencia del internado.', 6)
on conflict (slug) do nothing;

-- ---- Roles evaluadores por área -------------------------------------------
update public.areas set order_index = order_index;  -- no-op para claridad

-- ---- Indicadores (rúbrica 0-3) — solo si la tabla está vacía ---------------
do $$
declare
  a_academica  uuid := (select id from public.areas where slug='academica');
  a_conviv     uuid := (select id from public.areas where slug='convivencia');
  a_espacios   uuid := (select id from public.areas where slug='espacios');
  a_tec        uuid := (select id from public.areas where slug='tecnologia');
  a_pert       uuid := (select id from public.areas where slug='pertenencia');
  a_resid      uuid := (select id from public.areas where slug='residencia');
begin
  if (select count(*) from public.indicators) > 0 then return; end if;

  insert into public.indicators (area_id, name, level_0_desc, level_1_desc, level_2_desc, level_3_desc, allowed_roles, order_index) values
  -- Responsabilidad Académica
  (a_academica, 'Asistencia semanal del curso', 'Menos del 89,9%', '90%–94,9%', '95%–99,9%', '100% de asistencia', '{profesor,inspectoria}', 1),
  (a_academica, 'Puntualidad al ingresar a clases', 'Menos del 85% puntual', '85%–89,9%', '90%–94,9%', '95% o más', '{profesor,inspectoria}', 2),
  (a_academica, 'Trabajo en clases', 'Menos del 50% completa', '50–74%', '75–89%', '95% o más', '{profesor}', 3),
  (a_academica, 'Entrega de trabajos', 'Menos del 50% en plazo', '50–74%', '75–89%', '95% o más', '{profesor}', 4),
  (a_academica, 'Asistencia a evaluaciones', 'Menos del 85% rinde en fecha', '85–89,9%', '90–94,9%', '95% o más', '{profesor}', 5),

  -- Convivencia y Respeto
  (a_conviv, 'Incidencias negativas semanales', '5 o más estudiantes', '3–4 estudiantes', '1–2 estudiantes', 'Ninguna', '{convivencia,profesor,inspectoria}', 1),
  (a_conviv, 'Incidencias positivas semanales', 'Ninguna', '1–2 estudiantes', '3–4 estudiantes', '5 o más estudiantes', '{convivencia,profesor,inspectoria}', 2),
  (a_conviv, 'Participación activa', 'Menos de 10 participan', '10–20', '21–30', '31 o más', '{profesor,convivencia}', 3),
  (a_conviv, 'Inicio de la clase', 'Después de 15 min', 'Entre 10 y 14 min', 'Entre 5 y 9 min', 'Antes de 5 min', '{profesor}', 4),
  (a_conviv, 'Interrupciones por desorden', '3 o más', '2', '1', 'Ninguna', '{profesor,convivencia}', 5),

  -- Cuidado de Espacios
  (a_espacios, 'Limpieza del aula', 'Más de 10 residuos', '6–10 residuos', '1–5 residuos en el suelo', 'Ningún residuo', '{profesor,inspectoria}', 1),
  (a_espacios, 'Mesas y sillas ordenadas', 'Menos del 50% ordenadas', '50–74%', '75–89%', '90% o más', '{profesor,inspectoria}', 2),
  (a_espacios, 'Orden en talleres', 'Menos del 50% guardado', '50–74%', '75–89%', '90% o más', '{profesor,inspectoria}', 3),
  (a_espacios, 'Eficiencia energética', 'Nunca se apagan equipos', 'Se apagan ocasionalmente', 'Se apagan casi siempre', 'Siempre se apagan', '{profesor,inspectoria}', 4),
  (a_espacios, 'Daños al mobiliario', '3 o más daños', '2 daños', '1 daño', 'Ningún daño', '{profesor,inspectoria}', 5),

  -- Autonomía y Tecnología
  (a_tec, 'Materiales y EPP', 'Menos de 15 los traen', '16–25', '26–35', '36 o más', '{profesor}', 1),
  (a_tec, 'Inicio oportuno de actividades', 'Menos del 50% inicia', '50–74%', '75–89%', '90% o más', '{profesor}', 2),
  (a_tec, 'Normas de laboratorio/taller', '3 o más incumplimientos', '2', '1', 'Ningún incumplimiento', '{profesor}', 3),

  -- Sentido de Pertenencia
  (a_pert, 'Uso de uniforme completo', 'Menos del 70% completo', '70%–84% completo', '85%–94% completo', '95% o más correcto', '{inspectoria,convivencia}', 1),

  -- Convivencia en la Residencia
  (a_resid, 'Resolución de conflictos', '3 o más incidentes', '2', '1', 'Ninguno', '{residencia}', 1),
  (a_resid, 'Cumplimiento de horarios', 'Menos del 60% cumple', '60–79%', '80–94%', '95% o más', '{residencia}', 2),
  (a_resid, 'Asistencia de internado por curso', 'Menos del 89,9%', '90%–94,9%', '95%–99,9%', '100% de asistencia', '{residencia}', 3);
end $$;

-- ---- Semestre activo -------------------------------------------------------
insert into public.semesters (name, year, start_date, end_date, active)
select 'Semestre 2 · 2026', 2026, date '2026-07-28', date '2026-10-30', true
where not exists (select 1 from public.semesters where active);

-- ---- Cursos de 2° medio ----------------------------------------------------
insert into public.courses (name, level, letter) values
  ('2°A', '2° Medio', 'A'),
  ('2°B', '2° Medio', 'B'),
  ('2°C', '2° Medio', 'C'),
  ('2°D', '2° Medio', 'D'),
  ('2°E', '2° Medio', 'E'),
  ('2°F', '2° Medio', 'F')
on conflict (name) do nothing;

-- ---- Premios / canjes (XP) -------------------------------------------------
do $$
begin
  if (select count(*) from public.rewards) > 0 then return; end if;
  insert into public.rewards (name, description, tier, xp_cost, monthly_limit) values
    ('Recreo extendido',       'Recreo extendido para el curso.',                'basico',    200, 6),
    ('Juegos de mesa en clases','Juegos de mesa en horario de clases.',          'medio',     600, 2),
    ('Día sin uniforme',       'Jornada sin uniforme para el curso.',            'medio',     600, 2),
    ('Chocolatada',            'Chocolatada para el curso.',                     'avanzado', 1500, 1),
    ('Película en sala',       'Película en sala para el curso.',                'avanzado', 1500, 1),
    ('Completada al curso',    'Gran premio: completada / salida especial.',     'alto',     2500, 1);
end $$;

-- ---- Catálogo de penalizaciones -------------------------------------------
do $$
begin
  if (select count(*) from public.penalty_catalog) > 0 then return; end if;
  insert into public.penalty_catalog (name, description, points, min_points, max_points) values
    ('Atrasos reiterados', 'Atrasos reiterados (+10 semanal).', -10, null, null),
    ('Anotación negativa', 'Anotación negativa.', -10, null, null),
    ('Falta leve', 'Falta leve.', -100, null, null),
    ('Falta grave', 'Falta grave.', -300, null, null),
    ('Falta gravísima', 'Falta gravísima.', -500, null, null),
    ('Incumplimiento normas internado', 'Incumplimiento de normas del internado.', -100, -300, -100),
    ('Conductas de riesgo en residencia', 'Conductas de riesgo o conflictos en residencia.', -300, -500, -300);
end $$;
