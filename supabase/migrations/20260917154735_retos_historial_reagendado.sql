-- Auditoría de reagendamientos hechos por un admin desde el panel. Hasta
-- ahora fecha_propuesta se sobreescribía sin dejar rastro de la fecha/cancha
-- anterior — eso impidió reconstruir a tiempo un reagendo manual (hecho
-- directo en Supabase) que chocó con un juego ya pautado. Ver
-- app/api/admin/reagendar-reto/route.ts.
create table public.retos_historial_reagendado (
  id uuid primary key default gen_random_uuid(),
  reto_id uuid not null references public.retos(id),
  fecha_anterior timestamptz not null,
  fecha_nueva timestamptz not null,
  cancha_anterior text not null,
  cancha_nueva text not null,
  admin_id uuid not null references public.administradores(id),
  created_at timestamptz not null default now()
);

create index retos_historial_reagendado_reto_id_idx on public.retos_historial_reagendado (reto_id);

-- Igual que jugadores/retos/reservas_cancha: no hay Supabase Auth, así que
-- RLS no puede filtrar por "es admin" — el service role es la única vía de
-- acceso. A diferencia de esas tablas, aquí ni siquiera se abre SELECT a
-- anon: es una tabla de auditoría interna, no se muestra en ninguna
-- pantalla de cliente todavía.
alter table public.retos_historial_reagendado enable row level security;
