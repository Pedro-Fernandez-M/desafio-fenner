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
