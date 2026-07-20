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
