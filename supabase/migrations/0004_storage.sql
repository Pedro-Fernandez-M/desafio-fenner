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
