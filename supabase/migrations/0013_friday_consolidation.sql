-- =============================================================================
-- Desafío Fenner · 0013 · Consolidación de clases los viernes
-- =============================================================================
-- Cambio de motor:
--   * PROFESORES: sus registros por clase NO puntúan al instante. Se acumulan
--     durante la semana; el VIERNES (automático) se promedia por indicador y se
--     aplica el puntaje. También hay botón manual "Consolidar clases".
--   * CONVIVENCIA (y penalizaciones/bonos/reciclaje): automático e inmediato.
--   * class_week_totals separa ambos grupos y lleva cuánto se ha publicado al
--     ledger, para poder aplicar solo el delta (idempotente).
-- =============================================================================

alter table public.class_week_totals
  add column if not exists teacher_points       int not null default 0,
  add column if not exists teacher_consolidated  int not null default 0,
  add column if not exists conviv_points          int not null default 0,
  add column if not exists conviv_posted          int not null default 0;

-- ---------------------------------------------------------------------------
-- submit_class_evaluation: separa profesores (diferido) de convivencia (vivo)
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

  if v_role = 'profesor' then
    v_group := 'profesores';
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
      set subject = p_subject, note = p_note, updated_at = now()
      where id = v_eval_id;
  end if;

  for rec in select * from jsonb_array_elements(p_scores)
  loop
    v_level := (rec->>'level')::int;
    if v_level < 0 or v_level > 3 then raise exception 'Nivel inválido: %', v_level; end if;
    insert into public.class_evaluation_scores (class_evaluation_id, indicator_id, level)
    values (v_eval_id, (rec->>'indicator_id')::uuid, v_level);
  end loop;

  -- Promedios separados por grupo (profesores diferido, convivencia inmediato)
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

  -- Convivencia: publica el delta al instante (puntaje doble: general = 2×xp)
  v_conviv_delta := v_ct - coalesce(v_old_posted, 0);
  if v_conviv_delta <> 0 then
    insert into public.score_events
      (course_id, semester_id, type, general_delta, xp_delta, description,
       reference_table, reference_id, created_by)
    values
      (p_course_id, v_sem.id, 'evaluacion', v_conviv_delta * 2, v_conviv_delta,
       'Convivencia semana ' || v_week, 'class_week_totals', null, v_uid);
    update public.class_week_totals
      set conviv_posted = v_ct
      where course_id = p_course_id and semester_id = v_sem.id and week_number = v_week;
  end if;

  return v_eval_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- consolidate_class_scores: aplica el promedio de PROFESORES (viernes / manual)
--   Idempotente: publica solo el delta pendiente de cada semana.
-- ---------------------------------------------------------------------------
create or replace function public.consolidate_class_scores()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  r        record;
  v_delta  int;
  v_count  int := 0;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Solo el administrador puede consolidar';
  end if;

  for r in
    select * from public.class_week_totals
    where teacher_points <> teacher_consolidated
  loop
    v_delta := r.teacher_points - r.teacher_consolidated;
    insert into public.score_events
      (course_id, semester_id, type, general_delta, xp_delta, description,
       reference_table, reference_id, created_by)
    values
      (r.course_id, r.semester_id, 'evaluacion', v_delta * 2, v_delta,
       'Clases semana ' || r.week_number || ' (promedio del viernes)',
       'class_week_totals', null, auth.uid());

    update public.class_week_totals
      set teacher_consolidated = teacher_points, updated_at = now()
      where course_id = r.course_id and semester_id = r.semester_id
        and week_number = r.week_number;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.consolidate_class_scores() to authenticated;

-- ---------------------------------------------------------------------------
-- Cron: viernes ~17:00 Chile (20:00 y 21:00 UTC cubren verano/invierno)
-- ---------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('desafio-fenner-consolidacion');
exception when others then null;
end $$;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'desafio-fenner-consolidacion',
    '0 20,21 * * 5',
    $cron$ select public.consolidate_class_scores(); $cron$
  );
exception when others then
  raise notice 'pg_cron no disponible (%): consolida manualmente desde el panel.', sqlerrm;
end $$;
