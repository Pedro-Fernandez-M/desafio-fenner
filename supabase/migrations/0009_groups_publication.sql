-- =============================================================================
-- Desafío Fenner · 0009 · Grupos de indicadores + publicación semanal
-- =============================================================================
-- Nuevo flujo:
--   * Cada indicador se ASIGNA a un grupo: 'profesores' o 'convivencia'.
--     El administrador puede reasignarlos desde el panel.
--   * Ambos grupos registran DIARIAMENTE (profesores por clase/asignatura;
--     convivencia a cualquier hora). El promedio semanal por indicador genera
--     los puntos (mecánica de class_week_totals ya existente).
--   * El ranking que ven profesores/convivencia es el ÚLTIMO PUBLICADO.
--     La publicación ocurre los VIERNES 12:00 (America/Santiago) vía pg_cron,
--     o manualmente por el administrador. El admin siempre ve el en-vivo.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Grupo por indicador
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.indicator_group as enum ('profesores', 'convivencia');
exception when duplicate_object then null; end $$;

alter table public.indicators
  add column if not exists assigned_group public.indicator_group not null default 'profesores';

-- Asignación inicial: lo que era "por clase" → profesores; lo semanal → convivencia.
update public.indicators set assigned_group = 'profesores'  where frequency = 'clase';
update public.indicators set assigned_group = 'convivencia' where frequency = 'semanal';

-- ---------------------------------------------------------------------------
-- Snapshots de publicación del ranking
-- ---------------------------------------------------------------------------
create table if not exists public.ranking_snapshots (
  id           uuid primary key default gen_random_uuid(),
  semester_id  uuid not null references public.semesters(id) on delete cascade,
  week_number  int  not null,
  published_at timestamptz not null default now(),
  published_by uuid references public.profiles(id) on delete set null,
  constraint ranking_snapshots_unique unique (semester_id, week_number)
);

create table if not exists public.ranking_snapshot_rows (
  id            uuid primary key default gen_random_uuid(),
  snapshot_id   uuid not null references public.ranking_snapshots(id) on delete cascade,
  course_id     uuid not null references public.courses(id) on delete cascade,
  general_total int not null default 0,
  xp_earned     int not null default 0,
  xp_spent      int not null default 0,
  xp_available  int not null default 0,
  position      int not null,
  constraint snapshot_rows_unique unique (snapshot_id, course_id)
);
create index if not exists snapshot_rows_snapshot_idx
  on public.ranking_snapshot_rows (snapshot_id);

alter table public.ranking_snapshots     enable row level security;
alter table public.ranking_snapshot_rows enable row level security;

drop policy if exists snapshots_select on public.ranking_snapshots;
create policy snapshots_select on public.ranking_snapshots
  for select to authenticated using (true);
drop policy if exists snapshot_rows_select on public.ranking_snapshot_rows;
create policy snapshot_rows_select on public.ranking_snapshot_rows
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- RPC: publish_ranking  (snapshot del estado actual; sobreescribe la semana)
--   Admin desde la app, o pg_cron (auth.uid() null) desde el servidor.
-- ---------------------------------------------------------------------------
create or replace function public.publish_ranking()
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_sem  public.semesters%rowtype;
  v_week int;
  v_id   uuid;
begin
  if v_uid is not null and not public.is_admin() then
    raise exception 'Solo el administrador puede publicar el ranking';
  end if;

  select * into v_sem from public.semesters where active limit 1;
  if v_sem.id is null then raise exception 'No hay semestre activo'; end if;

  v_week := public.semester_week_number(
    v_sem.start_date,
    (now() at time zone 'America/Santiago')::date
  );

  -- Republicar la misma semana reemplaza el snapshot anterior.
  delete from public.ranking_snapshots
  where semester_id = v_sem.id and week_number = v_week;

  insert into public.ranking_snapshots (semester_id, week_number, published_by)
  values (v_sem.id, v_week, v_uid)
  returning id into v_id;

  insert into public.ranking_snapshot_rows
    (snapshot_id, course_id, general_total, xp_earned, xp_spent, xp_available, position)
  select
    v_id,
    c.id,
    coalesce(cs.general_total, 0),
    coalesce(cs.xp_earned, 0),
    coalesce(cs.xp_spent, 0),
    coalesce(cs.xp_available, 0),
    rank() over (order by coalesce(cs.general_total, 0) desc)
  from public.courses c
  left join public.course_standings cs
    on cs.course_id = c.id and cs.semester_id = v_sem.id
  where c.active;

  return v_id;
end;
$$;

grant execute on function public.publish_ranking() to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: try_scheduled_publish  (guardia horaria para el cron)
--   Publica solo si en Chile es viernes y son las 12:00-13:59, y la semana
--   actual aún no tiene snapshot. Idempotente.
-- ---------------------------------------------------------------------------
create or replace function public.try_scheduled_publish()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_local timestamptz := now();
  v_chile timestamp := now() at time zone 'America/Santiago';
  v_sem   public.semesters%rowtype;
  v_week  int;
begin
  if extract(isodow from v_chile) <> 5 then return; end if;
  if extract(hour from v_chile) < 12 or extract(hour from v_chile) >= 14 then return; end if;

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

-- ---------------------------------------------------------------------------
-- Programación con pg_cron: viernes 15:00 y 16:00 UTC (cubre 12:00 en Chile
-- con y sin horario de verano). La guardia horaria evita dobles publicaciones.
-- ---------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'desafio-fenner-publicacion',
    '0 15,16 * * 5',
    $cron$ select public.try_scheduled_publish(); $cron$
  );
exception when others then
  raise notice 'pg_cron no disponible (%): habilita la extensión pg_cron en Database → Extensions, o publica manualmente desde Administración.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- submit_class_evaluation: ahora valida por GRUPO asignado
--   profesor  -> indicadores del grupo 'profesores'
--   convivencia / inspectoria / residencia / direccion -> grupo 'convivencia'
--   administrador -> cualquiera
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
    v_group := null;  -- puede registrar cualquiera
  else
    raise exception 'Rol no autorizado para registrar';
  end if;

  select * into v_sem from public.semesters where active limit 1;
  if v_sem.id is null then raise exception 'No hay semestre activo'; end if;

  if p_scores is null or jsonb_array_length(p_scores) = 0 then
    raise exception 'Debes registrar al menos un indicador';
  end if;

  -- Todos los indicadores deben estar activos y pertenecer al grupo del rol.
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
    insert into public.class_evaluations
      (course_id, semester_id, evaluator_id, class_date, block, subject, week_number, note)
    values
      (p_course_id, v_sem.id, v_uid, p_class_date, p_block, p_subject, v_week, p_note)
    returning id into v_eval_id;
  else
    delete from public.class_evaluation_scores where class_evaluation_id = v_eval_id;
    update public.class_evaluations
      set subject = p_subject, note = p_note
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

  -- Promedio semanal por indicador → puntos → delta al ledger
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
