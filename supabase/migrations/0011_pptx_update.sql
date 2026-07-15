-- =============================================================================
-- Desafío Fenner · 0011 · Actualización según PPTX final + permisos por curso
-- =============================================================================
--   1. Puntaje doble: nivel 1/2/3 = 10/20/30 XP y 20/40/60 Puntaje General.
--   2. Publicación del ranking: LUNES en la mañana (ya no viernes).
--   3. Semestre: 03-ago-2026 → 06-nov-2026.
--   4. Rúbrica: se desactivan 'Inicio de la clase' y 'Eficiencia energética';
--      se actualizan bandas a 85/90/95%.
--   5. Premio Alto (2500 XP) pasa a ser 'Once pizza'.
--   6. teacher_courses: cada profesor solo registra los cursos que le asigne
--      el administrador (validado en el RPC, no solo en la interfaz).
--   7. Policies de lectura anónima para los marcadores públicos
--      (/puntajes publicado y /en-vivo tiempo real).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1/3. Semestre nuevo (actualiza el activo)
-- ---------------------------------------------------------------------------
update public.semesters
set start_date = date '2026-08-03', end_date = date '2026-11-06'
where active;

-- ---------------------------------------------------------------------------
-- 4. Rúbrica
-- ---------------------------------------------------------------------------
update public.indicators set active = false
where name in ('Inicio de la clase', 'Eficiencia energética');

update public.indicators set
  level_0_desc = 'Menos del 85% ingresa puntualmente',
  level_1_desc = '85%–89%', level_2_desc = '90%–94%', level_3_desc = '95% o más'
where name = 'Puntualidad al ingresar a clases';

update public.indicators set
  level_0_desc = 'Menos del 85% trabaja en clases',
  level_1_desc = '85%–89%', level_2_desc = '90%–94%', level_3_desc = '95% o más'
where name = 'Trabajo en clases';

update public.indicators set
  level_0_desc = 'Menos del 85% entrega en la fecha indicada',
  level_1_desc = '85%–89%', level_2_desc = '90%–94%', level_3_desc = '95% o más'
where name = 'Entrega de trabajos';

update public.indicators set
  level_0_desc = 'Menos del 85% asiste a la evaluación programada',
  level_1_desc = '85%–89%', level_2_desc = '90%–94%', level_3_desc = '95% o más'
where name = 'Asistencia a evaluaciones';

update public.indicators set
  level_0_desc = 'Menos del 85% participa activamente',
  level_1_desc = '85%–89%', level_2_desc = '90%–94%', level_3_desc = '95% o más'
where name = 'Participación activa';

update public.indicators set
  level_0_desc = 'Menos del 85% ordenadas al finalizar la clase',
  level_1_desc = '85%–89%', level_2_desc = '90%–99%', level_3_desc = '100%'
where name = 'Mesas y sillas ordenadas';

update public.indicators set
  level_0_desc = 'Menos del 85% de insumos y materiales ordenados',
  level_1_desc = '85%–89%', level_2_desc = '90%–99%', level_3_desc = '100%'
where name = 'Orden en talleres';

update public.indicators set
  level_0_desc = 'Menos del 85% asiste con materiales y/o EPP',
  level_1_desc = '85%–89%', level_2_desc = '90%–94%', level_3_desc = '95% o más'
where name = 'Materiales y EPP';

update public.indicators set
  level_0_desc = 'Menos del 85% inicia inmediatamente tras la instrucción',
  level_1_desc = '85%–89%', level_2_desc = '90%–94%', level_3_desc = '95% o más'
where name = 'Inicio oportuno de actividades';

update public.indicators set
  level_0_desc = '3 o más conflictos interpersonales',
  level_1_desc = '2 conflictos', level_2_desc = '1 conflicto',
  level_3_desc = 'Ningún conflicto interpersonal'
where name = 'Resolución de conflictos';

update public.indicators set
  level_0_desc = 'Menos del 85% cumple los horarios',
  level_1_desc = '85%–89%', level_2_desc = '90%–94%', level_3_desc = '95% o más'
where name = 'Cumplimiento de horarios';

