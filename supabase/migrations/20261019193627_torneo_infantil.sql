-- Torneo Navidad HGV 2026 — sección Infantil (docs/torneo-navidad/SPEC.md §14).
--
-- 1. torneos: fecha de corte para la edad y "solo socios" (decisión pendiente).
-- 2. torneo_categorias: es_infantil + rango de edad, formato de partido,
--    plantilla de turnos propia (horario escuela) y género 'abierto'. En las
--    infantiles num_grupos × tamano_grupo ya no tiene que ser igual al cupo.
-- 3. torneo_menores: ficha del menor con su representante (siempre un
--    jugador con cuenta en la app, aunque no esté en el escalafón), contacto
--    de emergencia y autorizaciones. Sin datos médicos. Sin SELECT público
--    (como torneo_disponibilidad).
-- 4. torneo_inscripciones: de un jugador o de un menor (exactamente uno),
--    certificación de la categoría del menor por el admin, inscripción hecha
--    por un admin, y menor_nombre_publico ("Sofía M.") para grupos y llave.
-- 5. El trigger de inscripciones valida también al menor (edad, género,
--    duplicado, máximo 2 categorías y cupo).
--
-- pagos NO cambia: el pago de un menor va a nombre de su representante
-- (pagos.jugador_id). Representante sin cuenta: mejora futura (SPEC §14.6).

-- 1. Torneos -----------------------------------------------------------------

alter table public.torneos
  -- Edad de los menores calculada a esta fecha. Null = 31-dic del año de fecha_inicio.
  add column fecha_corte_edad date null,
  add column solo_socios boolean not null default false;

-- 2. Categorías --------------------------------------------------------------

alter table public.torneo_categorias
  add column es_infantil boolean not null default false,
  add column edad_min integer null check (edad_min >= 0),
  add column edad_max integer null check (edad_max >= 0),
  -- dos_sets_stb = 2 sets + súper tie-break (adultos, Infantil, Juvenil);
  -- un_set_6_tb = 1 set a 6 con tie-break (Verde); festival_4games = sets a 4 (Naranja).
  add column formato_partido text not null default 'dos_sets_stb'
    check (formato_partido in ('dos_sets_stb', 'un_set_6_tb', 'festival_4games')),
  -- Ventana de turnos propia: {"dias":[1..5], "desde":"15:00", "hasta":"18:00", "canchas":["HGV1","HGV2"]}.
  -- Null = plantilla adulta (SPEC §4).
  add column plantilla_turnos jsonb null check (plantilla_turnos is null or jsonb_typeof(plantilla_turnos) = 'object'),
  -- Festival: partidos mínimos garantizados por niño (Naranja: 3).
  add column partidos_minimos integer null check (partidos_minimos > 0);

alter table public.torneo_categorias add constraint torneo_categorias_edad_solo_infantil check (
  case when es_infantil
    then edad_min is not null and edad_max is not null and edad_min <= edad_max and modalidad = 'single'
    else edad_min is null and edad_max is null and plantilla_turnos is null
  end
);

-- 'abierto' = niños y niñas juntos (solo categorías infantiles).
alter table public.torneo_categorias drop constraint torneo_categorias_genero_check;
alter table public.torneo_categorias add constraint torneo_categorias_genero_check
  check (genero in ('caballeros', 'damas', 'mixto', 'abierto'));
alter table public.torneo_categorias add constraint torneo_categorias_abierto_es_infantil
  check (genero <> 'abierto' or es_infantil);

-- Festival sin llave: solo grupos.
alter table public.torneo_categorias drop constraint torneo_categorias_llave_desde_check;
alter table public.torneo_categorias add constraint torneo_categorias_llave_desde_check
  check (llave_desde in ('cuartos', 'semis', 'sin_llave'));
alter table public.torneo_categorias add constraint torneo_categorias_sin_llave_es_infantil
  check (llave_desde <> 'sin_llave' or es_infantil);

-- En las infantiles el número de inscritos es difícil de prever: el cupo es
-- un máximo y el admin ajusta grupos antes del sorteo.
alter table public.torneo_categorias drop constraint torneo_categorias_grupos_llenan_cupo;
alter table public.torneo_categorias add constraint torneo_categorias_grupos_llenan_cupo
  check (es_infantil or num_grupos * tamano_grupo = cupo);

-- 3. Menores -----------------------------------------------------------------

