-- Módulo "Delegación" en Pagos: cobros de la delegación HGV en torneos
-- inter-clubes (inscripciones) y compra de uniformes. Separado de la tabla
-- pagos (escalera, atada a temporada_id), que no se toca.
--
-- Igual que pagos: RLS activa y SIN políticas — todo se lee y se escribe
-- desde rutas server-side (app/api/admin/delegacion/...) con service role.

-- Torneos externos (tabla, no hardcodeado: sirve para futuros torneos)
create table public.torneos_externos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  sede text,
  fecha_inicio date,
  fecha_fin date,
  monto_inscripcion numeric,          -- referencial, editable en cada pago
  moneda text not null default 'USD' check (moneda in ('USD','BS')),
  activo boolean not null default true,
  created_at timestamptz default now()
);

insert into public.torneos_externos (nombre, sede) values
  ('Abierto Guataparo Country Club 2026', 'Guataparo Country Club'),
  ('Copa ASOCENCA 2026', null);

-- Cobros de la delegación (una fila = un pago recibido)
create sequence public.pagos_delegacion_recibo_seq;

create table public.pagos_delegacion (
  id uuid primary key default gen_random_uuid(),
  numero_recibo integer not null unique default nextval('public.pagos_delegacion_recibo_seq'),
  concepto text not null check (concepto in ('inscripcion_torneo','uniforme')),
  torneo_id uuid references public.torneos_externos(id),   -- obligatorio si concepto = inscripcion_torneo
  jugador_id uuid references public.jugadores(id),
  nombre_externo text,                                     -- por si paga alguien que no está en jugadores
  monto numeric not null check (monto > 0),
  moneda text not null default 'USD' check (moneda in ('USD','BS')),
  tipo_pago text not null check (tipo_pago in ('pago_movil','transferencia','efectivo')),
  referencia text,
  fecha date not null default (now() at time zone 'America/Caracas')::date,
  validado boolean not null default true,
  notas text,
  registrado_por uuid references public.administradores(id),
  -- Anular deja la huella del pago (no cuenta en totales, índice único ni
  -- matriz de tallas); borrar de verdad queda solo para admin completo.
  anulado boolean not null default false,
  anulado_at timestamptz,
  anulado_por uuid references public.administradores(id),
  motivo_anulacion text,
  created_at timestamptz default now(),
  constraint torneo_si_inscripcion check (
    (concepto = 'inscripcion_torneo' and torneo_id is not null)
    or (concepto = 'uniforme' and torneo_id is null)
  ),
  constraint jugador_o_externo check (jugador_id is not null or nombre_externo is not null),
  constraint anulado_con_fecha check (not anulado or anulado_at is not null),
  -- Efectivo siempre en dólares (igual que en pagos de la escalera), pago
  -- móvil siempre en bolívares; la transferencia puede ser en cualquiera
  -- de las dos (hay cuentas en dólares en bancos venezolanos).
  constraint efectivo_en_usd check (tipo_pago <> 'efectivo' or moneda = 'USD'),
  constraint pago_movil_en_bs check (tipo_pago <> 'pago_movil' or moneda = 'BS')
);

alter sequence public.pagos_delegacion_recibo_seq owned by public.pagos_delegacion.numero_recibo;

-- Evitar inscribir dos veces al mismo jugador en el mismo torneo (los
-- anulados no cuentan, así se puede reinscribir tras anular un pago).
create unique index pagos_delegacion_inscripcion_unica
  on public.pagos_delegacion (torneo_id, jugador_id)
  where concepto = 'inscripcion_torneo' and jugador_id is not null and not anulado;

-- Detalle de uniformes (un pago puede incluir varias prendas)
create table public.pedido_uniforme_items (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null references public.pagos_delegacion(id) on delete cascade,
  tipo_prenda text not null check (tipo_prenda in ('franela_dama','franela_caballero','chaqueta')),
  talla text not null check (talla in ('XS','S','M','L','XL','XXL','XXXL')),
  cantidad integer not null default 1 check (cantidad > 0),
  precio_unitario numeric,
  entregado boolean not null default false,
  entregado_at timestamptz,
  created_at timestamptz default now()
);

create index pedido_uniforme_items_pago_id on public.pedido_uniforme_items (pago_id);

alter table public.torneos_externos enable row level security;
alter table public.pagos_delegacion enable row level security;
alter table public.pedido_uniforme_items enable row level security;

-- Pago de uniformes + sus prendas en una sola transacción: si falla una
-- prenda, no queda el pago huérfano. Solo la llama la ruta server-side.
create function public.registrar_pago_uniforme(p_pago jsonb, p_items jsonb)
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
    referencia, fecha, notas, registrado_por
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
    nullif(p_pago->>'registrado_por', '')::uuid
  )
  returning * into v_pago;

  insert into public.pedido_uniforme_items (pago_id, tipo_prenda, talla, cantidad, precio_unitario)
  select v_pago.id, i->>'tipo_prenda', i->>'talla', (i->>'cantidad')::integer, nullif(i->>'precio_unitario', '')::numeric
  from jsonb_array_elements(p_items) as i;

  return v_pago;
end;
$$;

revoke execute on function public.registrar_pago_uniforme(jsonb, jsonb) from public, anon, authenticated;
