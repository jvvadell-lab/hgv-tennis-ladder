-- Torneo Navidad HGV 2026 — inscripción INDIVIDUAL en dobles (rediseño del
-- 23-oct-2026, docs/torneo-navidad/SPEC.md §2.2).
--
-- Va DESPUÉS de torneo_programacion, invitados_wild_card y torneo_resultados.
--
-- 1. torneo_inscripciones es siempre de UNA persona (jugador o menor), con su
--    pago, su categoría oficial/certificación y su autorización de invitado.
--    En dobles cada jugador se inscribe y paga solo: el cupo de una categoría
--    de dobles es cupo (parejas) × 2 inscripciones.
-- 2. torneo_equipos: el competidor del cuadro. En dobles es la dupla (dos
--    inscripciones); en single e infantil, una sola inscripción, y se crea
--    sola al inscribirse (trigger). Grupos, partidos y resultados apuntan a
--    equipos. La siembra y el bombo pasan aquí.
-- 3. torneo_invitaciones: invitación a formar dupla, a un jugador de la app o
--    a un teléfono sin cuenta. Vence a las 48 h o al cierre de inscripciones
--    (lo calcula el servidor al leer/actuar, sin cron). Tiene teléfonos: sin
--    lectura pública.
-- 4. torneo_aceptar_invitacion: aceptar en una transacción (inscribir al
--    invitado si hace falta, formar la dupla y cancelar sus otras
--    invitaciones de la categoría).
-- 5. torneos.cierre_inscripciones_at (cuenta regresiva; el cierre lo hace el
--    admin), torneo_inscripciones.devolucion_marcada_* y
--    notificaciones.torneo_invitacion_id (Aceptar/Rechazar en la campana).
--
-- Grupos y partidos se reorganizan con sus columnas renombradas: la
-- migración se niega a correr si ya tienen filas.

do $$
begin
  if exists (select 1 from public.torneo_grupo_miembros) or exists (select 1 from public.torneo_partidos) then
    raise exception 'Ya hay grupos o partidos del torneo: esta migración solo corre antes del primer sorteo';
  end if;
  if exists (select 1 from public.torneo_inscripciones where jugador2_id is not null and estado <> 'retirada') then
    raise exception 'Hay inscripciones de pareja vivas: hay que retirarlas antes de pasar a inscripción individual';
  end if;
end;
$$;

-- 1. Inscripciones individuales ----------------------------------------------

alter table public.torneo_inscripciones
  add column devolucion_marcada_por uuid null references public.administradores(id),
  add column devolucion_marcada_at timestamptz null,
  add constraint torneo_inscripciones_devolucion_con_fecha check (
    (devolucion_marcada_por is null) = (devolucion_marcada_at is null)
  );

-- Las de pareja retiradas (si las hubiera) dejan de tener pareja; desde ahora
-- nadie la tiene. La columna se borra en una limpieza posterior.
update public.torneo_inscripciones set jugador2_id = null where jugador2_id is not null;
alter table public.torneo_inscripciones add constraint torneo_inscripciones_individual check (jugador2_id is null);

alter table public.torneos
  add column cierre_inscripciones_at timestamptz null;

-- 2. Equipos -------------------------------------------------------------------

create table public.torneo_equipos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.torneo_categorias(id) on delete cascade,
  inscripcion1_id uuid not null references public.torneo_inscripciones(id) on delete cascade,
  inscripcion2_id uuid null references public.torneo_inscripciones(id) on delete cascade,
  estado text not null default 'activo' check (estado in ('activo', 'disuelto')),
  -- individual = single/infantil (automático) · invitacion = la aceptaron · admin = la armó el admin
  origen text not null check (origen in ('individual', 'invitacion', 'admin')),
  siembra integer null check (siembra > 0),
  bombo integer null check (bombo between 1 and 26),
  formado_por_jugador uuid null references public.jugadores(id),
  formado_por_admin uuid null references public.administradores(id),
  created_at timestamptz not null default now(),
  disuelto_at timestamptz null,
  disuelto_por_admin uuid null references public.administradores(id),
  constraint torneo_equipos_distintas check (inscripcion2_id is null or inscripcion2_id <> inscripcion1_id),
  constraint torneo_equipos_disuelto_con_fecha check ((estado = 'disuelto') = (disuelto_at is not null))
);