create table public.torneo_menores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) > 0),
  apellido text not null check (length(btrim(apellido)) > 0),
  fecha_nacimiento date not null,
  genero text not null check (genero in ('caballeros', 'damas')),   -- niño / niña, mismos valores que jugadores.genero
  numero_accion text null,

  -- Representante: siempre un jugador con cuenta (registro normal; no
  -- tiene que estar en el escalafón). Su pago va en pagos.jugador_id.
  representante_jugador_id uuid not null references public.jugadores(id),
  parentesco text not null check (parentesco in ('madre', 'padre', 'abuelo', 'tio', 'representante_legal', 'otro')),

  emergencia_nombre text not null check (length(btrim(emergencia_nombre)) > 0),
  emergencia_telefono text not null check (length(btrim(emergencia_telefono)) > 0),

  autorizacion_participacion boolean not null check (autorizacion_participacion),
  autorizacion_participacion_at timestamptz not null,
  autorizacion_imagen boolean not null default false,
  autorizacion_imagen_at timestamptz null,

  registrado_por_jugador uuid null references public.jugadores(id),
  registrado_por_admin uuid null references public.administradores(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint torneo_menores_imagen_con_fecha check (not autorizacion_imagen or autorizacion_imagen_at is not null),
  constraint torneo_menores_registrado_por check ((registrado_por_jugador is null) <> (registrado_por_admin is null))
);

create index torneo_menores_representante_idx on public.torneo_menores (representante_jugador_id);

-- Datos de menores: sin política de SELECT, solo rutas server con service role.
alter table public.torneo_menores enable row level security;

-- 4. Inscripciones -----------------------------------------------------------

alter table public.torneo_inscripciones
  alter column jugador1_id drop not null,
  add column menor_id uuid null references public.torneo_menores(id),
  -- Lo único público del menor: "Nombre I." (lo llena el trigger).
  add column menor_nombre_publico text null,
  -- El admin certifica la categoría del menor (como categoria_torneo en adultos).
  add column categoria_certificada_por uuid null references public.administradores(id),
  add column categoria_certificada_at timestamptz null,
  add column inscrita_por_admin uuid null references public.administradores(id);

alter table public.torneo_inscripciones add constraint torneo_inscripciones_jugador_o_menor check (
  (jugador1_id is null) <> (menor_id is null)
);
alter table public.torneo_inscripciones add constraint torneo_inscripciones_menor_sin_pareja check (
  menor_id is null or (jugador2_id is null and menor_nombre_publico is not null)
);
alter table public.torneo_inscripciones add constraint torneo_inscripciones_certificacion_con_fecha check (
  (categoria_certificada_por is null) = (categoria_certificada_at is null)
);

create index torneo_inscripciones_menor_idx on public.torneo_inscripciones (menor_id) where menor_id is not null;

create function public.torneo_nombre_publico_menor(p_nombre text, p_apellido text)
returns text
language sql
immutable
set search_path = public
as $$
  select btrim(p_nombre) || ' ' || upper(left(btrim(p_apellido), 1)) || '.'
$$;

-- 5. Trigger de validación ---------------------------------------------------

create or replace function public.torneo_inscripciones_validar()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_modalidad text;
  v_torneo_id uuid;
  v_cupo integer;
  v_ocupados integer;
  v_es_infantil boolean;
  v_genero_cat text;
  v_edad_min integer;
  v_edad_max integer;
  v_corte date;
  v_solo_socios boolean;
  v_menor public.torneo_menores;
  v_edad integer;
  v_jugador uuid;
  v_categorias integer;
