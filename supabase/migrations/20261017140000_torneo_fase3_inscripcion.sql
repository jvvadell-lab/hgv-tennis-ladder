-- Torneo Navidad HGV 2026 — fase 3 (inscripción y pagos), docs/torneo-navidad/SPEC.md §2.
--
-- 1. Categoría oficial de torneo del jugador: la asigna solo el admin y es
--    independiente de jugadores.categoria (que la declara el jugador al
--    registrarse y mueve su puesto en ladder_posiciones). Null = todavía sin
--    asignar: el jugador puede inscribirse de forma provisional con su
--    categoría de la escalera, pero la inscripción no se confirma hasta que
--    el admin asigne una compatible.
-- 2. Limitaciones de horario del jugador por torneo: cuadrícula día × franja
--    (claves de lib/torneo.ts, p. ej. 'lun_1') + nota libre.
-- 3. torneo_inscripciones.inscrita_por: quién hizo la inscripción.
-- 4. El trigger de inscripciones también controla el cupo, con la categoría
--    bloqueada (for update) para que dos inscripciones simultáneas no pasen
--    las dos el último cupo.

alter table public.jugadores
  add column categoria_torneo text null
    check (categoria_torneo in ('sexta_novatos', 'sexta', 'quinta', 'cuarta')),
  add column categoria_torneo_asignada_por uuid null references public.administradores(id),
  add column categoria_torneo_asignada_at timestamptz null;

alter table public.torneo_inscripciones
  add column inscrita_por uuid null references public.jugadores(id);

create table public.torneo_disponibilidad (
  torneo_id uuid not null references public.torneos(id) on delete cascade,
  jugador_id uuid not null references public.jugadores(id) on delete cascade,
  -- Celdas en las que el jugador NO puede jugar ('lun_1', 'vie_2'…).
  no_disponible text[] not null default '{}',
  nota text null check (nota is null or length(nota) <= 500),
  updated_at timestamptz not null default now(),
  primary key (torneo_id, jugador_id)
);

-- Datos personales del jugador: sin política de SELECT, solo se leen por
-- rutas server-side con service role.
alter table public.torneo_disponibilidad enable row level security;

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
  v_jugador uuid;
  v_categorias integer;
begin
  if new.estado = 'retirada' then
    return new;
  end if;

  -- Bloquea la categoría: serializa las inscripciones que compiten por su cupo.
  select modalidad, torneo_id, cupo into v_modalidad, v_torneo_id, v_cupo
  from public.torneo_categorias where id = new.categoria_id
  for update;

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
