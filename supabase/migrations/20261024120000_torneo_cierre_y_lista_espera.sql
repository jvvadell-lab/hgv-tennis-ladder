-- Torneo Navidad HGV 2026 — ajustes del 23-oct-2026 al PR #9.
-- Va después de torneo_navidad_fechas.
--
-- 1. Grupos flexibles: cupo, num_grupos y tamano_grupo de la categoría son
--    el MÁXIMO, no un requisito exacto (el formato sale de cuántos equipos
--    entran al sorteo, lib/torneoSorteo.ts → gruposFlexibles). Con 3 grupos,
--    si dos primeros empatan en todo, el admin fija su orden
--    (orden_primeros_manual: letras de mejor a peor).
-- 2. Cierre manual por categoría (inscripciones_abiertas, ya existe). La
--    hora de cierre programada (cierre_inscripciones_at) no cierra nada: si
--    pasa con alguna categoría abierta se avisa a los admins una sola vez
--    (cierre_vencido_avisado_at).
-- 3. Lista de espera por categoría: un jugador se anota (sin pago) cuando la
--    categoría está cerrada o llena; el admin inscribe al siguiente si se
--    libera un lugar antes del sorteo. Sin lectura pública.

alter table public.torneo_categorias drop constraint if exists torneo_categorias_grupos_llenan_cupo;
alter table public.torneo_categorias add column orden_primeros_manual text[] null;

alter table public.torneos add column cierre_vencido_avisado_at timestamptz null;

create table public.torneo_lista_espera (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.torneo_categorias(id) on delete cascade,
  jugador_id uuid not null references public.jugadores(id) on delete cascade,
  estado text not null default 'esperando' check (estado in ('esperando', 'inscrito', 'salio')),
  created_at timestamptz not null default now(),
  resuelta_at timestamptz null,
  inscripcion_id uuid null references public.torneo_inscripciones(id) on delete set null,
  inscrito_por_admin uuid null references public.administradores(id),
  constraint torneo_lista_espera_resuelta check ((estado = 'esperando') = (resuelta_at is null))
);

-- Una sola vez en la lista por jugador y categoría mientras espera.
create unique index torneo_lista_espera_una on public.torneo_lista_espera (categoria_id, jugador_id) where estado = 'esperando';
create index torneo_lista_espera_orden on public.torneo_lista_espera (categoria_id, created_at) where estado = 'esperando';

alter table public.torneo_lista_espera enable row level security;
revoke all on table public.torneo_lista_espera from anon, authenticated;
