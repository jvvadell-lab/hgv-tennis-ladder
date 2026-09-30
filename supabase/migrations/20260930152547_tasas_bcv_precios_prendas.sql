-- Tasa BCV diaria (USD y EUR) y precios de uniformes en US$.
--
-- tasas_bcv reemplaza a la tabla vieja tasa_bcv (una sola fila, solo EUR,
-- carga manual, lectura pública). Una fila por fecha_vigencia (la "fecha
-- valor" del BCV); la tasa vigente hoy es la fila más reciente con
-- fecha_vigencia <= hoy en Caracas, así fines de semana y feriados queda la
-- del último día hábil. Se captura a diario desde DolarAPI
-- (/api/cron/tasa-bcv) o a mano por un admin completo.
--
-- Igual que pagos: RLS activa y sin políticas; se lee desde el servidor.

create table public.tasas_bcv (
  id uuid primary key default gen_random_uuid(),
  fecha_vigencia date not null unique,
  usd numeric not null check (usd > 0),
  eur numeric not null check (eur > 0),
  fuente text not null check (fuente in ('dolarapi', 'manual')),
  capturada_at timestamptz not null default now(),
  registrada_por uuid references public.administradores(id),
  -- registrada_por solo aplica (y es obligatorio) en cargas manuales
  constraint manual_con_admin check ((fuente = 'manual') = (registrada_por is not null))
);

alter table public.tasas_bcv enable row level security;

-- Precios de referencia de las prendas, en US$ (editables por admin completo).
create table public.precios_prendas (
  tipo_prenda text primary key check (tipo_prenda in ('franela_dama', 'franela_caballero', 'chaqueta')),
  precio_usd numeric not null check (precio_usd > 0),
  updated_at timestamptz not null default now(),
  updated_por uuid references public.administradores(id)
);

insert into public.precios_prendas (tipo_prenda, precio_usd) values
  ('franela_dama', 23),
  ('franela_caballero', 23),
  ('chaqueta', 50);

alter table public.precios_prendas enable row level security;

-- Tasa aplicada y equivalente en US$ de los pagos en Bs., congelados al
-- registrar: los reportes no cambian cuando la tasa sube después. Pueden
-- quedar en null si no había tasa cargada (el pago no se bloquea).
alter table public.pagos_delegacion
  add column tasa_bcv numeric check (tasa_bcv > 0),
  add column monto_usd_equivalente numeric check (monto_usd_equivalente > 0),
  add constraint tasa_solo_en_bs check (moneda = 'BS' or (tasa_bcv is null and monto_usd_equivalente is null));

-- registrar_pago_uniforme ahora también guarda tasa_bcv y monto_usd_equivalente.
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

  insert into public.pedido_uniforme_items (pago_id, tipo_prenda, talla, cantidad, precio_unitario)
  select v_pago.id, i->>'tipo_prenda', i->>'talla', (i->>'cantidad')::integer, nullif(i->>'precio_unitario', '')::numeric
  from jsonb_array_elements(p_items) as i;

  return v_pago;
end;
$$;

revoke execute on function public.registrar_pago_uniforme(jsonb, jsonb) from public, anon, authenticated;
