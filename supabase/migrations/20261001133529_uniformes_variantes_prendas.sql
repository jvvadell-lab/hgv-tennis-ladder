-- Prendas de uniformes: franela niño, manga de la franela dama, tallas por
-- tipo de prenda, y "Modificar prenda" con historial y diferencia de precio.
--
-- Tallas válidas por prenda:
--   franela_dama                 XS–XXL  (+ manga obligatoria: corta | sin_mangas)
--   franela_caballero, chaqueta  XS–XXXL
--   franela_nino                 2–16, solo pares

-- 1) Tipos de prenda: se agrega franela_nino (items y precios).
alter table public.pedido_uniforme_items drop constraint pedido_uniforme_items_tipo_prenda_check;
alter table public.pedido_uniforme_items add constraint pedido_uniforme_items_tipo_prenda_check
  check (tipo_prenda in ('franela_dama', 'franela_caballero', 'chaqueta', 'franela_nino'));

alter table public.precios_prendas drop constraint precios_prendas_tipo_prenda_check;
alter table public.precios_prendas add constraint precios_prendas_tipo_prenda_check
  check (tipo_prenda in ('franela_dama', 'franela_caballero', 'chaqueta', 'franela_nino'));
insert into public.precios_prendas (tipo_prenda, precio_usd) values ('franela_nino', 18);

-- 2) Talla según el tipo de prenda (reemplaza la lista única XS–XXXL).
alter table public.pedido_uniforme_items drop constraint pedido_uniforme_items_talla_check;
alter table public.pedido_uniforme_items add constraint talla_segun_prenda check (
  (tipo_prenda = 'franela_dama' and talla in ('XS', 'S', 'M', 'L', 'XL', 'XXL'))
  or (tipo_prenda in ('franela_caballero', 'chaqueta') and talla in ('XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'))
  or (tipo_prenda = 'franela_nino' and talla in ('2', '4', '6', '8', '10', '12', '14', '16'))
);

-- 3) Manga: solo la franela dama la tiene.
alter table public.pedido_uniforme_items
  add column manga text check (manga in ('corta', 'sin_mangas')),
  add constraint manga_solo_dama check (manga is null or tipo_prenda = 'franela_dama');

-- Obligatoria en la franela dama para registros nuevos. NOT VALID: no se
-- verifica contra las filas que ya existían (3 franelas dama de antes de este
-- cambio, que quedan "Falta definir manga"), pero sí en cada insert y en cada
-- update de cualquier fila — esas 3 no pueden ir a un lote ni modificarse
-- sin definir la manga.
alter table public.pedido_uniforme_items
  add constraint manga_obligatoria_dama check (tipo_prenda <> 'franela_dama' or manga is not null) not valid;

-- 4) Diferencia de precio por cambios de prenda: el monto pagado no cambia;
-- la diferencia se acumula aquí (positiva = el jugador debe, negativa = saldo
-- a favor), en US$.
alter table public.pagos_delegacion add column diferencia_usd numeric not null default 0;

-- 5) Historial de cambios de prenda.
create table public.pedido_uniforme_items_cambios (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.pedido_uniforme_items(id) on delete cascade,
  antes jsonb not null,
  despues jsonb not null,
  diferencia_usd numeric not null,
  modificado_por uuid not null references public.administradores(id),
  created_at timestamptz not null default now()
);
create index pedido_uniforme_items_cambios_item_id on public.pedido_uniforme_items_cambios (item_id);
alter table public.pedido_uniforme_items_cambios enable row level security;

-- 6) registrar_pago_uniforme: ahora también guarda la manga de cada prenda.
create or replace function public.registrar_pago_uniforme(p_pago jsonb, p_items jsonb)
returns public.pagos_delegacion
language plpgsql
set search_path = public
as $$
declare
  v_pago public.pagos_delegacion;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido de uniformes debe tener al menos una prenda';
  end if;

  insert into public.pagos_delegacion (
    concepto, jugador_id, nombre_externo, monto, moneda, tipo_pago,
    referencia, fecha, notas, registrado_por, tasa_bcv, monto_usd_equivalente
  ) values (
    'uniforme',
    nullif(p_pago->>'jugador_id', '')::uuid,
    nullif(p_pago->>'nombre_externo', ''),
    (p_pago->>'monto')::numeric,
    coalesce(nullif(p_pago->>'moneda', ''), case when p_pago->>'tipo_pago' = 'efectivo' then 'USD' else 'BS' end),
    p_pago->>'tipo_pago',
    nullif(p_pago->>'referencia', ''),
    coalesce(nullif(p_pago->>'fecha', '')::date, (now() at time zone 'America/Caracas')::date),
    nullif(p_pago->>'notas', ''),
    nullif(p_pago->>'registrado_por', '')::uuid,
    nullif(p_pago->>'tasa_bcv', '')::numeric,
    nullif(p_pago->>'monto_usd_equivalente', '')::numeric
  )
  returning * into v_pago;

  insert into public.pedido_uniforme_items (pago_id, tipo_prenda, talla, cantidad, precio_unitario, manga)
  select v_pago.id, i->>'tipo_prenda', i->>'talla', (i->>'cantidad')::integer,
         nullif(i->>'precio_unitario', '')::numeric, nullif(i->>'manga', '')
  from jsonb_array_elements(p_items) as i;

  return v_pago;
end;
$$;

