-- Notificaciones in-app (tipo WhatsApp). No hay Supabase Auth en este proyecto
-- (la sesión es una cookie httpOnly custom), así que RLS no puede filtrar por
-- "jugador de la sesión" — igual que jugadores/retos, el SELECT queda abierto
-- a anon y la privacidad real de las mutaciones (insertar, marcar leído) se
-- garantiza en rutas server-side con el service role, no vía policies.
create table public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  jugador_id uuid not null references public.jugadores(id),
  tipo character varying not null,
  reto_id uuid references public.retos(id),
  mensaje text not null,
  leido boolean not null default false,
  created_at timestamp with time zone not null default now()
);

create index notificaciones_jugador_id_idx on public.notificaciones (jugador_id, leido);

alter table public.notificaciones enable row level security;

-- Solo lectura desde el cliente (necesario para que Realtime pueda entregar
-- eventos con la anon key). El INSERT y el UPDATE (marcar leído) se hacen
-- exclusivamente desde el backend con el service role.
create policy "Cualquiera puede ver notificaciones"
  on public.notificaciones for select
  to anon
  using (true);

alter publication supabase_realtime add table public.notificaciones;