create index torneo_equipos_categoria_idx on public.torneo_equipos (categoria_id) where estado = 'activo';
create index torneo_equipos_inscripcion1_idx on public.torneo_equipos (inscripcion1_id);
create index torneo_equipos_inscripcion2_idx on public.torneo_equipos (inscripcion2_id) where inscripcion2_id is not null;
create unique index torneo_equipos_siembra_unica on public.torneo_equipos (categoria_id, siembra)
  where siembra is not null and estado = 'activo';

-- Reglas de un equipo activo (la API las valida antes con mensajes claros):
-- inscripciones vivas de su misma categoría, en dobles dos y en single una,
-- cada inscripción en un solo equipo activo, el Mixto con un caballero y una
-- dama, y no más equipos que el cupo (parejas). Un equipo que ya está en un
-- grupo (después del sorteo) no se disuelve.
create function public.torneo_equipos_validar()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_modalidad text;
  v_genero text;
  v_cupo integer;
  v_activos integer;
  v_ins uuid;
  v_ins_cat uuid;
  v_ins_estado text;
  v_generos text[];
begin
  if tg_op = 'UPDATE' and old.estado = 'activo' and new.estado = 'disuelto' then
    if exists (select 1 from public.torneo_grupo_miembros m where m.equipo_id = old.id) then
      raise exception 'Este equipo ya está en el sorteo: no se puede deshacer';
    end if;
    return new;
  end if;
  if new.estado <> 'activo' then
    return new;
  end if;

  select modalidad, genero, cupo into v_modalidad, v_genero, v_cupo
  from public.torneo_categorias where id = new.categoria_id
  for update;

  if v_modalidad = 'doble' and new.inscripcion2_id is null then
    raise exception 'Una dupla necesita dos jugadores';
  end if;
  if v_modalidad = 'single' and new.inscripcion2_id is not null then
    raise exception 'En single el equipo es un solo jugador';
  end if;

  foreach v_ins in array array_remove(array[new.inscripcion1_id, new.inscripcion2_id], null) loop
    select categoria_id, estado into v_ins_cat, v_ins_estado from public.torneo_inscripciones where id = v_ins;
    if v_ins_cat is distinct from new.categoria_id then
      raise exception 'Los dos jugadores tienen que estar inscritos en la categoría';
    end if;
    if v_ins_estado = 'retirada' then
      raise exception 'Uno de los jugadores tiene la inscripción retirada';
    end if;
    if exists (
      select 1 from public.torneo_equipos e
      where e.estado = 'activo' and e.id <> new.id and v_ins in (e.inscripcion1_id, e.inscripcion2_id)
    ) then
      raise exception 'Uno de los jugadores ya está en una dupla de esta categoría';
    end if;
  end loop;

  if v_genero = 'mixto' then
    select array_agg(j.genero order by j.genero) into v_generos
    from public.torneo_inscripciones i join public.jugadores j on j.id = i.jugador1_id
    where i.id in (new.inscripcion1_id, new.inscripcion2_id);
    if v_generos is distinct from array['caballeros', 'damas']::text[] then
      raise exception 'El Mixto es para una pareja de un caballero y una dama';
    end if;
  end if;

  if tg_op = 'INSERT' or old.estado <> 'activo' then
    select count(*) into v_activos
    from public.torneo_equipos e
    where e.categoria_id = new.categoria_id and e.estado = 'activo' and e.id <> new.id;
    if v_activos >= v_cupo then
      raise exception 'La categoría ya tiene todas sus parejas';
    end if;
  end if;

  return new;
end;
$$;

create trigger torneo_equipos_validar
  before insert or update on public.torneo_equipos
  for each row execute function public.torneo_equipos_validar();

-- Equipo automático en single e infantil, y disolución al retirarse o al
-- trasladarse de categoría (el compañero de dupla vuelve a "disponible").
create function public.torneo_inscripciones_equipo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_modalidad text;
begin
  if tg_op = 'UPDATE' and (new.estado = 'retirada' or new.categoria_id <> old.categoria_id) then
    update public.torneo_equipos
       set estado = 'disuelto', disuelto_at = now()
     where estado = 'activo' and new.id in (inscripcion1_id, inscripcion2_id);
  end if;

  if new.estado = 'retirada' then
    return new;
  end if;

  select modalidad into v_modalidad from public.torneo_categorias where id = new.categoria_id;
  if v_modalidad = 'single' and not exists (
    select 1 from public.torneo_equipos e where e.estado = 'activo' and e.inscripcion1_id = new.id
  ) then
    insert into public.torneo_equipos (categoria_id, inscripcion1_id, origen)
    values (new.categoria_id, new.id, 'individual');
  end if;
  return new;
