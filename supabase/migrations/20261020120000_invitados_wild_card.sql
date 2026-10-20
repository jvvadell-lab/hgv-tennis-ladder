-- Invitados / wild card (decisiones del 20-oct-2026, docs/torneo-navidad/SPEC.md §2.1).
--
-- 1. jugadores: un invitado (no socio) se registra con cuenta normal pero
--    sin N.º de acción (es_invitado). Juega los torneos a los que lo
--    invite el club; la escalera, los retos y las reservas son solo para
--    socios, salvo que un admin lo habilite (invitado_habilitado_*).
--    El registro se hace con la clave anónima (app/register), así que un
--    trigger impide que alguien se registre ya habilitado.
-- 2. El Torneo Navidad es solo para socios (adultos e infantiles).
-- 3. torneo_inscripciones.invitado_autorizado_*: el admin autoriza a un
--    invitado (o a un menor sin N.º de acción) como invitado / wild card en
--    esa inscripción. Sin autorización la inscripción no se confirma (lo
--    repite el trigger torneo_inscripciones_validar).

-- 1. Jugadores ----------------------------------------------------------------

alter table public.jugadores
  alter column numero_accion drop not null,
  add column es_invitado boolean not null default false,
  add column invitado_habilitado_por uuid null references public.administradores(id),
  add column invitado_habilitado_at timestamptz null,
  add constraint jugadores_socio_con_accion check (es_invitado or (numero_accion is not null and btrim(numero_accion) <> '')),
  add constraint jugadores_habilitacion_de_invitado check (
    (invitado_habilitado_por is null) = (invitado_habilitado_at is null)
    and (es_invitado or invitado_habilitado_at is null)
  );

-- La habilitación solo la da un admin (update por service role): al
-- registrarse nadie llega habilitado.
create function public.jugadores_registro_sin_habilitacion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.invitado_habilitado_por := null;
  new.invitado_habilitado_at := null;
  return new;
end;
$$;

create trigger jugadores_registro_sin_habilitacion
  before insert on public.jugadores
  for each row execute function public.jugadores_registro_sin_habilitacion();

-- 2 y 3. Torneo -----------------------------------------------------------------

update public.torneos set solo_socios = true where nombre = 'Torneo Navidad HGV 2026';

alter table public.torneo_inscripciones
  add column invitado_autorizado_por uuid null references public.administradores(id),
  add column invitado_autorizado_at timestamptz null,
  add constraint torneo_inscripciones_autorizacion_con_fecha check (
    (invitado_autorizado_por is null) = (invitado_autorizado_at is null)
  );

-- Mismo trigger de la sección infantil, con un cambio: "solo socios" ya no
-- rechaza la inscripción de un no socio; la deja pendiente y solo impide
-- confirmarla sin la autorización del admin (invitado / wild card).
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

  -- Solo socios: un no socio no se confirma sin la autorización del admin.
  if v_solo_socios and new.estado = 'confirmada' and new.invitado_autorizado_at is null and (
    (new.menor_id is not null and coalesce(btrim(v_menor.numero_accion), '') = '')
    or exists (
      select 1 from public.jugadores j
      where j.id in (new.jugador1_id, new.jugador2_id) and j.es_invitado
    )
  ) then
    raise exception 'El torneo es solo para socios: falta la autorización del admin como invitado / wild card';
  end if;

  if new.menor_id is not null then
    v_edad := extract(year from age(v_corte, v_menor.fecha_nacimiento))::int;
    if v_edad < v_edad_min or v_edad > v_edad_max then
      raise exception 'La edad del menor no corresponde a la categoría';
    end if;
    if v_genero_cat in ('caballeros', 'damas') and v_menor.genero <> v_genero_cat then
      raise exception 'El género del menor no corresponde a la categoría';
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

revoke execute on function public.jugadores_registro_sin_habilitacion() from public, anon, authenticated;
revoke execute on function public.torneo_inscripciones_validar() from public, anon, authenticated;
