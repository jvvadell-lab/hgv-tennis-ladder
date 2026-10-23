-- Línea del uniforme: Delegación (azul) o Academia (blanco). Todas las
-- prendas existen en ambas líneas con las mismas tallas y precios, así que
-- talla_segun_prenda y precios_prendas no cambian. El color no se guarda:
-- se deriva de la línea (Delegación = Azul, Academia = Blanco).
--
-- Las prendas que ya existían (todas, incluidas las de lotes enviados) son
-- de la Delegación. El default solo sirve para rellenarlas: se quita
-- enseguida, así cada prenda nueva tiene que traer su línea.

alter table public.pedido_uniforme_items
  add column linea text not null default 'delegacion',
  add constraint linea_valida check (linea in ('delegacion', 'academia'));
alter table public.pedido_uniforme_items alter column linea drop default;

-- Una prenda que ya está en un lote no cambia de línea: el lote ya se le
-- mandó al proveedor con esa línea. Es un trigger (no un check) porque
-- compara con el valor anterior.
create function public.bloquear_linea_en_lote()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.linea is distinct from old.linea and old.lote_id is not null then
    raise exception 'Esta prenda ya está en un lote de fabricación; no se puede cambiar el tipo de uniforme'
      using errcode = 'check_violation', constraint = 'linea_fija_en_lote';
  end if;
  return new;
end;
$$;

create trigger pedido_uniforme_items_bloquear_linea
  before update of linea on public.pedido_uniforme_items
  for each row execute function public.bloquear_linea_en_lote();

revoke execute on function public.bloquear_linea_en_lote() from public, anon, authenticated;

-- registrar_pago_uniforme: también guarda la línea de cada prenda (sin
-- valor por defecto: una prenda sin línea falla por el not null).
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
    concepto, jugador_id, nombre_externo, telefono_externo, numero_accion_externo, es_socio,
    monto, moneda, tipo_pago, referencia, fecha, notas, registrado_por, tasa_bcv, monto_usd_equivalente
  ) values (
    'uniforme',
    nullif(p_pago->>'jugador_id', '')::uuid,
    nullif(p_pago->>'nombre_externo', ''),
    nullif(p_pago->>'telefono_externo', ''),
    nullif(p_pago->>'numero_accion_externo', ''),
    coalesce((p_pago->>'es_socio')::boolean, true),
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

  insert into public.pedido_uniforme_items (pago_id, linea, tipo_prenda, talla, cantidad, precio_unitario, manga)
  select v_pago.id, nullif(i->>'linea', ''), i->>'tipo_prenda', i->>'talla', (i->>'cantidad')::integer,
         nullif(i->>'precio_unitario', '')::numeric, nullif(i->>'manga', '')
  from jsonb_array_elements(p_items) as i;

  return v_pago;
end;
$$;

revoke execute on function public.registrar_pago_uniforme(jsonb, jsonb) from public, anon, authenticated;

-- modificar_prenda_uniforme: ahora también cambia la línea (p_linea). El
-- precio depende solo del tipo de prenda, así que cambiar de línea no genera
-- diferencia. p_linea null = deja la que tiene (por compatibilidad con la
-- versión anterior de la ruta mientras se despliega).
drop function public.modificar_prenda_uniforme(uuid, text, text, text, uuid, boolean);

create function public.modificar_prenda_uniforme(
  p_item_id uuid, p_tipo text, p_talla text, p_manga text, p_admin uuid, p_confirmar boolean, p_linea text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_item public.pedido_uniforme_items;
  v_pago public.pagos_delegacion;
  v_linea text;
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
  v_linea := coalesce(nullif(p_linea, ''), v_item.linea);
  if v_item.linea = v_linea and v_item.tipo_prenda = p_tipo and v_item.talla = p_talla
     and v_item.manga is not distinct from nullif(p_manga, '') then
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

  -- Solo cambia la línea: sin diferencia y con el precio unitario que ya
  -- tenía. Si cambia algo más, la diferencia se calcula como siempre.
  if v_item.tipo_prenda = p_tipo and v_item.talla = p_talla and v_item.manga is not distinct from nullif(p_manga, '') then
    v_diferencia := 0;
    v_precio_nuevo := v_item.precio_unitario;
  else
    v_diferencia := round((v_usd_nuevo - coalesce(v_usd_viejo, v_usd_nuevo)) * v_item.cantidad, 2);
    if v_diferencia <> 0 and not coalesce(p_confirmar, false) then
      return jsonb_build_object('aplicado', false, 'diferencia_usd', v_diferencia);
    end if;
    -- Precio unitario en la moneda del pago, como en el registro original.
    v_precio_nuevo := case
      when v_pago.moneda = 'USD' then v_usd_nuevo
      when v_pago.tasa_bcv is not null then round(v_usd_nuevo * v_pago.tasa_bcv, 2)
    end;
  end if;

  insert into public.pedido_uniforme_items_cambios (item_id, antes, despues, diferencia_usd, modificado_por)
  values (
    v_item.id,
    jsonb_build_object('linea', v_item.linea, 'tipo_prenda', v_item.tipo_prenda, 'talla', v_item.talla, 'manga', v_item.manga, 'precio_unitario', v_item.precio_unitario),
    jsonb_build_object('linea', v_linea, 'tipo_prenda', p_tipo, 'talla', p_talla, 'manga', nullif(p_manga, ''), 'precio_unitario', v_precio_nuevo),
    v_diferencia,
    p_admin
  );

  update public.pedido_uniforme_items
     set linea = v_linea, tipo_prenda = p_tipo, talla = p_talla, manga = nullif(p_manga, ''), precio_unitario = v_precio_nuevo
   where id = v_item.id;

  if v_diferencia <> 0 then
    update public.pagos_delegacion set diferencia_usd = diferencia_usd + v_diferencia where id = v_pago.id;
  end if;

  return jsonb_build_object('aplicado', true, 'diferencia_usd', v_diferencia);
end;
$$;

revoke execute on function public.modificar_prenda_uniforme(uuid, text, text, text, uuid, boolean, text) from public, anon, authenticated;
