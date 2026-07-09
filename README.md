# Desafío Fenner

Sistema de gamificación escolar del **Liceo Bicentenario Industrial Ing. Ricardo Fenner Ruedi**.
Cada curso de 2° medio compite durante el semestre acumulando puntos por buenas
conductas en seis áreas. Dos monedas: **Puntaje General** (ranking, no se gasta) y
**XP / Puntos Fenner** (canjeables por premios).

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · TailwindCSS v4 · shadcn/ui ·
Supabase (PostgreSQL, Auth, Storage, Realtime, RLS) · Server Actions · Zod ·
React Hook Form · TanStack Query.

## Puesta en marcha

### 1. Instalar dependencias

```bash
npm install
```

### 2. Crear el proyecto en Supabase

1. Crea un proyecto en <https://supabase.com>.
2. Copia `.env.local.example` a `.env.local` y completa:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (opcional, para scripts server-side)

### 3. Aplicar las migraciones

Ejecuta, **en orden**, el contenido de `supabase/migrations/` en el
**SQL Editor** del panel de Supabase:

| Archivo | Contenido |
| --- | --- |
| `0001_schema.sql` | Tipos, tablas, índices, FKs, constraints |
| `0002_functions_triggers.sql` | Funciones, triggers, RPC (`submit_evaluation`, `request_redemption`, `decide_redemption`) |
| `0003_rls.sql` | Row Level Security + vistas de ranking |
| `0004_storage.sql` | Buckets de Storage + policies |
| `0005_seed.sql` | Áreas, rúbrica completa, premios, catálogo de penalizaciones, semestre y cursos |

> Alternativa con Supabase CLI (si la instalas):
> `npx supabase link --project-ref <ref>` y luego `npx supabase db push`.

### 4. Crear el primer usuario administrador

En **Authentication → Users → Add user** del panel de Supabase, crea un usuario
con correo y contraseña. El trigger `handle_new_user` creará su `profile`
automáticamente con rol `profesor`. Para promoverlo a administrador, en el SQL
Editor:

```sql
update public.profiles set role = 'administrador' where email = 'tu-correo@industrialfenner.cl';
```

### 5. Levantar el entorno de desarrollo

```bash
npm run dev
```

Abre <http://localhost:3000>. Serás redirigido a `/login`.

## Modelo de puntaje

- **Evaluaciones semanales** (nivel 1/2/3 = 10/20/30 pts): suman a **General** y a **XP**.
- **Bonos, penalizaciones, reciclaje**: afectan solo el **General**.
- **Canjes**: descuentan solo **XP**.
- `score_events` es el libro mayor (ledger) append-only y única fuente de verdad.
- `course_standings` es la tabla derivada (mantenida por trigger) que alimenta el
  ranking en tiempo real vía Supabase Realtime.

## Roles

Administrador · Profesor · Convivencia Escolar · Inspectoría · Residencia · Dirección.
La autorización se aplica en **RLS** y en las funciones **RPC**, no solo en el frontend.

## Scripts

```bash
npm run dev        # desarrollo
npm run build      # build de producción
npm run lint       # ESLint
npm run typecheck  # TypeScript sin emitir
```