begin
  -- El nombre público se mantiene al día también en las retiradas.
  if new.menor_id is not null then
    select * into v_menor from public.torneo_menores where id = new.menor_id;
    new.menor_nombre_publico := public.torneo_nombre_publico_menor(v_menor.nombre, v_menor.apellido);
  else
    new.menor_nombre_publico := null;
  end if;

  if new.estado = 'retirada' then
    return new;
  end if;

  -- Bloquea la categoría: serializa las inscripciones que compiten por su cupo.
  select c.modalidad, c.torneo_id, c.cupo, c.es_infantil, c.genero, c.edad_min, c.edad_max,
         coalesce(t.fecha_corte_edad, make_date(extract(year from t.fecha_inicio)::int, 12, 31)), t.solo_socios
    into v_modalidad, v_torneo_id, v_cupo, v_es_infantil, v_genero_cat, v_edad_min, v_edad_max, v_corte, v_solo_socios
  from public.torneo_categorias c
  join public.torneos t on t.id = c.torneo_id
  where c.id = new.categoria_id
  for update of c;

  if v_es_infantil and new.menor_id is null then
    raise exception 'Las categorías infantiles son para menores';
  end if;
  if not v_es_infantil and new.menor_id is not null then
    raise exception 'Un menor solo puede inscribirse en una categoría infantil';
  end if;

  if v_modalidad = 'single' and new.jugador2_id is not null then
    raise exception 'Una inscripción de single no lleva pareja';
  end if;
  if v_modalidad = 'doble' and new.jugador2_id is null then
    raise exception 'Una inscripción de dobles necesita pareja';
  end if;

  if tg_op = 'INSERT' or old.estado = 'retirada' or old.categoria_id <> new.categoria_id then
    select count(*) into v_ocupados
    from public.torneo_inscripciones i
    where i.categoria_id = new.categoria_id
      and i.id <> new.id
      and i.estado <> 'retirada';
    if v_ocupados >= v_cupo then
      raise exception 'La categoría ya no tiene cupo';
    end if;
  end if;

  if new.menor_id is not null then
    v_edad := extract(year from age(v_corte, v_menor.fecha_nacimiento))::int;
    if v_edad < v_edad_min or v_edad > v_edad_max then
      raise exception 'La edad del menor no corresponde a la categoría';
    end if;
    if v_genero_cat in ('caballeros', 'damas') and v_menor.genero <> v_genero_cat then
      raise exception 'El género del menor no corresponde a la categoría';
    end if;
    if v_solo_socios and coalesce(btrim(v_menor.numero_accion), '') = '' then
      raise exception 'El torneo es solo para socios: falta el N.º de acción del menor';
    end if;

    if exists (
      select 1 from public.torneo_inscripciones i
      where i.categoria_id = new.categoria_id
        and i.id <> new.id
        and i.estado <> 'retirada'
        and i.menor_id = new.menor_id
    ) then
      raise exception 'El menor ya está inscrito en esta categoría';
    end if;

    select count(distinct i.categoria_id) into v_categorias
    from public.torneo_inscripciones i
    join public.torneo_categorias c on c.id = i.categoria_id
    where c.torneo_id = v_torneo_id
      and i.id <> new.id
      and i.categoria_id <> new.categoria_id
      and i.estado <> 'retirada'
      and i.menor_id = new.menor_id;
    if v_categorias >= 2 then
      raise exception 'Un menor puede inscribirse en máximo 2 categorías del torneo';
    end if;

    return new;
  end if;

  foreach v_jugador in array array_remove(array[new.jugador1_id, new.jugador2_id], null) loop
    if exists (
      select 1 from public.torneo_inscripciones i
      where i.categoria_id = new.categoria_id
        and i.id <> new.id
        and i.estado <> 'retirada'
        and v_jugador in (i.jugador1_id, i.jugador2_id)
    ) then
      raise exception 'El jugador ya está inscrito en esta categoría';
    end if;

    select count(distinct i.categoria_id) into v_categorias
    from public.torneo_inscripciones i
    join public.torneo_categorias c on c.id = i.categoria_id
    where c.torneo_id = v_torneo_id
      and i.id <> new.id
      and i.categoria_id <> new.categoria_id
      and i.estado <> 'retirada'
      and v_jugador in (i.jugador1_id, i.jugador2_id);

    if v_categorias >= 2 then
      raise exception 'Un jugador puede inscribirse en máximo 2 categorías del torneo';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger torneo_inscripciones_validar on public.torneo_inscripciones;
create trigger torneo_inscripciones_validar
  before insert or update of categoria_id, jugador1_id, jugador2_id, menor_id, estado
  on public.torneo_inscripciones
  for each row execute function public.torneo_inscripciones_validar();

-- Si cambia el nombre del menor, se refresca su nombre público en sus
-- inscripciones. menor_nombre_publico no está en la lista "update of" del
-- trigger de validación, así que esto no vuelve a validar cupo ni edad.
create function public.torneo_menores_refrescar_nombre()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.torneo_inscripciones
     set menor_nombre_publico = public.torneo_nombre_publico_menor(new.nombre, new.apellido)
   where menor_id = new.id;
  return new;
end;
$$;

create trigger torneo_menores_refrescar_nombre
  after update of nombre, apellido on public.torneo_menores
  for each row execute function public.torneo_menores_refrescar_nombre();

revoke execute on function public.torneo_inscripciones_validar() from public, anon, authenticated;
revoke execute on function public.torneo_menores_refrescar_nombre() from public, anon, authenticated;
