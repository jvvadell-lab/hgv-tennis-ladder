alter table public.temporadas
  add column if not exists cooldown_pausado boolean not null default false,
  add column if not exists cooldown_pausado_por uuid references public.administradores(id),
  add column if not exists cooldown_pausado_at timestamptz;
