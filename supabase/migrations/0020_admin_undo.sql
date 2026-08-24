-- =============================================================================
-- Desafío Fenner · 0020 · Anulación de registros por el administrador
-- =============================================================================
-- Permite al admin eliminar un registro erróneo y revertir su efecto en el
-- puntaje de forma segura (mediante un ajuste compensatorio, para que
-- course_standings se corrija por el trigger).
-- =============================================================================

create or replace function public.admin_undo(p_table text, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_gen    int;
  v_xp     int;
  v_course uuid;
  v_sem    uuid;
  v_week   int;
  v_tt     int;
  v_ct     int;
  v_cwt    public.class_week_totals%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador puede eliminar registros';
  end if;

  if p_table in ('penalties', 'bonuses', 'recycling_records', 'redemptions') then
    select coalesce(sum(general_delta), 0), coalesce(sum(xp_delta), 0)
      into v_gen, v_xp
      from public.score_events
      where reference_table = p_table and reference_id = p_id;

    execute format('select course_id, semester_id from public.%I where id = $1', p_table)
      into v_course, v_sem using p_id;
    if v_course is null then raise exception 'Registro no encontrado'; end if;

    if v_gen <> 0 or v_xp <> 0 then
      insert into public.score_events
        (course_id, semester_id, type, general_delta, xp_delta, description, created_by)
      values
        (v_course, v_sem, 'ajuste', -v_gen, -v_xp, 'Anulación de registro', auth.uid());
    end if;

    execute format('delete from public.%I where id = $1', p_table) using p_id;

  elsif p_table = 'class_evaluations' then
    select course_id, semester_id, week_number
      into v_course, v_sem, v_week
      from public.class_evaluations where id = p_id;
    if v_course is null then raise exception 'Registro no encontrado'; end if;

    delete from public.class_evaluation_scores where class_evaluation_id = p_id;
    delete from public.class_evaluations where id = p_id;

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
      where ce.course_id = v_course and ce.semester_id = v_sem
        and ce.week_number = v_week
      group by i.assigned_group, ces.indicator_id
    ) x;

    select * into v_cwt from public.class_week_totals
      where course_id = v_course and semester_id = v_sem and week_number = v_week;
    if v_cwt.course_id is null then return; end if;

    -- Convivencia: ajusta al instante
    if (v_ct - v_cwt.conviv_posted) <> 0 then
      insert into public.score_events
        (course_id, semester_id, type, general_delta, xp_delta, description, created_by)
      values
        (v_course, v_sem, 'evaluacion', (v_ct - v_cwt.conviv_posted) * 2,
         (v_ct - v_cwt.conviv_posted), 'Ajuste convivencia (anulación)', auth.uid());
    end if;
    -- Profesores: solo si la semana ya estaba consolidada
    if v_cwt.teacher_consolidated <> 0 and (v_tt - v_cwt.teacher_consolidated) <> 0 then
      insert into public.score_events
        (course_id, semester_id, type, general_delta, xp_delta, description, created_by)
      values
        (v_course, v_sem, 'evaluacion', (v_tt - v_cwt.teacher_consolidated) * 2,
         (v_tt - v_cwt.teacher_consolidated), 'Ajuste clases (anulación)', auth.uid());
    end if;

    update public.class_week_totals set
      teacher_points = v_tt,
      conviv_points  = v_ct,
      conviv_posted  = v_ct,
      teacher_consolidated = case when teacher_consolidated <> 0 then v_tt else teacher_consolidated end,
      total_points   = v_tt + v_ct,
      updated_at     = now()
    where course_id = v_course and semester_id = v_sem and week_number = v_week;

  else
    raise exception 'Tipo de registro no soportado: %', p_table;
  end if;
end;
$$;

grant execute on function public.admin_undo(text, uuid) to authenticated;
