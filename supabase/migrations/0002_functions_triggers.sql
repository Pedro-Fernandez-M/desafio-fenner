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
