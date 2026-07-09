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