end;
$$;

create trigger torneo_inscripciones_equipo
  after insert or update of estado, categoria_id on public.torneo_inscripciones
  for each row execute function public.torneo_inscripciones_equipo();

-- Equipos de las inscripciones de single/infantil que ya existan, con su siembra y bombo.
insert into public.torneo_equipos (categoria_id, inscripcion1_id, origen, siembra, bombo)
select i.categoria_id, i.id, 'individual', i.siembra, i.bombo
from public.torneo_inscripciones i
join public.torneo_categorias c on c.id = i.categoria_id
where c.modalidad = 'single' and i.estado <> 'retirada';

drop index if exists public.torneo_inscripciones_siembra_unica;
alter table public.torneo_inscripciones drop column siembra, drop column bombo;

-- Cupo: en dobles, parejas × 2 inscripciones individuales. Mismo trigger de
-- invitados_wild_card con dos cambios: dobles sin jugador2 y el cupo.
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
  if new.menor_id is not null then
    select * into v_menor from public.torneo_menores where id = new.menor_id;
    new.menor_nombre_publico := public.torneo_nombre_publico_menor(v_menor.nombre, v_menor.apellido);
  else
    new.menor_nombre_publico := null;
  end if;

  if new.estado = 'retirada' then
    return new;
  end if;

  select c.modalidad, c.torneo_id, c.cupo, c.es_infantil, c.genero, c.edad_min, c.edad_max,
         coalesce(t.fecha_corte_edad, make_date(extract(year from t.fecha_inicio)::int, 12, 31)), t.solo_socios,
         t.estado, c.inscripciones_abiertas
    into v_modalidad, v_torneo_id, v_cupo, v_es_infantil, v_genero_cat, v_edad_min, v_edad_max, v_corte, v_solo_socios,
         v_estado_torneo, v_abiertas
  from public.torneo_categorias c
  join public.torneos t on t.id = c.torneo_id
  where c.id = new.categoria_id
  for update of c;

  -- Interruptor por categoría (20261023183737): no aplica a lo que inscribe el admin.
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
  if new.jugador2_id is not null then
    raise exception 'Cada jugador se inscribe por separado: la pareja se forma aparte';
  end if;

  if tg_op = 'INSERT' or old.estado = 'retirada' or old.categoria_id <> new.categoria_id then
    select count(*) into v_ocupados
    from public.torneo_inscripciones i
    where i.categoria_id = new.categoria_id
      and i.id <> new.id
      and i.estado <> 'retirada';
    if v_ocupados >= v_cupo * (case when v_modalidad = 'doble' then 2 else 1 end) then
      raise exception 'La categoría ya no tiene cupo';
    end if;
  end if;

  if v_solo_socios and new.estado = 'confirmada' and new.invitado_autorizado_at is null and (
    (new.menor_id is not null and coalesce(btrim(v_menor.numero_accion), '') = '')
    or exists (select 1 from public.jugadores j where j.id = new.jugador1_id and j.es_invitado)
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
      where i.categoria_id = new.categoria_id and i.id <> new.id and i.estado <> 'retirada' and i.menor_id = new.menor_id
    ) then
      raise exception 'El menor ya está inscrito en esta categoría';
    end if;
    select count(distinct i.categoria_id) into v_categorias
    from public.torneo_inscripciones i
    join public.torneo_categorias c on c.id = i.categoria_id
    where c.torneo_id = v_torneo_id and i.id <> new.id and i.categoria_id <> new.categoria_id
      and i.estado <> 'retirada' and i.menor_id = new.menor_id;
    if v_categorias >= 2 then
      raise exception 'Un menor puede inscribirse en máximo 2 categorías del torneo';
    end if;
    return new;
  end if;

  v_jugador := new.jugador1_id;
  if exists (
    select 1 from public.torneo_inscripciones i
    where i.categoria_id = new.categoria_id and i.id <> new.id and i.estado <> 'retirada' and i.jugador1_id = v_jugador
  ) then
    raise exception 'El jugador ya está inscrito en esta categoría';
  end if;
  select count(distinct i.categoria_id) into v_categorias
  from public.torneo_inscripciones i
  join public.torneo_categorias c on c.id = i.categoria_id
  where c.torneo_id = v_torneo_id and i.id <> new.id and i.categoria_id <> new.categoria_id
    and i.estado <> 'retirada' and i.jugador1_id = v_jugador;
  if v_categorias >= 2 then
    raise exception 'Un jugador puede inscribirse en máximo 2 categorías del torneo';
  end if;

  return new;
