-- Bloqueos de cancha por decisión del club (entrenamiento de la delegación,
-- torneos, mantenimiento…). Mientras exista un bloqueo, nadie puede crear
-- reservas casuales ni retos (ni mover uno) hacia esa franja — lo valida el
-- servidor con lib/choquesCancha.ts (buscarBloqueoCancha).
--
-- Crear un bloqueo NO toca lo que ya estaba agendado: el panel solo avisa de
-- los conflictos y el admin los resuelve a mano con las herramientas
-- existentes (anular / reagendar reto). Eliminar un bloqueo tampoco restaura
-- nada. Ver app/api/admin/bloqueos-cancha.
create table public.bloqueos_cancha (
  id uuid primary key default gen_random_uuid(),
  cancha text not null check (cancha in ('HGV1', 'HGV2')),
  inicio timestamptz not null,
  fin timestamptz not null,
  motivo text not null check (length(btrim(motivo)) > 0),
  creado_por uuid not null references public.administradores(id),
  created_at timestamptz not null default now(),
  constraint bloqueos_cancha_rango_valido check (fin > inicio)
);

create index bloqueos_cancha_cancha_fin_idx on public.bloqueos_cancha (cancha, fin);

-- Igual que retos y reservas_cancha: /reservas y /ladder los leen con la
-- clave anónima para pintar "Reservada por el club: <motivo>". Escribir solo
-- con el service role (endpoint de admin completo).
alter table public.bloqueos_cancha enable row level security;

create policy "Cualquiera puede ver los bloqueos de cancha"
  on public.bloqueos_cancha for select to anon using (true);
