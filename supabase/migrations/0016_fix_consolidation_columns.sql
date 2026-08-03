-- =============================================================================
-- Desafío Fenner · 0016 · Corrige columnas/consolidación faltantes (0013)
-- =============================================================================
-- La 0013 no se aplicó completa: faltaban las columnas de class_week_totals y
-- la función consolidate_class_scores. Esta migración las agrega SIN redefinir
-- submit_class_evaluation (esa ya la dejó la 0015 con validación de horario).
-- =============================================================================

alter table public.class_week_totals
  add column if not exists teacher_points       int not null default 0,
  add column if not exists teacher_consolidated  int not null default 0,
  add column if not exists conviv_points          int not null default 0,
  add column if not exists conviv_posted          int not null default 0;

-- Consolidación del promedio de PROFESORES (viernes / botón manual)
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

-- Cron: viernes ~17:00 Chile (20:00 y 21:00 UTC cubren verano/invierno)
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
