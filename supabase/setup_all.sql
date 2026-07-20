-- =============================================================================
-- Desafío Fenner · 0001 · Esquema base (tipos, tablas, índices, constraints)
-- =============================================================================
-- Modelo de puntaje (decisión de diseño):
--   * Las EVALUACIONES semanales otorgan puntos por nivel de logro (1=10, 2=20,
--     3=30). Esos puntos suman TANTO al Puntaje General (ranking) COMO a los XP
--     (moneda gastable). Es la única fuente de XP.
--   * Bonos, penalizaciones y reciclaje afectan SOLO el Puntaje General (xp_delta = 0).
--   * Los canjes (redemptions) descuentan SOLO XP (general_delta = 0).
--   * `score_events` es un libro mayor (ledger) append-only: la única fuente de
--     verdad. `course_standings` es una tabla derivada mantenida por trigger y
--     usada por Supabase Realtime para el ranking en vivo.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tipos enumerados
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum (
    'administrador', 'profesor', 'convivencia', 'inspectoria', 'residencia', 'direccion'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.score_event_type as enum (
    'evaluacion', 'bonus', 'penalizacion', 'reciclaje', 'canje', 'ajuste'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.reward_tier as enum ('basico', 'medio', 'avanzado', 'alto');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.redemption_status as enum ('pendiente', 'aprobado', 'rechazado', 'entregado');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles  (extiende auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default 'Sin nombre',
  email       text,
  role        public.user_role not null default 'profesor',
  photo_url   text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- semesters
-- ---------------------------------------------------------------------------
create table if not exists public.semesters (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  year        int  not null,
  start_date  date not null,
  end_date    date not null,
  active      boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint semesters_date_order check (end_date >= start_date)
);
-- Solo un semestre activo a la vez
create unique index if not exists semesters_one_active
  on public.semesters (active) where active;

-- ---------------------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------------------
create table if not exists public.courses (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  level           text not null default '2° Medio',
  letter          text,
  head_teacher_id uuid references public.profiles(id) on delete set null,
  photo_url       text,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- areas  (las 6 grandes áreas)
-- ---------------------------------------------------------------------------
create table if not exists public.areas (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  description  text,
  order_index  int  not null default 0,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- indicators  (rúbrica por área, con descripciones por nivel 0-3)
-- ---------------------------------------------------------------------------
create table if not exists public.indicators (
  id            uuid primary key default gen_random_uuid(),
  area_id       uuid not null references public.areas(id) on delete cascade,
  name          text not null,
  description   text,
  level_0_desc  text,
  level_1_desc  text,
  level_2_desc  text,
  level_3_desc  text,
  allowed_roles public.user_role[] not null default '{}',
  order_index   int  not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists indicators_area_idx on public.indicators (area_id);

-- ---------------------------------------------------------------------------
-- evaluations  (una por curso/área/semana/semestre)
-- ---------------------------------------------------------------------------
create table if not exists public.evaluations (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses(id) on delete cascade,
  area_id      uuid not null references public.areas(id)   on delete restrict,
  semester_id  uuid not null references public.semesters(id) on delete restrict,
  week_number  int  not null,
  week_start   date not null,
  evaluator_id uuid references public.profiles(id) on delete set null,
  note         text,
  total_points int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint evaluations_week_positive check (week_number >= 1),
  constraint evaluations_unique_slot unique (course_id, area_id, semester_id, week_number)
);
create index if not exists evaluations_course_idx   on public.evaluations (course_id);
create index if not exists evaluations_semester_idx on public.evaluations (semester_id);

-- ---------------------------------------------------------------------------
-- evaluation_scores  (nivel 0-3 por indicador)
-- ---------------------------------------------------------------------------
create table if not exists public.evaluation_scores (
  id            uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  indicator_id  uuid not null references public.indicators(id)  on delete restrict,
  level         smallint not null,
  points        int not null default 0,
  constraint evaluation_scores_level_range check (level between 0 and 3),
  constraint evaluation_scores_unique unique (evaluation_id, indicator_id)
);
create index if not exists evaluation_scores_eval_idx on public.evaluation_scores (evaluation_id);

-- ---------------------------------------------------------------------------
-- score_events  (LEDGER · fuente de verdad append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.score_events (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references public.courses(id) on delete cascade,
  semester_id    uuid not null references public.semesters(id) on delete restrict,
  type           public.score_event_type not null,
  general_delta  int not null default 0,
  xp_delta       int not null default 0,
  description    text,
  reference_table text,
  reference_id    uuid,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists score_events_course_idx   on public.score_events (course_id);
create index if not exists score_events_semester_idx on public.score_events (semester_id);
create index if not exists score_events_type_idx     on public.score_events (type);
create index if not exists score_events_created_idx  on public.score_events (created_at desc);

-- ---------------------------------------------------------------------------
-- course_standings  (derivada · fuente para Realtime del ranking)
-- ---------------------------------------------------------------------------
create table if not exists public.course_standings (
  course_id     uuid not null references public.courses(id) on delete cascade,
  semester_id   uuid not null references public.semesters(id) on delete cascade,
  general_total int not null default 0,
  xp_earned     int not null default 0,
  xp_spent      int not null default 0,
  xp_available  int not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (course_id, semester_id)
);

-- ---------------------------------------------------------------------------
-- rewards  (catálogo de premios / canjes)
-- ---------------------------------------------------------------------------
create table if not exists public.rewards (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  tier          public.reward_tier not null,
  xp_cost       int not null,
  monthly_limit int,
  image_url     text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint rewards_cost_positive check (xp_cost > 0)
);

-- ---------------------------------------------------------------------------
-- redemptions  (canjes solicitados / aprobados)
-- ---------------------------------------------------------------------------
create table if not exists public.redemptions (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses(id) on delete cascade,
  reward_id    uuid not null references public.rewards(id) on delete restrict,
  semester_id  uuid not null references public.semesters(id) on delete restrict,
  xp_spent     int not null,
  status       public.redemption_status not null default 'pendiente',
  period_month date not null,
  requested_by uuid references public.profiles(id) on delete set null,
  approved_by  uuid references public.profiles(id) on delete set null,
  note         text,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz
);
create index if not exists redemptions_course_idx on public.redemptions (course_id);
create index if not exists redemptions_month_idx  on public.redemptions (reward_id, course_id, period_month);

-- ---------------------------------------------------------------------------
-- penalty_catalog  (tipos de descuento)
-- ---------------------------------------------------------------------------
create table if not exists public.penalty_catalog (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  points       int not null,          -- magnitud negativa por defecto (ej. -300)
  min_points   int,                    -- para rangos (ej. -300)
  max_points   int,                    -- para rangos (ej. -100)
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- penalties  (descuentos aplicados)
-- ---------------------------------------------------------------------------
create table if not exists public.penalties (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses(id) on delete cascade,
  semester_id  uuid not null references public.semesters(id) on delete restrict,
  catalog_id   uuid references public.penalty_catalog(id) on delete set null,
  points       int not null,           -- delta aplicado (negativo)
  student_name text,
  description  text,
  applied_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint penalties_points_negative check (points < 0)
);
create index if not exists penalties_course_idx on public.penalties (course_id);

-- ---------------------------------------------------------------------------
-- bonuses  (bonificaciones aplicadas)
-- ---------------------------------------------------------------------------
create table if not exists public.bonuses (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses(id) on delete cascade,
  semester_id  uuid not null references public.semesters(id) on delete restrict,
  kind         text not null,          -- lenguaje | matematicas | ambas | mejora_promedio | otro
  points       int not null,           -- positivo
  description  text,
  applied_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint bonuses_points_positive check (points > 0)
);
create index if not exists bonuses_course_idx on public.bonuses (course_id);

-- ---------------------------------------------------------------------------
-- recycling_records  (bonus semanal · 30 pts por kilo de material único)
-- ---------------------------------------------------------------------------
create table if not exists public.recycling_records (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses(id) on delete cascade,
  semester_id   uuid not null references public.semesters(id) on delete restrict,
  week_number   int not null,
  record_date   date not null default current_date,
  material      text not null,          -- carton | papel | aluminio | pet | colun
  kilos         numeric(6,2) not null,
  points        int not null default 0, -- floor(kilos)*30 si válido
  valid         boolean not null default true,
  registered_by uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint recycling_kilos_positive check (kilos > 0)
);
create index if not exists recycling_course_idx on public.recycling_records (course_id);
-- =============================================================================
-- Desafío Fenner · 0002 · Funciones, triggers y RPC
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers de rol / sesión
-- ---------------------------------------------------------------------------
create or replace function public.current_role_name()
returns public.user_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'administrador' and active
  );
$$;

create or replace function public.active_semester_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.semesters where active limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Puntos por nivel de logro (1=10, 2=20, 3=30)
-- ---------------------------------------------------------------------------
create or replace function public.points_for_level(p_level int)
returns int language sql immutable as $$
  select case p_level when 3 then 30 when 2 then 20 when 1 then 10 else 0 end;
$$;

-- ---------------------------------------------------------------------------
-- Nuevo usuario en auth.users -> crea profile
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'profesor')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- El trigger sobre auth.users puede fallar por permisos en algunos proyectos.
-- Se blinda para no abortar toda la migración; si se omite, el perfil se crea
-- desde la app en el primer login.
do $$
begin
  drop trigger if exists on_auth_user_created on auth.users;
  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
exception when insufficient_privilege then
  raise notice 'Sin permisos para crear trigger en auth.users; se omite.';
end $$;

-- ---------------------------------------------------------------------------
-- Mantener updated_at
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- LEDGER -> STANDINGS : al insertar un score_event, actualizar el acumulado
-- ---------------------------------------------------------------------------
create or replace function public.apply_score_event()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.course_standings as cs
    (course_id, semester_id, general_total, xp_earned, xp_spent, xp_available, updated_at)
  values (
    new.course_id, new.semester_id,
    new.general_delta,
    greatest(new.xp_delta, 0),
    greatest(-new.xp_delta, 0),
    new.xp_delta,
    now()
  )
  on conflict (course_id, semester_id) do update set
    general_total = cs.general_total + new.general_delta,
    xp_earned     = cs.xp_earned + greatest(new.xp_delta, 0),
    xp_spent      = cs.xp_spent + greatest(-new.xp_delta, 0),
    xp_available  = cs.xp_available + new.xp_delta,
    updated_at    = now();
  return new;
end;
$$;

drop trigger if exists score_events_apply on public.score_events;
create trigger score_events_apply
  after insert on public.score_events
  for each row execute function public.apply_score_event();

-- ---------------------------------------------------------------------------
-- Triggers que generan score_events desde bonuses / penalties / recycling
-- (SECURITY DEFINER para poder escribir en el ledger saltando RLS)
-- ---------------------------------------------------------------------------
create or replace function public.bonus_to_ledger()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.score_events
    (course_id, semester_id, type, general_delta, xp_delta, description, reference_table, reference_id, created_by)
  values
    (new.course_id, new.semester_id, 'bonus', new.points, 0,
     coalesce(new.description, 'Bono: ' || new.kind), 'bonuses', new.id, new.applied_by);
  return new;
end;
$$;
drop trigger if exists bonuses_ledger on public.bonuses;
create trigger bonuses_ledger after insert on public.bonuses
  for each row execute function public.bonus_to_ledger();

create or replace function public.penalty_to_ledger()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.score_events
    (course_id, semester_id, type, general_delta, xp_delta, description, reference_table, reference_id, created_by)
  values
    (new.course_id, new.semester_id, 'penalizacion', new.points, 0,
     coalesce(new.description, 'Penalización'), 'penalties', new.id, new.applied_by);
  return new;
end;
$$;
drop trigger if exists penalties_ledger on public.penalties;
create trigger penalties_ledger after insert on public.penalties
  for each row execute function public.penalty_to_ledger();

create or replace function public.recycling_to_ledger()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  -- 30 puntos por kilo entero de un material único
  new.points := case when new.valid then floor(new.kilos)::int * 30 else 0 end;
  if new.points > 0 then
    insert into public.score_events
      (course_id, semester_id, type, general_delta, xp_delta, description, reference_table, reference_id, created_by)
    values
      (new.course_id, new.semester_id, 'reciclaje', new.points, 0,
       'Reciclaje ' || new.material || ' (' || new.kilos || ' kg)', 'recycling_records', new.id, new.registered_by);
  end if;
  return new;
end;
$$;
-- BEFORE para poder fijar points; luego un AFTER para el ledger.
create or replace function public.recycling_calc_points()
returns trigger language plpgsql as $$
begin
  new.points := case when new.valid and new.kilos >= 1 then floor(new.kilos)::int * 30 else 0 end;
  if new.kilos < 1 then new.valid := false; end if;
  return new;
end;
$$;
drop trigger if exists recycling_calc on public.recycling_records;
create trigger recycling_calc before insert on public.recycling_records
  for each row execute function public.recycling_calc_points();

create or replace function public.recycling_ledger_fn()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.points > 0 then
    insert into public.score_events
      (course_id, semester_id, type, general_delta, xp_delta, description, reference_table, reference_id, created_by)
    values
      (new.course_id, new.semester_id, 'reciclaje', new.points, 0,
       'Reciclaje ' || new.material || ' (' || new.kilos || ' kg)', 'recycling_records', new.id, new.registered_by);
  end if;
  return new;
end;
$$;
drop trigger if exists recycling_ledger on public.recycling_records;
create trigger recycling_ledger after insert on public.recycling_records
  for each row execute function public.recycling_ledger_fn();

-- ---------------------------------------------------------------------------
-- RPC: submit_evaluation  (registra/actualiza una evaluación semanal)
--   p_scores: jsonb array [{ "indicator_id": uuid, "level": 0..3 }, ...]
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
  v_eval_id   uuid;
  v_prev_total int := 0;
  v_new_total  int := 0;
  v_role      public.user_role;
  v_uid       uuid := auth.uid();
  rec         jsonb;
  v_level     int;
  v_pts       int;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select role into v_role from public.profiles where id = v_uid and active;
  if v_role is null then
    raise exception 'Perfil inactivo o inexistente';
  end if;

  -- Autorización: admin siempre; el resto debe estar en allowed_roles de algún
  -- indicador del área (los indicadores de un área comparten roles evaluadores).
  if v_role <> 'administrador' then
    if not exists (
      select 1 from public.indicators i
      where i.area_id = p_area_id and i.active and v_role = any(i.allowed_roles)
    ) then
      raise exception 'El rol % no puede evaluar esta área', v_role;
    end if;
  end if;

  -- Buscar o crear la evaluación (única por curso/área/semestre/semana)
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
    -- Reversar puntaje previo (mantiene el ledger consistente y auditable)
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

  -- Insertar los nuevos puntajes y acumular el total
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

  -- Registrar el evento de puntaje (general + xp)
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

-- ---------------------------------------------------------------------------
-- RPC: request_redemption  (solicita un canje; valida tope mensual y XP)
-- ---------------------------------------------------------------------------
create or replace function public.request_redemption(
  p_course_id uuid,
  p_reward_id uuid,
  p_note      text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_sem        uuid := public.active_semester_id();
  v_reward     public.rewards%rowtype;
  v_avail      int;
  v_used       int;
  v_month      date := date_trunc('month', current_date)::date;
  v_id         uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if v_sem is null then raise exception 'No hay semestre activo'; end if;

  select * into v_reward from public.rewards where id = p_reward_id and active;
  if v_reward.id is null then raise exception 'Premio no disponible'; end if;

  select coalesce(xp_available, 0) into v_avail
  from public.course_standings where course_id = p_course_id and semester_id = v_sem;
  if coalesce(v_avail, 0) < v_reward.xp_cost then
    raise exception 'XP insuficiente (disponible %, requiere %)', coalesce(v_avail,0), v_reward.xp_cost;
  end if;

  -- Tope mensual: cuenta solicitudes no rechazadas este mes
  if v_reward.monthly_limit is not null then
    select count(*) into v_used
    from public.redemptions
    where course_id = p_course_id and reward_id = p_reward_id
      and period_month = v_month and status <> 'rechazado';
    if v_used >= v_reward.monthly_limit then
      raise exception 'Tope mensual alcanzado para este premio (%/%)', v_used, v_reward.monthly_limit;
    end if;
  end if;

  insert into public.redemptions
    (course_id, reward_id, semester_id, xp_spent, status, period_month, requested_by, note)
  values
    (p_course_id, p_reward_id, v_sem, v_reward.xp_cost, 'pendiente', v_month, v_uid, p_note)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: decide_redemption  (aprueba/rechaza; al aprobar descuenta XP)
-- ---------------------------------------------------------------------------
create or replace function public.decide_redemption(
  p_redemption_id uuid,
  p_approve       boolean
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_role  public.user_role;
  v_r     public.redemptions%rowtype;
  v_avail int;
begin
  select role into v_role from public.profiles where id = v_uid and active;
  if v_role not in ('administrador', 'convivencia', 'direccion') then
    raise exception 'No autorizado para aprobar canjes';
  end if;

  select * into v_r from public.redemptions where id = p_redemption_id for update;
  if v_r.id is null then raise exception 'Canje inexistente'; end if;
  if v_r.status <> 'pendiente' then raise exception 'El canje ya fue procesado'; end if;

  if p_approve then
    select coalesce(xp_available, 0) into v_avail
    from public.course_standings where course_id = v_r.course_id and semester_id = v_r.semester_id;
    if coalesce(v_avail, 0) < v_r.xp_spent then
      raise exception 'XP insuficiente al aprobar (disponible %, requiere %)', coalesce(v_avail,0), v_r.xp_spent;
    end if;

    insert into public.score_events
      (course_id, semester_id, type, general_delta, xp_delta, description, reference_table, reference_id, created_by)
    values
      (v_r.course_id, v_r.semester_id, 'canje', 0, -v_r.xp_spent,
       'Canje aprobado', 'redemptions', v_r.id, v_uid);

    update public.redemptions
      set status = 'aprobado', approved_by = v_uid, decided_at = now()
      where id = p_redemption_id;
  else
    update public.redemptions
      set status = 'rechazado', approved_by = v_uid, decided_at = now()
      where id = p_redemption_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución de RPC
-- ---------------------------------------------------------------------------
grant execute on function public.submit_evaluation(uuid,uuid,uuid,int,date,jsonb,text) to authenticated;
grant execute on function public.request_redemption(uuid,uuid,text) to authenticated;
grant execute on function public.decide_redemption(uuid,boolean) to authenticated;
grant execute on function public.current_role_name() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.active_semester_id() to authenticated;
-- =============================================================================
-- Desafío Fenner · 0003 · Row Level Security + vistas
-- =============================================================================
-- Estrategia:
--   * SELECT: cualquier usuario autenticado (datos internos del liceo).
--   * Escritura de catálogos/config: solo administrador.
--   * Evaluaciones y canjes: solo vía RPC SECURITY DEFINER (que aplican la
--     autorización por rol internamente). Además el admin tiene acceso directo.
--   * Bonos / penalizaciones / reciclaje: INSERT restringido por rol; los
--     triggers SECURITY DEFINER generan el ledger.
-- =============================================================================

alter table public.profiles          enable row level security;
alter table public.semesters         enable row level security;
alter table public.courses           enable row level security;
alter table public.areas             enable row level security;
alter table public.indicators        enable row level security;
alter table public.evaluations       enable row level security;
alter table public.evaluation_scores enable row level security;
alter table public.score_events      enable row level security;
alter table public.course_standings  enable row level security;
alter table public.rewards           enable row level security;
alter table public.redemptions       enable row level security;
alter table public.penalty_catalog   enable row level security;
alter table public.penalties         enable row level security;
alter table public.bonuses           enable row level security;
alter table public.recycling_records enable row level security;

-- ---- profiles --------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---- catálogos: SELECT todos, WRITE admin ---------------------------------
do $$
declare t text;
begin
  foreach t in array array['semesters','courses','areas','indicators','rewards','penalty_catalog']
  loop
    execute format('drop policy if exists %I_select on public.%I;', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (true);', t, t);
    execute format('drop policy if exists %I_admin on public.%I;', t, t);
    execute format('create policy %I_admin on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin());', t, t);
  end loop;
end $$;

-- ---- evaluations / evaluation_scores --------------------------------------
drop policy if exists evaluations_select on public.evaluations;
create policy evaluations_select on public.evaluations
  for select to authenticated using (true);
drop policy if exists evaluations_admin on public.evaluations;
create policy evaluations_admin on public.evaluations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists escores_select on public.evaluation_scores;
create policy escores_select on public.evaluation_scores
  for select to authenticated using (true);
drop policy if exists escores_admin on public.evaluation_scores;
create policy escores_admin on public.evaluation_scores
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- score_events (ledger) -------------------------------------------------
drop policy if exists score_events_select on public.score_events;
create policy score_events_select on public.score_events
  for select to authenticated using (true);
drop policy if exists score_events_admin_insert on public.score_events;
create policy score_events_admin_insert on public.score_events
  for insert to authenticated with check (public.is_admin());

-- ---- course_standings (solo lectura; escribe el trigger) ------------------
drop policy if exists standings_select on public.course_standings;
create policy standings_select on public.course_standings
  for select to authenticated using (true);

-- ---- redemptions -----------------------------------------------------------
drop policy if exists redemptions_select on public.redemptions;
create policy redemptions_select on public.redemptions
  for select to authenticated using (true);
drop policy if exists redemptions_admin on public.redemptions;
create policy redemptions_admin on public.redemptions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- penalties -------------------------------------------------------------
drop policy if exists penalties_select on public.penalties;
create policy penalties_select on public.penalties
  for select to authenticated using (true);
drop policy if exists penalties_insert on public.penalties;
create policy penalties_insert on public.penalties
  for insert to authenticated with check (
    public.current_role_name() in ('administrador','inspectoria','convivencia','residencia','direccion')
  );
drop policy if exists penalties_admin on public.penalties;
create policy penalties_admin on public.penalties
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- bonuses ---------------------------------------------------------------
drop policy if exists bonuses_select on public.bonuses;
create policy bonuses_select on public.bonuses
  for select to authenticated using (true);
drop policy if exists bonuses_insert on public.bonuses;
create policy bonuses_insert on public.bonuses
  for insert to authenticated with check (
    public.current_role_name() in ('administrador','direccion')
  );
drop policy if exists bonuses_admin on public.bonuses;
create policy bonuses_admin on public.bonuses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- recycling_records -----------------------------------------------------
drop policy if exists recycling_select on public.recycling_records;
create policy recycling_select on public.recycling_records
  for select to authenticated using (true);
drop policy if exists recycling_insert on public.recycling_records;
create policy recycling_insert on public.recycling_records
  for insert to authenticated with check (
    public.current_role_name() in ('administrador','inspectoria','convivencia','profesor','direccion')
  );
drop policy if exists recycling_admin on public.recycling_records;
create policy recycling_admin on public.recycling_records
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Vista de ranking (curso + acumulados + posición)
-- ---------------------------------------------------------------------------
create or replace view public.v_ranking as
select
  c.id            as course_id,
  c.name          as course_name,
  c.photo_url     as course_photo,
  cs.semester_id,
  coalesce(cs.general_total, 0) as general_total,
  coalesce(cs.xp_earned, 0)     as xp_earned,
  coalesce(cs.xp_spent, 0)      as xp_spent,
  coalesce(cs.xp_available, 0)  as xp_available,
  rank() over (
    partition by cs.semester_id
    order by coalesce(cs.general_total, 0) desc
  ) as position,
  cs.updated_at
from public.courses c
left join public.course_standings cs on cs.course_id = c.id
where c.active;

grant select on public.v_ranking to authenticated;

-- Desglose por área para un curso/semestre (para "qué mejorar")
create or replace view public.v_course_area_breakdown as
select
  e.course_id,
  e.semester_id,
  a.id   as area_id,
  a.name as area_name,
  a.slug as area_slug,
  count(distinct e.id)              as evaluations_count,
  coalesce(sum(e.total_points), 0)  as area_points
from public.areas a
left join public.evaluations e on e.area_id = a.id
group by e.course_id, e.semester_id, a.id, a.name, a.slug;

grant select on public.v_course_area_breakdown to authenticated;
-- =============================================================================
-- Desafío Fenner · 0004 · Storage (buckets + policies)
-- =============================================================================
-- Buckets:
--   students   (público)  fotos de estudiantes
--   teachers   (público)  fotos de profesores
--   courses    (público)  fotos/logos de cursos
--   evidence   (privado)  evidencias de evaluaciones
--   documents  (privado)  documentos y PDFs
--   activities (público)  imágenes de actividades / premios
--
-- Nota: crear buckets y policies sobre storage.objects puede requerir permisos
-- especiales según el proyecto. Todo se blinda con manejo de excepciones para no
-- abortar la migración; si se omite, configúralo desde el panel (Storage).
-- =============================================================================

do $$
begin
  insert into storage.buckets (id, name, public)
  values
    ('students',   'students',   true),
    ('teachers',   'teachers',   true),
    ('courses',    'courses',    true),
    ('activities', 'activities', true),
    ('evidence',   'evidence',   false),
    ('documents',  'documents',  false)
  on conflict (id) do nothing;
exception when insufficient_privilege then
  raise notice 'Sin permisos para crear buckets; configúralos desde el panel.';
end $$;

do $$
begin
  -- Lectura pública de buckets públicos
  drop policy if exists public_read on storage.objects;
  create policy public_read on storage.objects
    for select to public
    using (bucket_id in ('students','teachers','courses','activities'));

  -- Lectura de buckets privados: solo autenticados
  drop policy if exists private_read on storage.objects;
  create policy private_read on storage.objects
    for select to authenticated
    using (bucket_id in ('evidence','documents'));

  -- Escritura: usuarios autenticados
  drop policy if exists authed_insert on storage.objects;
  create policy authed_insert on storage.objects
    for insert to authenticated
    with check (bucket_id in ('students','teachers','courses','activities','evidence','documents'));

  drop policy if exists authed_update on storage.objects;
  create policy authed_update on storage.objects
    for update to authenticated
    using (bucket_id in ('students','teachers','courses','activities','evidence','documents'));

  -- Borrado: solo administrador
  drop policy if exists admin_delete on storage.objects;
  create policy admin_delete on storage.objects
    for delete to authenticated
    using (public.is_admin());
exception when insufficient_privilege then
  raise notice 'Sin permisos para policies de storage; configúralas desde el panel.';
end $$;
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
-- =============================================================================
-- Desafío Fenner · 0006 · Realtime
-- =============================================================================
-- Habilita Supabase Realtime sobre la tabla derivada del ranking. El cliente se
-- suscribe a sus cambios para actualizar posiciones y puntajes sin recargar.
-- =============================================================================

do $$
begin
  alter publication supabase_realtime add table public.course_standings;
exception
  when duplicate_object then null;  -- ya estaba en la publicación
  when undefined_object then
    -- Si la publicación no existe (proyecto muy nuevo), créala.
    create publication supabase_realtime for table public.course_standings;
end $$;

-- También el ledger, por si se quiere una vista de actividad en vivo.
do $$
begin
  alter publication supabase_realtime add table public.score_events;
exception when duplicate_object then null;
end $$;
-- =============================================================================
-- Desafío Fenner · 0007 · Autogestión de perfil (self-heal)
-- =============================================================================
-- Cuando el trigger sobre auth.users no está disponible (permisos), la app crea
-- el perfil en el primer login. Esta policy permite a cada usuario insertar SOLO
-- su propia fila y SOLO con rol 'profesor' (evita autoescalar a administrador).
-- =============================================================================

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid() and role = 'profesor');

-- Reintenta crear el trigger de auth.users (por si ahora hay permisos).
do $$
begin
  drop trigger if exists on_auth_user_created on auth.users;
  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
exception when insufficient_privilege then
  raise notice 'Sin permisos para crear trigger en auth.users; la app crea el perfil en el primer login.';
end $$;
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

-- =============================================================================
-- Desafío Fenner · 0012 · Asignaturas por profesor
-- =============================================================================
-- El campo 'subjects' guarda las asignaturas que dicta cada profesor. En la
-- pantalla de registro se transforma en un menú desplegable (más "Jefatura"
-- cuando el profesor es jefe del curso seleccionado, más "Otra"). La jefatura
-- se determina con courses.head_teacher_id.
-- =============================================================================

alter table public.profiles
  add column if not exists subjects text[] not null default '{}';

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