revoke execute on function public.registrar_pago_uniforme(jsonb, jsonb) from public, anon, authenticated;

-- 7) crear_lote_uniforme: falla con mensaje claro si hay franelas dama
-- pendientes sin manga (indica los recibos), antes de crear el lote.
create or replace function public.crear_lote_uniforme(p_enviado_por uuid, p_notas text default null)
returns public.lotes_uniforme
language plpgsql
set search_path = public
as $$
declare
  v_lote public.lotes_uniforme;
  v_prendas integer;
  v_recibos text;
begin
  select string_agg(distinct '#' || p.numero_recibo, ', ' order by '#' || p.numero_recibo)
    into v_recibos
    from public.pedido_uniforme_items i
    join public.pagos_delegacion p on p.id = i.pago_id
   where i.lote_id is null and p.validado and not p.anulado
     and i.tipo_prenda = 'franela_dama' and i.manga is null;
  if v_recibos is not null then
    raise exception 'No se puede enviar a fábrica: falta definir la manga de franelas dama en los recibos %. Corrígelas con "Modificar prenda".', v_recibos;
  end if;

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

-- 8) modificar_prenda_uniforme: cambia tipo/talla/manga de una prenda que
-- todavía no está en un lote y cuyo pago no está anulado, en una sola
-- transacción (bloquea la prenda). El monto pagado NO cambia: la diferencia
-- (precio US$ nuevo - precio US$ pagado) × cantidad se suma a
-- pagos_delegacion.diferencia_usd y queda en el historial.
--   precio US$ pagado: el precio unitario del pago en US$, o convertido con
--     la tasa congelada si fue en Bs.; si no se puede saber, el de referencia.
--   precio US$ nuevo: el de referencia actual (precios_prendas).
-- Con p_confirmar = false y diferencia distinta de 0 no cambia nada: solo
-- devuelve la diferencia, para que el admin la confirme.
create function public.modificar_prenda_uniforme(
  p_item_id uuid, p_tipo text, p_talla text, p_manga text, p_admin uuid, p_confirmar boolean
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_item public.pedido_uniforme_items;
  v_pago public.pagos_delegacion;
  v_usd_viejo numeric;
  v_usd_nuevo numeric;
  v_diferencia numeric;
  v_precio_nuevo numeric;
begin
  select * into v_item from public.pedido_uniforme_items where id = p_item_id for update;
  if not found then
    raise exception 'La prenda no existe' using errcode = 'no_data_found';
  end if;
  select * into v_pago from public.pagos_delegacion where id = v_item.pago_id for update;
  if v_item.lote_id is not null then
    raise exception 'Esta prenda ya está en un lote de fabricación; no se puede modificar';
  end if;
  if v_pago.anulado then
    raise exception 'El pago de esta prenda está anulado; no se puede modificar';
  end if;
  if v_item.tipo_prenda = p_tipo and v_item.talla = p_talla and v_item.manga is not distinct from nullif(p_manga, '') then
    raise exception 'No hay cambios en la prenda';
  end if;

  select precio_usd into v_usd_nuevo from public.precios_prendas where tipo_prenda = p_tipo;
  if v_usd_nuevo is null then
    raise exception 'La prenda % no tiene precio de referencia', p_tipo;
  end if;

  v_usd_viejo := case
    when v_pago.moneda = 'USD' then v_item.precio_unitario
    when v_item.precio_unitario is not null and v_pago.tasa_bcv is not null then round(v_item.precio_unitario / v_pago.tasa_bcv, 2)
  end;
  if v_usd_viejo is null then
    select precio_usd into v_usd_viejo from public.precios_prendas where tipo_prenda = v_item.tipo_prenda;
  end if;

  v_diferencia := round((v_usd_nuevo - coalesce(v_usd_viejo, v_usd_nuevo)) * v_item.cantidad, 2);

  if v_diferencia <> 0 and not coalesce(p_confirmar, false) then
    return jsonb_build_object('aplicado', false, 'diferencia_usd', v_diferencia);
  end if;

  -- Precio unitario en la moneda del pago, como en el registro original.
  v_precio_nuevo := case
    when v_pago.moneda = 'USD' then v_usd_nuevo
    when v_pago.tasa_bcv is not null then round(v_usd_nuevo * v_pago.tasa_bcv, 2)
  end;

  insert into public.pedido_uniforme_items_cambios (item_id, antes, despues, diferencia_usd, modificado_por)
  values (
    v_item.id,
    jsonb_build_object('tipo_prenda', v_item.tipo_prenda, 'talla', v_item.talla, 'manga', v_item.manga, 'precio_unitario', v_item.precio_unitario),
    jsonb_build_object('tipo_prenda', p_tipo, 'talla', p_talla, 'manga', nullif(p_manga, ''), 'precio_unitario', v_precio_nuevo),
    v_diferencia,
    p_admin
  );

  update public.pedido_uniforme_items
     set tipo_prenda = p_tipo, talla = p_talla, manga = nullif(p_manga, ''), precio_unitario = v_precio_nuevo
   where id = v_item.id;

  if v_diferencia <> 0 then
    update public.pagos_delegacion set diferencia_usd = diferencia_usd + v_diferencia where id = v_pago.id;
  end if;

  return jsonb_build_object('aplicado', true, 'diferencia_usd', v_diferencia);
end;
$$;

revoke execute on function public.modificar_prenda_uniforme(uuid, text, text, text, uuid, boolean) from public, anon, authenticated;
