-- Patrocinantes administrables desde el panel (antes estaban escritos a mano
-- en app/page.tsx). La portada los muestra en una cinta animada; los de nivel
-- 'principal' además salen destacados dentro del banner del torneo.
--
-- Igual que las tablas cerradas en oct-2026: sin policy para anon. La
-- portada los lee por /api/publico/portada (service role, solo activos) y
-- el admin completo los escribe por /api/admin/patrocinantes.
create table public.patrocinantes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) > 0),
  logo_url text null,
  instagram text null check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  enlace_url text null check (enlace_url is null or enlace_url ~ '^https://'),
  promo text null check (promo is null or length(promo) <= 120),   -- "10% con el código HGV"
  nivel text not null default 'estandar' check (nivel in ('principal', 'estandar')),
  orden integer not null default 0,
  activo boolean not null default true,
  actualizado_por uuid null references public.administradores(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index patrocinantes_activo_orden_idx on public.patrocinantes (activo, orden);

alter table public.patrocinantes enable row level security;
revoke all on table public.patrocinantes from anon, authenticated;

-- Los 3 patrocinantes de la escalera 2026, con los mismos logos que ya
-- servía la portada. Quedan activos; el admin los apaga cuando quiera.
insert into public.patrocinantes (nombre, logo_url, instagram, nivel, orden) values
  ('Cauchos Q''Barato', 'https://znfsxpmmlxezzeasjtqa.supabase.co/storage/v1/object/public/fotos-partidos/Sponsors/cauchos-qbarato.png', 'cauchosqbarato', 'estandar', 10),
  ('Timoboll', 'https://znfsxpmmlxezzeasjtqa.supabase.co/storage/v1/object/public/fotos-partidos/Sponsors/timoboll.png', 'autopartesjafenza', 'estandar', 20),
  ('PetSmall', 'https://znfsxpmmlxezzeasjtqa.supabase.co/storage/v1/object/public/fotos-partidos/Sponsors/petsmall.png', 'petsmall', 'estandar', 30);