end;
$$;

-- 3. Grupos y partidos apuntan a equipos ----------------------------------------

alter table public.torneo_grupo_miembros drop constraint torneo_grupo_miembros_inscripcion_id_fkey;
alter table public.torneo_grupo_miembros rename column inscripcion_id to equipo_id;
alter table public.torneo_grupo_miembros add constraint torneo_grupo_miembros_equipo_id_fkey
  foreign key (equipo_id) references public.torneo_equipos(id) on delete cascade;
alter index public.torneo_grupo_miembros_inscripcion_unica rename to torneo_grupo_miembros_equipo_unico;

alter table public.torneo_partidos
  drop constraint torneo_partidos_inscripcion_a_fkey,
  drop constraint torneo_partidos_inscripcion_b_fkey,
  drop constraint torneo_partidos_ganador_inscripcion_id_fkey,
  drop constraint torneo_partidos_wo_ausente_inscripcion_id_fkey,
  drop constraint torneo_partidos_retirada_inscripcion_id_fkey,
  drop constraint if exists torneo_partidos_handicap_inscripcion_id_fkey;

alter table public.torneo_partidos rename column inscripcion_a to equipo_a;
alter table public.torneo_partidos rename column inscripcion_b to equipo_b;
alter table public.torneo_partidos rename column ganador_inscripcion_id to ganador_equipo_id;
alter table public.torneo_partidos rename column wo_ausente_inscripcion_id to wo_ausente_equipo_id;
alter table public.torneo_partidos rename column retirada_inscripcion_id to retirada_equipo_id;
alter table public.torneo_partidos rename column handicap_inscripcion_id to handicap_equipo_id;

alter table public.torneo_partidos
  add constraint torneo_partidos_equipo_a_fkey foreign key (equipo_a) references public.torneo_equipos(id),
  add constraint torneo_partidos_equipo_b_fkey foreign key (equipo_b) references public.torneo_equipos(id),
  add constraint torneo_partidos_ganador_equipo_id_fkey foreign key (ganador_equipo_id) references public.torneo_equipos(id),
  add constraint torneo_partidos_wo_ausente_equipo_id_fkey foreign key (wo_ausente_equipo_id) references public.torneo_equipos(id),
  add constraint torneo_partidos_retirada_equipo_id_fkey foreign key (retirada_equipo_id) references public.torneo_equipos(id),
  add constraint torneo_partidos_handicap_equipo_id_fkey foreign key (handicap_equipo_id) references public.torneo_equipos(id);

-- Los checks (rivales distintos, ganador es rival, WO, retiro, handicap)
-- siguen a las columnas renombradas; sus nombres conservan "inscripcion"
-- solo donde lo traía el nombre del constraint.

create or replace function public.torneo_partidos_validar_handicap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.handicap_equipo_id is not null and not exists (
    select 1 from public.torneo_categorias c where c.id = new.categoria_id and c.genero = 'mixto'
  ) then
    raise exception 'El handicap solo se usa en la categoría Mixto';
  end if;
  return new;
end;
$$;

-- Sorteo POR CATEGORÍA y sobre equipos (pedido del 23-oct-2026). Cada
-- categoría se sortea y se publica por separado (queda fija al publicarla y
-- se le cierran las inscripciones); el torneo pasa a 'sorteado' cuando ya
-- están sorteadas todas las categorías no canceladas. En la categoría entran
-- exactamente sus equipos activos.
alter table public.torneo_categorias
  add column sorteo_metodo text null check (sorteo_metodo in ('bombos', 'serpentina')),
  add column sorteo_publicado_por uuid null references public.administradores(id),
  add column sorteo_publicado_at timestamptz null,
  -- Cancelada (menos de 3 equipos, o fusionada con otra): no se sortea.
  add column cancelada_at timestamptz null,
  add column cancelada_por uuid null references public.administradores(id),
  add column fusionada_en uuid null references public.torneo_categorias(id),
  add constraint torneo_categorias_sorteo_completo check (
    (sorteo_metodo is null) = (sorteo_publicado_por is null)
    and (sorteo_metodo is null) = (sorteo_publicado_at is null)
  ),
  add constraint torneo_categorias_cancelada_con_admin check ((cancelada_at is null) = (cancelada_por is null)),
  add constraint torneo_categorias_sorteada_o_cancelada check (sorteo_publicado_at is null or cancelada_at is null);

