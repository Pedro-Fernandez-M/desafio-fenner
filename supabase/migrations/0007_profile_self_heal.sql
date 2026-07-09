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
