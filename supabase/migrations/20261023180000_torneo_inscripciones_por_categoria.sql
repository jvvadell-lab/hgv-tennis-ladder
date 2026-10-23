-- Torneo Navidad HGV 2026 — inscripciones abiertas por categoría (23-oct-2026).
--
-- Una categoría acepta inscripciones solo si el torneo está en 'inscripcion'
-- Y la categoría tiene inscripciones_abiertas = true. Arrancan todas
-- cerradas: el admin las abre una por una desde la pestaña Torneo, y queda
-- registrado quién hizo el último cambio y cuándo.
--
-- El trigger torneo_inscripciones_validar lo repite como red de seguridad,
-- al insertar o al reactivar una retirada. No aplica a lo que inscribe el
-- admin (inscrita_por_admin), que ya podía inscribir a un menor con el
-- torneo en borrador, ni a cambiar de categoría una inscripción existente
-- (corrección del admin antes del sorteo).

alter table public.torneo_categorias
  add column inscripciones_abiertas boolean not null default false,
  add column inscripciones_cambiadas_por uuid null references public.administradores(id),
  add column inscripciones_cambiadas_at timestamptz null;

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
  v_estado_torneo text;
  v_abiertas boolean;
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
         coalesce(t.fecha_corte_edad, make_date(extract(year from t.fecha_inicio)::int, 12, 31)), t.solo_socios,
         t.estado, c.inscripciones_abiertas
    into v_modalidad, v_torneo_id, v_cupo, v_es_infantil, v_genero_cat, v_edad_min, v_edad_max, v_corte, v_solo_socios,
         v_estado_torneo, v_abiertas
  from public.torneo_categorias c
  join public.torneos t on t.id = c.torneo_id
  where c.id = new.categoria_id
  for update of c;

  if (tg_op = 'INSERT' or old.estado = 'retirada')
     and new.inscrita_por_admin is null
     and not (v_estado_torneo = 'inscripcion' and v_abiertas) then
    raise exception 'Las inscripciones de esta categoría no están abiertas';
  end if;

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

revoke execute on function public.torneo_inscripciones_validar() from public, anon, authenticated;
