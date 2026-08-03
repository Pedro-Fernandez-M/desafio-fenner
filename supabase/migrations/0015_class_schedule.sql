-- =============================================================================
-- Desafío Fenner · 0015 · Horario de clases (registro solo de clases reales)
-- =============================================================================
-- Cada profesor solo puede registrar las clases que tiene según su horario
-- (curso + día de la semana + asignatura). El profesor ya no elige fecha libre:
-- la interfaz le muestra sus clases de la semana actual. Un profesor sin horario
-- cargado conserva el registro libre (para no bloquearlo).
-- =============================================================================

create table if not exists public.class_schedule (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,
  weekday     smallint not null,   -- 1=Lunes … 5=Viernes
  subject     text not null,
  created_at  timestamptz not null default now(),
  constraint class_schedule_weekday_range check (weekday between 1 and 5),
  constraint class_schedule_unique unique (teacher_id, course_id, weekday, subject)
);
create index if not exists class_schedule_teacher_idx on public.class_schedule (teacher_id);

alter table public.class_schedule enable row level security;
drop policy if exists class_schedule_select on public.class_schedule;
create policy class_schedule_select on public.class_schedule
  for select to authenticated using (true);
drop policy if exists class_schedule_admin on public.class_schedule;
create policy class_schedule_admin on public.class_schedule
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Permitir varias asignaturas el mismo día/curso (uniquedad incluye asignatura)
drop index if exists public.class_evals_slot;
create unique index if not exists class_evals_slot
  on public.class_evaluations (course_id, evaluator_id, class_date, coalesce(block, 0), coalesce(subject, ''));

-- ---------------------------------------------------------------------------
-- submit_class_evaluation: valida el horario para profesores
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
  v_cur_week  int;
  v_weekday   int;
  v_eval_id   uuid;
  v_last      timestamptz;
  v_wait_min  int;
  v_tt        int;
  v_ct        int;
  v_conviv_delta int;
  v_old_posted int;
  rec         jsonb;
  v_level     int;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select role into v_role from public.profiles where id = v_uid and active;
  if v_role is null then raise exception 'Perfil inactivo o inexistente'; end if;

  select * into v_sem from public.semesters where active limit 1;
  if v_sem.id is null then raise exception 'No hay semestre activo'; end if;

  v_week    := public.semester_week_number(v_sem.start_date, p_class_date);
  v_weekday := extract(isodow from p_class_date)::int;

  if v_role = 'profesor' then
    v_group := 'profesores';
    if not exists (
      select 1 from public.teacher_courses
      where teacher_id = v_uid and course_id = p_course_id
    ) then
      raise exception 'No tienes asignado este curso. Contacta al administrador.';
    end if;

    -- Validación de horario (solo si el profesor tiene horario cargado)
    if exists (select 1 from public.class_schedule where teacher_id = v_uid) then
      if not exists (
        select 1 from public.class_schedule
        where teacher_id = v_uid and course_id = p_course_id
          and weekday = v_weekday and subject = p_subject
      ) then
        raise exception 'Esa clase no está en tu horario para ese día.';
      end if;
      v_cur_week := public.semester_week_number(
        v_sem.start_date, (now() at time zone 'America/Santiago')::date);
      if v_week <> v_cur_week then
        raise exception 'Solo puedes registrar clases de la semana actual.';
      end if;
    end if;
  elsif v_role in ('convivencia', 'inspectoria', 'residencia', 'direccion') then
    v_group := 'convivencia';
  elsif v_role = 'administrador' then
    v_group := null;
  else
    raise exception 'Rol no autorizado para registrar';
  end if;

  if p_scores is null or jsonb_array_length(p_scores) = 0 then
    raise exception 'Debes registrar al menos un indicador';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_scores) s
    left join public.indicators i on i.id = (s->>'indicator_id')::uuid
    where i.id is null or not i.active
       or (v_group is not null and i.assigned_group <> v_group)
  ) then
    raise exception 'Hay indicadores que no corresponden a tu grupo de registro';
  end if;

  select id into v_eval_id
  from public.class_evaluations
  where course_id = p_course_id and evaluator_id = v_uid
    and class_date = p_class_date and coalesce(block, 0) = coalesce(p_block, 0)
    and coalesce(subject, '') = coalesce(p_subject, '');

  if v_eval_id is null then
    if v_role = 'profesor' then
      select max(greatest(created_at, updated_at)) into v_last
      from public.class_evaluations where evaluator_id = v_uid;
      if v_last is not null and v_last > now() - interval '15 minutes' then
        v_wait_min := ceil(extract(epoch from (v_last + interval '15 minutes' - now())) / 60)::int;
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
      set note = p_note, updated_at = now() where id = v_eval_id;
  end if;

  for rec in select * from jsonb_array_elements(p_scores)
  loop
    v_level := (rec->>'level')::int;
    if v_level < 0 or v_level > 3 then raise exception 'Nivel inválido: %', v_level; end if;
    insert into public.class_evaluation_scores (class_evaluation_id, indicator_id, level)
    values (v_eval_id, (rec->>'indicator_id')::uuid, v_level);
  end loop;

  select
    coalesce(sum(x.pts) filter (where x.grp = 'profesores'), 0),
    coalesce(sum(x.pts) filter (where x.grp = 'convivencia'), 0)
  into v_tt, v_ct
  from (
    select i.assigned_group as grp,
           public.points_for_level(round(avg(ces.level))::int) as pts
    from public.class_evaluations ce
    join public.class_evaluation_scores ces on ces.class_evaluation_id = ce.id
    join public.indicators i on i.id = ces.indicator_id
    where ce.course_id = p_course_id and ce.semester_id = v_sem.id
      and ce.week_number = v_week
    group by i.assigned_group, ces.indicator_id
  ) x;

  insert into public.class_week_totals as cwt
    (course_id, semester_id, week_number, total_points,
     teacher_points, teacher_consolidated, conviv_points, conviv_posted, updated_at)
  values (p_course_id, v_sem.id, v_week, v_tt + v_ct, v_tt, 0, v_ct, 0, now())
  on conflict (course_id, semester_id, week_number) do update
    set teacher_points = excluded.teacher_points,
        conviv_points  = excluded.conviv_points,
        total_points   = excluded.teacher_points + excluded.conviv_points,
        updated_at     = now()
  returning conviv_posted into v_old_posted;

  v_conviv_delta := v_ct - coalesce(v_old_posted, 0);
  if v_conviv_delta <> 0 then
    insert into public.score_events
      (course_id, semester_id, type, general_delta, xp_delta, description,
       reference_table, reference_id, created_by)
    values
      (p_course_id, v_sem.id, 'evaluacion', v_conviv_delta * 2, v_conviv_delta,
       'Convivencia semana ' || v_week, 'class_week_totals', null, v_uid);
    update public.class_week_totals set conviv_posted = v_ct
      where course_id = p_course_id and semester_id = v_sem.id and week_number = v_week;
  end if;

  return v_eval_id;
end;
$$;
