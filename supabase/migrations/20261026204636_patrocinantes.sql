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
  logo_url text null check (logo_url is null or logo_url ~ '^(https://|/)'),   -- /patrocinantes/x.webp = archivo del repo
  instagram text null check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  enlace_url text null check (enlace_url is null or enlace_url ~ '^https://'),
  promo text null check (promo is null or length(promo) <= 120),   -- "10% con el código HGV"
  nivel text not null default 'estandar' check (nivel in ('principal', 'estandar')),
  -- Fondo de la tarjeta del logo: 'oscuro' para logos blancos/claros.
  fondo text not null default 'claro' check (fondo in ('claro', 'oscuro')),
  orden integer not null default 0,
  activo boolean not null default true,
  actualizado_por uuid null references public.administradores(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index patrocinantes_activo_orden_idx on public.patrocinantes (activo, orden);

alter table public.patrocinantes enable row level security;
revoke all on table public.patrocinantes from anon, authenticated;

-- Patrocinantes del Torneo Navidad 2026 (orden dado por la comisión, 26-oct).
-- Los logos van en el repo (public/patrocinantes/, WebP livianos servidos
-- por Vercel); los que se agreguen desde el panel van a Storage.
insert into public.patrocinantes (nombre, logo_url, instagram, fondo, orden) values
  ('CVP Contable', '/patrocinantes/cvp-contable.webp', null, 'claro', 10),
  ('Granos Vicone', '/patrocinantes/vicone.webp', 'granosvicone', 'claro', 20),
  ('DLogística Integrada', '/patrocinantes/dlogistica.webp', 'dlogint', 'oscuro', 30),
  ('Cauchos Q''Barato', '/patrocinantes/cauchos-qbarato.webp', 'cauchosqbarato', 'claro', 40),
  ('PetSmall', '/patrocinantes/petsmall.webp', 'petsmall', 'claro', 50),
  ('Timoboll', '/patrocinantes/timoboll.webp', 'autopartesjafenza', 'oscuro', 60),
  ('Ma-Nolo', '/patrocinantes/manolo.webp', null, 'claro', 70);
