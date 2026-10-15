-- Personas con nombre libre en Delegación: casi siempre son socios que no se
-- registraron en la escalera, no invitados. Se guarda su N.º de acción
-- (como jugadores.numero_accion) y si es socio o no.
--
-- es_socio = true por defecto: los registros que ya existen quedan como
-- socios sin N.º de acción, y se completa desde el panel. La obligatoriedad
-- del N.º de acción para socios la valida la API al registrar, no un check,
-- porque los registros viejos no lo tienen.
alter table public.pagos_delegacion
  add column numero_accion_externo text null,
  add column es_socio boolean not null default true;

-- Teléfono, N.º de acción y "no es socio" son solo para nombre libre: los de
-- un jugador registrado salen de su ficha.
alter table public.pagos_delegacion add constraint datos_externo_solo_sin_jugador check (
  jugador_id is null or (telefono_externo is null and numero_accion_externo is null and es_socio)
);

-- registrar_pago_uniforme ahora también guarda los datos de nombre libre.
create or replace function public.registrar_pago_uniforme(p_pago jsonb, p_items jsonb)
 returns pagos_delegacion
 language plpgsql
 set search_path to 'public'
as $function$
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

  insert into public.pedido_uniforme_items (pago_id, tipo_prenda, talla, cantidad, precio_unitario, manga)
  select v_pago.id, i->>'tipo_prenda', i->>'talla', (i->>'cantidad')::integer,
         nullif(i->>'precio_unitario', '')::numeric, nullif(i->>'manga', '')
  from jsonb_array_elements(p_items) as i;

  return v_pago;
end;
$function$;
