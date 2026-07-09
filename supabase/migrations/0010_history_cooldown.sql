-- =============================================================================
-- Desafío Fenner · 0010 · Historial en tiempo real + cooldown anti-trampa
-- =============================================================================
--   * class_evaluations gana updated_at (las correcciones quedan fechadas).
--   * Cooldown: un PROFESOR no puede crear un registro NUEVO si hizo otro hace
--     menos de 15 minutos (evita inflar la semana con registros seguidos).
--     Sí puede corregir el mismo registro. Convivencia y admin están exentos
--     (convivencia registra varios cursos en una misma ronda diaria).
--   * class_evaluations entra a la publicación Realtime para el historial en vivo.
-- =============================================================================

alter table public.class_evaluations
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  alter publication supabase_realtime add table public.class_evaluations;
exception when duplicate_object then null;
end $$;

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
    -- Cooldown anti-trampa: solo para registros NUEVOS de profesores.
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

  if v_delta <> 0 then
    insert into public.score_events
      (course_id, semester_id, type, general_delta, xp_delta, description,
       reference_table, reference_id, created_by)
    values
      (p_course_id, v_sem.id, 'evaluacion', v_delta, v_delta,
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
