-- Lotes de fabricación de uniformes: cada vez que el admin "envía a
-- fábrica", todas las prendas pendientes (de pagos validados y no
-- anulados) quedan asignadas a un lote nuevo. Una prenda con lote_id null
-- está "Pendiente por enviar"; solo se puede entregar si su lote ya se
-- recibió del proveedor.
--
-- Igual que el resto del módulo: RLS activa y sin políticas, todo pasa por
-- rutas server-side con service role.

create table public.lotes_uniforme (
  id uuid primary key default gen_random_uuid(),
  numero serial not null unique,
  estado text not null default 'en_fabrica' check (estado in ('en_fabrica','recibido')),
  enviado_at timestamptz not null default now(),
  enviado_por uuid references public.administradores(id),
  recibido_at timestamptz,
  notas text,
  created_at timestamptz default now(),
  constraint recibido_con_fecha check ((estado = 'recibido') = (recibido_at is not null))
);

alter table public.lotes_uniforme enable row level security;

alter table public.pedido_uniforme_items
  add column lote_id uuid references public.lotes_uniforme(id);

create index pedido_uniforme_items_lote_id on public.pedido_uniforme_items (lote_id);

-- Una prenda solo se marca entregada si su lote ya está recibido. Es un
-- trigger (no un check) porque depende de otra tabla.
create function public.validar_entrega_prenda()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.entregado and not coalesce(old.entregado, false) then
    if new.lote_id is null or not exists (
      select 1 from public.lotes_uniforme l where l.id = new.lote_id and l.estado = 'recibido'
    ) then
      raise exception 'Esta prenda todavía no se ha recibido de la fábrica; no se puede entregar'
        using errcode = 'check_violation', constraint = 'entrega_requiere_lote_recibido';
    end if;
  end if;
  return new;
end;
$$;

create trigger pedido_uniforme_items_validar_entrega
  before insert or update of entregado, lote_id on public.pedido_uniforme_items
  for each row execute function public.validar_entrega_prenda();

-- Crea un lote en fábrica con TODAS las prendas pendientes de pagos
-- validados y no anulados, en una sola transacción. El UPDATE ... where
-- lote_id is null hace que dos envíos simultáneos no se repartan ni
-- dupliquen prendas: el segundo encuentra 0 pendientes y falla.
create function public.crear_lote_uniforme(p_enviado_por uuid, p_notas text default null)
returns public.lotes_uniforme
language plpgsql
set search_path = public
as $$
declare
  v_lote public.lotes_uniforme;
  v_prendas integer;
begin
  -- Chequeo previo para no gastar un número de lote en un intento vacío
  -- (el chequeo de row_count de abajo sigue cubriendo la carrera).
  if not exists (
    select 1
      from public.pedido_uniforme_items i
      join public.pagos_delegacion p on p.id = i.pago_id
     where i.lote_id is null and p.validado and not p.anulado
  ) then
    raise exception 'No hay prendas pendientes por enviar a fábrica'
      using errcode = 'no_data_found';
  end if;

  insert into public.lotes_uniforme (enviado_por, notas)
  values (p_enviado_por, nullif(trim(p_notas), ''))
  returning * into v_lote;

  update public.pedido_uniforme_items i
     set lote_id = v_lote.id
    from public.pagos_delegacion p
   where i.pago_id = p.id
     and i.lote_id is null
     and p.validado
     and not p.anulado;
  get diagnostics v_prendas = row_count;

  if v_prendas = 0 then
    raise exception 'No hay prendas pendientes por enviar a fábrica'
      using errcode = 'no_data_found';
  end if;

  return v_lote;
end;
$$;

revoke execute on function public.crear_lote_uniforme(uuid, text) from public, anon, authenticated;
revoke execute on function public.validar_entrega_prenda() from public, anon, authenticated;