-- ---------------------------------------------------------------------------
-- 5. Premio Alto → Once pizza
-- ---------------------------------------------------------------------------
update public.rewards
set name = 'Once pizza', description = 'Once con pizza para el curso.', monthly_limit = 1
where tier = 'alto';

-- ---------------------------------------------------------------------------
-- 6. Asignación profesor ↔ cursos
-- ---------------------------------------------------------------------------
create table if not exists public.teacher_courses (
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  course_id  uuid not null references public.courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (teacher_id, course_id)
);

alter table public.teacher_courses enable row level security;
drop policy if exists teacher_courses_select on public.teacher_courses;
create policy teacher_courses_select on public.teacher_courses
  for select to authenticated using (true);
drop policy if exists teacher_courses_admin on public.teacher_courses;
create policy teacher_courses_admin on public.teacher_courses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 7. Lectura anónima para marcadores públicos
-- ---------------------------------------------------------------------------
drop policy if exists courses_anon_select on public.courses;
create policy courses_anon_select on public.courses
  for select to anon using (active);

drop policy if exists standings_anon_select on public.course_standings;
create policy standings_anon_select on public.course_standings
  for select to anon using (true);

drop policy if exists semesters_anon_select on public.semesters;
create policy semesters_anon_select on public.semesters
  for select to anon using (active);

drop policy if exists snapshots_anon_select on public.ranking_snapshots;
create policy snapshots_anon_select on public.ranking_snapshots
  for select to anon using (true);

drop policy if exists snapshot_rows_anon_select on public.ranking_snapshot_rows;
create policy snapshot_rows_anon_select on public.ranking_snapshot_rows
  for select to anon using (true);

-- ---------------------------------------------------------------------------
-- 2. Publicación: lunes en la mañana (guardia 08:00–09:59 hora de Chile)
-- ---------------------------------------------------------------------------
create or replace function public.try_scheduled_publish()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_chile timestamp := now() at time zone 'America/Santiago';
  v_sem   public.semesters%rowtype;
  v_week  int;
begin
  if extract(isodow from v_chile) <> 1 then return; end if;          -- lunes
  if extract(hour from v_chile) < 8 or extract(hour from v_chile) >= 10 then return; end if;

  select * into v_sem from public.semesters where active limit 1;
  if v_sem.id is null then return; end if;

  v_week := public.semester_week_number(v_sem.start_date, v_chile::date);

  if exists (
    select 1 from public.ranking_snapshots
    where semester_id = v_sem.id and week_number = v_week
  ) then
    return;
  end if;

  perform public.publish_ranking();
end;
$$;

do $$
begin
  perform cron.unschedule('desafio-fenner-publicacion');
exception when others then null;
end $$;

do $$
begin
  create extension if not exists pg_cron;
  -- 11:00 y 12:00 UTC cubren las 08:00 de Chile con y sin horario de verano.
  perform cron.schedule(
    'desafio-fenner-publicacion',
    '0 11,12 * * 1',
    $cron$ select public.try_scheduled_publish(); $cron$
  );
exception when others then
  raise notice 'pg_cron no disponible (%): publica manualmente desde el panel.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- 1/6. RPC de registro: puntaje doble + restricción de cursos por profesor