drop function public.torneo_publicar_sorteo(uuid, text, uuid, jsonb);

create function public.torneo_publicar_sorteo_categoria(p_categoria_id uuid, p_metodo text, p_admin_id uuid, p_plan jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_cat public.torneo_categorias;
  v_estado text;
  v_grupo jsonb;
  v_partido jsonb;
  v_miembro jsonb;
  v_grupo_id uuid;
  v_esperados uuid[];
  v_recibidos uuid[];
  v_pos integer;
  v_letras jsonb;
begin
  if p_metodo not in ('bombos', 'serpentina') then
    raise exception 'Método de sorteo no válido';
  end if;

  select * into v_cat from public.torneo_categorias where id = p_categoria_id for update;
  if v_cat.id is null then
    raise exception 'Categoría no encontrada';
  end if;
  select estado into v_estado from public.torneos where id = v_cat.torneo_id for update;
  if v_estado not in ('borrador', 'inscripcion') then
    raise exception 'El sorteo del torneo ya terminó (está en %)', v_estado;
  end if;
  if v_cat.cancelada_at is not null then
    raise exception '%: la categoría está cancelada', v_cat.nombre;
  end if;
  if v_cat.sorteo_publicado_at is not null
     or exists (select 1 from public.torneo_grupos where categoria_id = p_categoria_id)
     or exists (select 1 from public.torneo_partidos where categoria_id = p_categoria_id) then
    raise exception '%: el sorteo ya se publicó', v_cat.nombre;
  end if;
  if jsonb_typeof(p_plan) <> 'object' or (p_plan->>'categoria_id')::uuid is distinct from p_categoria_id then
    raise exception 'Plan de sorteo no válido';
  end if;

  -- Nadie se retira ni cambia de dupla a mitad de la publicación.
  perform 1 from public.torneo_inscripciones where categoria_id = p_categoria_id for update;
  perform 1 from public.torneo_equipos where categoria_id = p_categoria_id for update;

  select coalesce(array_agg(id order by id), '{}') into v_esperados
  from public.torneo_equipos
  where categoria_id = p_categoria_id and estado = 'activo';

  select coalesce(array_agg(m::uuid order by m::uuid), '{}') into v_recibidos
  from jsonb_array_elements(p_plan->'grupos') g, jsonb_array_elements_text(g->'miembros') m;

  if coalesce(array_length(v_esperados, 1), 0) < 3 then
    raise exception '%: hacen falta al menos 3 duplas o inscritos para sortear', v_cat.nombre;
  end if;
  if v_esperados <> v_recibidos then
    raise exception '%: las duplas o inscripciones cambiaron desde la vista previa. Repite el sorteo.', v_cat.nombre;
  end if;

  v_letras := '{}'::jsonb;
  for v_grupo in select * from jsonb_array_elements(p_plan->'grupos') loop
    insert into public.torneo_grupos (categoria_id, letra)
    values (p_categoria_id, v_grupo->>'letra')
    returning id into v_grupo_id;
    v_letras := v_letras || jsonb_build_object(v_grupo->>'letra', v_grupo_id);

    v_pos := 0;
    for v_miembro in select * from jsonb_array_elements(v_grupo->'miembros') loop
      v_pos := v_pos + 1;
      insert into public.torneo_grupo_miembros (grupo_id, equipo_id, siembra)
      values (v_grupo_id, (v_miembro #>> '{}')::uuid, v_pos);
    end loop;
  end loop;

  for v_partido in select * from jsonb_array_elements(p_plan->'partidos') loop
    if (v_partido->>'fase') = 'grupo' and not (v_letras ? (v_partido->>'letra')) then
      raise exception '%: partido de un grupo que no existe', v_cat.nombre;
    end if;
    insert into public.torneo_partidos
      (categoria_id, fase, grupo_id, orden, origen_a, origen_b, equipo_a, equipo_b)
    values (
      p_categoria_id,
      v_partido->>'fase',
      case when (v_partido->>'fase') = 'grupo' then (v_letras->>(v_partido->>'letra'))::uuid end,
      (v_partido->>'orden')::integer,
      v_partido->>'origen_a',
      v_partido->>'origen_b',
      (v_partido->>'equipo_a')::uuid,
      (v_partido->>'equipo_b')::uuid
    );
  end loop;

  if exists (
    select 1 from public.torneo_partidos p
    where p.categoria_id = p_categoria_id and p.fase = 'grupo'
      and (
        not exists (select 1 from public.torneo_grupo_miembros m where m.grupo_id = p.grupo_id and m.equipo_id = p.equipo_a)
        or not exists (select 1 from public.torneo_grupo_miembros m where m.grupo_id = p.grupo_id and m.equipo_id = p.equipo_b)
      )
  ) then
    raise exception 'Hay un partido de grupo entre equipos que no son de ese grupo';
  end if;

  update public.torneo_categorias
     set sorteo_metodo = p_metodo, sorteo_publicado_por = p_admin_id, sorteo_publicado_at = now(),
         inscripciones_abiertas = false, inscripciones_cambiadas_por = p_admin_id, inscripciones_cambiadas_at = now()
   where id = p_categoria_id;

  -- Última categoría: el torneo queda sorteado (programación y resultados).
  if not exists (
    select 1 from public.torneo_categorias
    where torneo_id = v_cat.torneo_id and cancelada_at is null and sorteo_publicado_at is null
  ) then
    update public.torneos
       set estado = 'sorteado', sorteo_metodo = p_metodo, sorteo_publicado_por = p_admin_id, sorteo_publicado_at = now()
     where id = v_cat.torneo_id;
  end if;
end;
$$;

-- Cancelar una categoría antes de su sorteo (p. ej. menos de 3 equipos). Se
-- retiran sus inscripciones vivas y se marcan para devolución, salvo que
-- p_destino_id la fusione con otra compatible: entonces las inscripciones se
-- trasladan allá con sus duplas (la API valida nivel y género; aquí, cupo y
-- modalidad). Si con esto ya están sorteadas las demás, el torneo queda
-- sorteado.
create function public.torneo_cancelar_categoria(p_categoria_id uuid, p_admin_id uuid, p_destino_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_cat public.torneo_categorias;
  v_dest public.torneo_categorias;
  v_estado text;
  v_ins uuid[];
  v_duplas record;
  v_vivas integer;
begin
  select * into v_cat from public.torneo_categorias where id = p_categoria_id for update;
  if v_cat.id is null then
    raise exception 'Categoría no encontrada';
  end if;
  select estado into v_estado from public.torneos where id = v_cat.torneo_id for update;
  if v_estado not in ('borrador', 'inscripcion') then
    raise exception 'El sorteo del torneo ya terminó';
  end if;
  if v_cat.cancelada_at is not null then
    raise exception '%: ya estaba cancelada', v_cat.nombre;
  end if;
  if v_cat.sorteo_publicado_at is not null then
    raise exception '%: ya se sorteó', v_cat.nombre;
  end if;

  select coalesce(array_agg(id order by created_at), '{}') into v_ins
  from public.torneo_inscripciones where categoria_id = p_categoria_id and estado <> 'retirada';
  v_vivas := coalesce(array_length(v_ins, 1), 0);

  if p_destino_id is not null then
    select * into v_dest from public.torneo_categorias where id = p_destino_id for update;
    if v_dest.id is null or v_dest.torneo_id <> v_cat.torneo_id or v_dest.id = v_cat.id then
      raise exception 'Categoría de destino no válida';
    end if;
    if v_dest.cancelada_at is not null or v_dest.sorteo_publicado_at is not null then
      raise exception '%: no recibe inscripciones (cancelada o ya sorteada)', v_dest.nombre;
    end if;
    if v_dest.modalidad <> v_cat.modalidad or v_dest.es_infantil <> v_cat.es_infantil then
      raise exception 'Solo se fusiona con una categoría de la misma modalidad';
    end if;

    -- Las duplas activas, para rearmarlas en el destino (el traslado las disuelve).
    create temporary table _duplas on commit drop as
      select inscripcion1_id, inscripcion2_id, origen, siembra, bombo, formado_por_jugador, formado_por_admin
      from public.torneo_equipos
      where categoria_id = p_categoria_id and estado = 'activo' and inscripcion2_id is not null;

    update public.torneo_inscripciones set categoria_id = p_destino_id where id = any(v_ins);

    for v_duplas in select * from _duplas loop
      insert into public.torneo_equipos (categoria_id, inscripcion1_id, inscripcion2_id, origen, formado_por_jugador, formado_por_admin)
      values (p_destino_id, v_duplas.inscripcion1_id, v_duplas.inscripcion2_id, v_duplas.origen, v_duplas.formado_por_jugador,
              coalesce(v_duplas.formado_por_admin, p_admin_id));
    end loop;
  else
    update public.torneo_inscripciones
       set estado = 'retirada', devolucion_marcada_por = p_admin_id, devolucion_marcada_at = now()
     where id = any(v_ins);
  end if;

  update public.torneo_invitaciones
     set estado = 'cancelada', respondida_at = now(), motivo = 'La categoría se canceló'
   where categoria_id = p_categoria_id and estado = 'pendiente';

  update public.torneo_categorias
     set cancelada_at = now(), cancelada_por = p_admin_id, fusionada_en = p_destino_id,
         inscripciones_abiertas = false, inscripciones_cambiadas_por = p_admin_id, inscripciones_cambiadas_at = now()
   where id = p_categoria_id;

  if exists (select 1 from public.torneo_categorias where torneo_id = v_cat.torneo_id and sorteo_publicado_at is not null)
     and not exists (
       select 1 from public.torneo_categorias
       where torneo_id = v_cat.torneo_id and cancelada_at is null and sorteo_publicado_at is null
     ) then
    update public.torneos
       set estado = 'sorteado', sorteo_publicado_por = p_admin_id, sorteo_publicado_at = now(),
           sorteo_metodo = coalesce(sorteo_metodo, 'bombos')
     where id = v_cat.torneo_id;
  end if;

  return jsonb_build_object('inscripciones', to_jsonb(v_ins), 'fusionada', p_destino_id is not null);
end;
$$;

-- 4. Invitaciones -----------------------------------------------------------------

create table public.torneo_invitaciones (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.torneo_categorias(id) on delete cascade,
  invita_inscripcion_id uuid not null references public.torneo_inscripciones(id) on delete cascade,
  -- A un jugador de la app, o a un teléfono (58 + 10 dígitos) de alguien sin
  -- cuenta; al registrarse con ese teléfono se le asigna (invitado_jugador_id).
  invitado_jugador_id uuid null references public.jugadores(id),
  invitado_nombre text null check (invitado_nombre is null or length(btrim(invitado_nombre)) between 1 and 80),
  invitado_telefono text null check (invitado_telefono is null or invitado_telefono ~ '^58[0-9]{10}$'),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'rechazada', 'cancelada', 'vencida')),
  vence_at timestamptz not null,
  respondida_at timestamptz null,
  motivo text null,
  equipo_id uuid null references public.torneo_equipos(id),
  created_at timestamptz not null default now(),
  constraint torneo_invitaciones_a_quien check (invitado_jugador_id is not null or invitado_telefono is not null),
  constraint torneo_invitaciones_aceptada_con_equipo check ((estado = 'aceptada') = (equipo_id is not null)),
  constraint torneo_invitaciones_respondida check ((estado = 'pendiente') = (respondida_at is null))
);

-- Una sola enviada pendiente por jugador y categoría.
create unique index torneo_invitaciones_una_pendiente on public.torneo_invitaciones (invita_inscripcion_id) where estado = 'pendiente';
create index torneo_invitaciones_invitado_idx on public.torneo_invitaciones (invitado_jugador_id) where estado = 'pendiente';
create index torneo_invitaciones_telefono_idx on public.torneo_invitaciones (invitado_telefono) where estado = 'pendiente' and invitado_jugador_id is null;
create index torneo_invitaciones_categoria_idx on public.torneo_invitaciones (categoria_id, estado);

alter table public.torneo_equipos enable row level security;
alter table public.torneo_invitaciones enable row level security;
-- Los equipos se pueden leer (como grupos y partidos, para /torneo); las
-- invitaciones no (tienen teléfonos): solo rutas server con service role.
create policy "Cualquiera puede ver los equipos de torneo" on public.torneo_equipos for select to anon using (true);
revoke all on table public.torneo_invitaciones from anon, authenticated;
revoke insert, update, delete, truncate on table public.torneo_equipos from anon, authenticated;

alter table public.notificaciones
  add column torneo_invitacion_id uuid null references public.torneo_invitaciones(id) on delete set null;

-- Aceptar una invitación (p_jugador = el invitado). Todo o nada:
--  * la invitación sigue pendiente y no venció;
--  * quien invitó sigue inscrito y sin dupla;
--  * el invitado se inscribe en la categoría si no lo estaba (el trigger de
--    inscripciones repite cupo y máximo 2 categorías) y no está en dupla;
--  * se forma la dupla (el trigger de equipos repite sus reglas) y se
--    cancelan las demás invitaciones pendientes de los dos en la categoría.
-- Si algo falla, la invitación queda vencida con el motivo. Las reglas de
-- nivel y género (y el aviso) las revisa antes el servidor.
create function public.torneo_aceptar_invitacion(p_invitacion_id uuid, p_jugador_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_inv public.torneo_invitaciones;
  v_ins_invita uuid;
  v_ins_invitado uuid;
  v_equipo uuid;
  v_nueva boolean := false;
  v_canceladas uuid[];
  v_motivo text;
begin
  select * into v_inv from public.torneo_invitaciones where id = p_invitacion_id for update;
  if v_inv.id is null then
    return jsonb_build_object('ok', false, 'error', 'Invitación no encontrada');
  end if;
  if v_inv.invitado_jugador_id is distinct from p_jugador_id then
    return jsonb_build_object('ok', false, 'error', 'Esta invitación no es para ti');
  end if;
  if v_inv.estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'error', 'Esta invitación ya no está pendiente');
  end if;
  if v_inv.vence_at <= now() then
    update public.torneo_invitaciones set estado = 'vencida', respondida_at = now(), motivo = 'Venció sin respuesta'
     where id = v_inv.id;
    return jsonb_build_object('ok', false, 'error', 'La invitación ya venció', 'vencida', true);
  end if;

  begin
    select id into v_ins_invita from public.torneo_inscripciones
     where id = v_inv.invita_inscripcion_id and estado <> 'retirada' and categoria_id = v_inv.categoria_id;
    if v_ins_invita is null then
      raise exception 'Quien te invitó ya no está inscrito en la categoría';
    end if;

    select id into v_ins_invitado from public.torneo_inscripciones
     where categoria_id = v_inv.categoria_id and jugador1_id = p_jugador_id and estado <> 'retirada';
    if v_ins_invitado is null then
      insert into public.torneo_inscripciones (categoria_id, jugador1_id, inscrita_por)
      values (v_inv.categoria_id, p_jugador_id, p_jugador_id)
      returning id into v_ins_invitado;
      v_nueva := true;
    end if;

    insert into public.torneo_equipos (categoria_id, inscripcion1_id, inscripcion2_id, origen, formado_por_jugador)
    values (v_inv.categoria_id, v_ins_invita, v_ins_invitado, 'invitacion', p_jugador_id)
    returning id into v_equipo;
  exception when others then
    v_motivo := sqlerrm;
    update public.torneo_invitaciones set estado = 'vencida', respondida_at = now(), motivo = v_motivo
     where id = v_inv.id;
    return jsonb_build_object('ok', false, 'error', v_motivo, 'vencida', true);
  end;

  update public.torneo_invitaciones set estado = 'aceptada', respondida_at = now(), equipo_id = v_equipo
   where id = v_inv.id;

  with canceladas as (
    update public.torneo_invitaciones
       set estado = 'cancelada', respondida_at = now(), motivo = 'Uno de los dos ya formó dupla en la categoría'
     where estado = 'pendiente' and categoria_id = v_inv.categoria_id and id <> v_inv.id
       and (invita_inscripcion_id in (v_ins_invita, v_ins_invitado)
            or invitado_jugador_id in (p_jugador_id, (select jugador1_id from public.torneo_inscripciones where id = v_ins_invita)))
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_canceladas from canceladas;

  return jsonb_build_object('ok', true, 'equipo_id', v_equipo, 'inscripcion_id', v_ins_invitado,
                            'inscripcion_nueva', v_nueva, 'canceladas', to_jsonb(v_canceladas));
end;
$$;

revoke execute on function public.torneo_equipos_validar() from public, anon, authenticated;
revoke execute on function public.torneo_inscripciones_equipo() from public, anon, authenticated;
revoke execute on function public.torneo_inscripciones_validar() from public, anon, authenticated;
revoke execute on function public.torneo_partidos_validar_handicap() from public, anon, authenticated;
revoke execute on function public.torneo_publicar_sorteo_categoria(uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.torneo_cancelar_categoria(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.torneo_aceptar_invitacion(uuid, uuid) from public, anon, authenticated;
