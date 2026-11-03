-- Envíos masivos de correo desde el panel del admin (primero: la invitación a
-- la inauguración de la Copa Navidad, vie 6-nov-2026). Una fila por campaña y
-- jugador: el unique impide mandarle dos veces la misma campaña aunque se
-- pulse "Enviar a todos" dos veces o desde dos pestañas.
--
-- estado: 'enviando' = reclamado por un lote que está mandando ahora;
-- 'enviado' = Gmail lo aceptó; 'error' = falló (se puede reintentar).
-- Un 'enviando' de hace más de 10 min es un lote que murió a medias (timeout
-- de la función): se puede volver a reclamar.
--
-- Sin policy para anon: solo la lee y escribe /api/admin/correos/* con
-- service role.
create table public.correos_envios (
  id uuid primary key default gen_random_uuid(),
  campana text not null check (campana ~ '^[a-z0-9-]{1,60}$'),
  jugador_id uuid not null references public.jugadores(id) on delete cascade,
  email text not null,
  variante text not null check (length(variante) between 1 and 30),
  estado text not null default 'enviando' check (estado in ('enviando', 'enviado', 'error')),
  error text null,
  enviado_por uuid null references public.administradores(id),
  reclamado_at timestamptz not null default now(),
  enviado_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (campana, jugador_id)
);

create index correos_envios_enviado_at_idx on public.correos_envios (enviado_at);

alter table public.correos_envios enable row level security;
revoke all on table public.correos_envios from anon, authenticated;

-- Reclama un lote de forma atómica: inserta los que no tienen fila y
-- retoma los 'error' y los 'enviando' abandonados. Devuelve solo los que
-- este llamado ganó — dos lotes simultáneos nunca reciben al mismo jugador.
-- p_filas: [{ "jugador_id": "...", "email": "...", "variante": "..." }]
create or replace function public.correos_reclamar_lote(p_campana text, p_filas jsonb, p_admin uuid)
returns table (jugador_id uuid, email text, variante text)
language sql
set search_path = public
as $$
  insert into public.correos_envios as ce (campana, jugador_id, email, variante, enviado_por)
  select p_campana, (f->>'jugador_id')::uuid, f->>'email', f->>'variante', p_admin
  from jsonb_array_elements(p_filas) f
  on conflict (campana, jugador_id) do update
    set email = excluded.email, variante = excluded.variante, estado = 'enviando', error = null,
        enviado_por = excluded.enviado_por, reclamado_at = now()
    where ce.estado = 'error'
       or (ce.estado = 'enviando' and ce.reclamado_at < now() - interval '10 minutes')
  returning ce.jugador_id, ce.email, ce.variante;
$$;

revoke all on function public.correos_reclamar_lote(text, jsonb, uuid) from public, anon, authenticated;