-- ---------------------------------------------------------------------------
create or replace function public.submit_class_evaluation(
  p_course_id  uuid,
  p_class_date date,
  p_scores     jsonb,
  p_block      int  default null,
  p_subject    text default null,
  p_note       text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_role      public.user_role;
  v_group     public.indicator_group;
  v_sem       public.semesters%rowtype;
  v_week      int;
  v_eval_id   uuid;
  v_last      timestamptz;
  v_wait_min  int;
  v_new_total int;
  v_old_total int;
  v_delta     int;
  rec         jsonb;
  v_level     int;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select role into v_role from public.profiles where id = v_uid and active;
  if v_role is null then raise exception 'Perfil inactivo o inexistente'; end if;

  if v_role = 'profesor' then
    v_group := 'profesores';
    -- Solo puede registrar cursos asignados por el administrador.
    if not exists (
      select 1 from public.teacher_courses
      where teacher_id = v_uid and course_id = p_course_id
    ) then
      raise exception 'No tienes asignado este curso. Contacta al administrador.';
    end if;
  elsif v_role in ('convivencia', 'inspectoria', 'residencia', 'direccion') then
    v_group := 'convivencia';
  elsif v_role = 'administrador' then
    v_group := null;
  else
    raise exception 'Rol no autorizado para registrar';
  end if;

  select * into v_sem from public.semesters where active limit 1;
  if v_sem.id is null then raise exception 'No hay semestre activo'; end if;

  if p_scores is null or jsonb_array_length(p_scores) = 0 then
    raise exception 'Debes registrar al menos un indicador';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_scores) s
    left join public.indicators i on i.id = (s->>'indicator_id')::uuid
    where i.id is null
       or not i.active
       or (v_group is not null and i.assigned_group <> v_group)
  ) then
    raise exception 'Hay indicadores que no corresponden a tu grupo de registro';
  end if;

  v_week := public.semester_week_number(v_sem.start_date, p_class_date);

  select id into v_eval_id
  from public.class_evaluations
  where course_id = p_course_id and evaluator_id = v_uid
    and class_date = p_class_date and coalesce(block, 0) = coalesce(p_block, 0);

  if v_eval_id is null then
    if v_role = 'profesor' then
      select max(greatest(created_at, updated_at)) into v_last
      from public.class_evaluations
      where evaluator_id = v_uid;

      if v_last is not null and v_last > now() - interval '15 minutes' then
        v_wait_min := ceil(
          extract(epoch from (v_last + interval '15 minutes' - now())) / 60
        )::int;
        raise exception
          'Debes esperar % min antes de registrar otra clase (límite de 15 minutos entre registros).',
          greatest(v_wait_min, 1);
      end if;
    end if;

    insert into public.class_evaluations
      (course_id, semester_id, evaluator_id, class_date, block, subject, week_number, note)
    values
      (p_course_id, v_sem.id, v_uid, p_class_date, p_block, p_subject, v_week, p_note)
    returning id into v_eval_id;
  else
    delete from public.class_evaluation_scores where class_evaluation_id = v_eval_id;
    update public.class_evaluations
      set subject = p_subject, note = p_note, updated_at = now()
      where id = v_eval_id;
  end if;

  for rec in select * from jsonb_array_elements(p_scores)
  loop
    v_level := (rec->>'level')::int;
    if v_level < 0 or v_level > 3 then
      raise exception 'Nivel inválido: %', v_level;
    end if;
    insert into public.class_evaluation_scores
      (class_evaluation_id, indicator_id, level)
    values (v_eval_id, (rec->>'indicator_id')::uuid, v_level);
  end loop;

  -- Total semanal en XP: promedio por indicador (10/20/30).
  select coalesce(sum(public.points_for_level(round(t.avg_level)::int)), 0)
  into v_new_total
  from (
    select ces.indicator_id, avg(ces.level)::numeric as avg_level
    from public.class_evaluations ce
    join public.class_evaluation_scores ces on ces.class_evaluation_id = ce.id
    where ce.course_id = p_course_id
      and ce.semester_id = v_sem.id
      and ce.week_number = v_week
    group by ces.indicator_id
  ) t;

  select total_points into v_old_total
  from public.class_week_totals
  where course_id = p_course_id and semester_id = v_sem.id and week_number = v_week;
  v_old_total := coalesce(v_old_total, 0);

  v_delta := v_new_total - v_old_total;

  -- Puntaje doble: General = 2 × XP.
  if v_delta <> 0 then
    insert into public.score_events
      (course_id, semester_id, type, general_delta, xp_delta, description,
       reference_table, reference_id, created_by)
    values
      (p_course_id, v_sem.id, 'evaluacion', v_delta * 2, v_delta,
       'Registros semana ' || v_week || ' (promedio)', 'class_week_totals', null, v_uid);
  end if;

  insert into public.class_week_totals as cwt
    (course_id, semester_id, week_number, total_points, updated_at)
  values (p_course_id, v_sem.id, v_week, v_new_total, now())
  on conflict (course_id, semester_id, week_number) do update
    set total_points = excluded.total_points, updated_at = now();

  return v_eval_id;
end;
$$;
