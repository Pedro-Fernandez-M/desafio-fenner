-- =============================================================================
-- Desafío Fenner · 0008 · Evaluación por clase + promedio semanal
-- =============================================================================
-- Cambio de modelo:
--   * Cada indicador tiene una FRECUENCIA: 'clase' (lo registra el profesor de
--     asignatura en cada bloque) o 'semanal' (una vez por semana: asistencia,
--     atrasos, incidencias, uniforme, residencia...).
--   * Los registros por clase NO suman puntos directamente. El sistema promedia
--     los niveles de todas las clases de la semana por indicador y ese promedio
--     (redondeado) genera los puntos (10/20/30), recalculados en vivo con cada
--     registro. Así se conserva la economía de premios del documento.
--   * class_week_totals guarda el total semanal vigente por curso; cada registro
--     publica en el ledger solo el DELTA respecto del total anterior.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Frecuencia de indicadores
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.indicator_frequency as enum ('clase', 'semanal');
exception when duplicate_object then null; end $$;

alter table public.indicators
  add column if not exists frequency public.indicator_frequency not null default 'semanal';

update public.indicators set frequency = 'clase'
where name in (
  'Trabajo en clases',
  'Participación activa',
  'Inicio de la clase',
  'Interrupciones por desorden',
  'Limpieza del aula',
  'Mesas y sillas ordenadas',
  'Orden en talleres',
  'Eficiencia energética',
  'Daños al mobiliario',
  'Materiales y EPP',
  'Inicio oportuno de actividades',
  'Normas de laboratorio/taller'
);

-- ---------------------------------------------------------------------------
-- Registro por clase
-- ---------------------------------------------------------------------------
create table if not exists public.class_evaluations (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses(id) on delete cascade,
  semester_id  uuid not null references public.semesters(id) on delete restrict,
  evaluator_id uuid not null references public.profiles(id) on delete cascade,
  class_date   date not null default current_date,
  block        smallint,               -- bloque horario opcional (1..10)
  subject      text,                   -- asignatura opcional
  week_number  int  not null,
  note         text,
  created_at   timestamptz not null default now(),
  constraint class_evaluations_block_range check (block is null or block between 1 and 10)
);
create index if not exists class_evals_course_week_idx
  on public.class_evaluations (course_id, semester_id, week_number);
-- Un registro por profesor/curso/día/bloque (bloque nulo cuenta como 0)
create unique index if not exists class_evals_slot
  on public.class_evaluations (course_id, evaluator_id, class_date, coalesce(block, 0));

create table if not exists public.class_evaluation_scores (
  id                  uuid primary key default gen_random_uuid(),
  class_evaluation_id uuid not null references public.class_evaluations(id) on delete cascade,
  indicator_id        uuid not null references public.indicators(id) on delete restrict,
  level               smallint not null,
  constraint ces_level_range check (level between 0 and 3),
  constraint ces_unique unique (class_evaluation_id, indicator_id)
);
create index if not exists ces_eval_idx
  on public.class_evaluation_scores (class_evaluation_id);

-- Total semanal vigente (para publicar deltas en el ledger)
create table if not exists public.class_week_totals (
  course_id    uuid not null references public.courses(id) on delete cascade,
  semester_id  uuid not null references public.semesters(id) on delete cascade,
  week_number  int  not null,
  total_points int  not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (course_id, semester_id, week_number)
);

-- RLS
alter table public.class_evaluations       enable row level security;
alter table public.class_evaluation_scores enable row level security;
alter table public.class_week_totals       enable row level security;

drop policy if exists class_evals_select on public.class_evaluations;
create policy class_evals_select on public.class_evaluations
  for select to authenticated using (true);
drop policy if exists class_evals_admin on public.class_evaluations;
create policy class_evals_admin on public.class_evaluations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists ces_select on public.class_evaluation_scores;
create policy ces_select on public.class_evaluation_scores
  for select to authenticated using (true);
drop policy if exists ces_admin on public.class_evaluation_scores;
create policy ces_admin on public.class_evaluation_scores
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists cwt_select on public.class_week_totals;
create policy cwt_select on public.class_week_totals
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Semana del semestre para una fecha (lunes a domingo)
-- ---------------------------------------------------------------------------
create or replace function public.semester_week_number(p_start date, p_date date)
returns int language sql immutable as $$
  select greatest(
    1,
    (floor((p_date - (p_start - (extract(isodow from p_start)::int - 1)))::numeric / 7) + 1)::int
  );
$$;

