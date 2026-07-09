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