-- ---------------------------------------------------------------------------
-- RPC: submit_class_evaluation
--   Registra (o corrige) la pauta de UNA clase y recalcula el total semanal
--   del curso como: sum( points( round( avg(level) sobre las clases de la
--   semana ) ) ) por indicador. Publica el delta en el ledger.
--   p_scores: [{ "indicator_id": uuid, "level": 0..3 }, ...] (subconjunto:
--   el profesor omite los indicadores que no aplican a su clase).
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
  if v_role not in ('profesor', 'administrador') then
    raise exception 'Solo profesores pueden registrar evaluación por clase';
  end if;

  select * into v_sem from public.semesters where active limit 1;
  if v_sem.id is null then raise exception 'No hay semestre activo'; end if;

  if p_scores is null or jsonb_array_length(p_scores) = 0 then
    raise exception 'Debes registrar al menos un indicador';
  end if;

  -- Validar que todos los indicadores sean de frecuencia 'clase' y estén activos
  if exists (
    select 1 from jsonb_array_elements(p_scores) s
    left join public.indicators i on i.id = (s->>'indicator_id')::uuid
    where i.id is null or i.frequency <> 'clase' or not i.active
  ) then
    raise exception 'Hay indicadores inválidos para el registro por clase';
  end if;

  v_week := public.semester_week_number(v_sem.start_date, p_class_date);

  -- Buscar registro existente del mismo profesor/curso/día/bloque
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

  -- Recalcular el total semanal: promedio por indicador sobre todas las clases
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
       'Clases semana ' || v_week || ' (promedio)', 'class_week_totals', null, v_uid);
  end if;

  insert into public.class_week_totals as cwt
    (course_id, semester_id, week_number, total_points, updated_at)
  values (p_course_id, v_sem.id, v_week, v_new_total, now())
  on conflict (course_id, semester_id, week_number) do update
    set total_points = excluded.total_points, updated_at = now();

  return v_eval_id;
end;
$$;

grant execute on function public.submit_class_evaluation(uuid, date, jsonb, int, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- La evaluación SEMANAL ahora solo acepta indicadores de frecuencia 'semanal'
-- (se redefine submit_evaluation agregando esa validación).
-- ---------------------------------------------------------------------------
create or replace function public.submit_evaluation(
  p_course_id   uuid,
  p_area_id     uuid,
  p_semester_id uuid,
  p_week_number int,
  p_week_start  date,
  p_scores      jsonb,
  p_note        text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_eval_id    uuid;
  v_prev_total int := 0;
  v_new_total  int := 0;
  v_role       public.user_role;
  v_uid        uuid := auth.uid();
  rec          jsonb;
  v_level      int;
  v_pts        int;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select role into v_role from public.profiles where id = v_uid and active;
  if v_role is null then
    raise exception 'Perfil inactivo o inexistente';
  end if;

  if v_role <> 'administrador' then
    if not exists (
      select 1 from public.indicators i
      where i.area_id = p_area_id and i.active and v_role = any(i.allowed_roles)
    ) then
      raise exception 'El rol % no puede evaluar esta área', v_role;
    end if;
  end if;

  -- Solo indicadores semanales activos
  if exists (
    select 1 from jsonb_array_elements(p_scores) s
    left join public.indicators i on i.id = (s->>'indicator_id')::uuid
    where i.id is null or i.frequency <> 'semanal' or not i.active
  ) then
    raise exception 'La evaluación semanal solo acepta indicadores de frecuencia semanal';
  end if;

  select id, total_points into v_eval_id, v_prev_total
  from public.evaluations
  where course_id = p_course_id and area_id = p_area_id
    and semester_id = p_semester_id and week_number = p_week_number;

  if v_eval_id is null then
    insert into public.evaluations
      (course_id, area_id, semester_id, week_number, week_start, evaluator_id, note)
    values
      (p_course_id, p_area_id, p_semester_id, p_week_number, p_week_start, v_uid, p_note)
    returning id into v_eval_id;
  else
    if v_prev_total <> 0 then
      insert into public.score_events
        (course_id, semester_id, type, general_delta, xp_delta, description, reference_table, reference_id, created_by)
      values
        (p_course_id, p_semester_id, 'evaluacion', -v_prev_total, -v_prev_total,
         'Corrección de evaluación', 'evaluations', v_eval_id, v_uid);
    end if;
    delete from public.evaluation_scores where evaluation_id = v_eval_id;
    update public.evaluations
      set evaluator_id = v_uid, note = p_note, updated_at = now(), week_start = p_week_start
      where id = v_eval_id;
  end if;

  for rec in select * from jsonb_array_elements(p_scores)
  loop
    v_level := (rec->>'level')::int;
    if v_level < 0 or v_level > 3 then
      raise exception 'Nivel inválido: %', v_level;
    end if;
    v_pts := public.points_for_level(v_level);
    v_new_total := v_new_total + v_pts;
    insert into public.evaluation_scores (evaluation_id, indicator_id, level, points)
    values (v_eval_id, (rec->>'indicator_id')::uuid, v_level, v_pts);
  end loop;

  update public.evaluations set total_points = v_new_total, updated_at = now()
  where id = v_eval_id;

  if v_new_total <> 0 then
    insert into public.score_events
      (course_id, semester_id, type, general_delta, xp_delta, description, reference_table, reference_id, created_by)
    values
      (p_course_id, p_semester_id, 'evaluacion', v_new_total, v_new_total,
       'Evaluación semana ' || p_week_number, 'evaluations', v_eval_id, v_uid);
  end if;

  return v_eval_id;
end;
$$;
