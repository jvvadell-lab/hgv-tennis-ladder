-- Torneo Navidad HGV 2026 — programación (docs/torneo-navidad/SPEC.md §4,
-- §4.1 y §14.5, decisiones del 20-oct-2026).
--
-- 1. administradores.nivel 'academia': el profesor solo ve la pantalla
--    "Horario academia" (en la sesión tiene rol propio, ver lib/session.ts).
-- 2. torneo_franjas_academia: franjas concretas (fecha, cancha, inicio y
--    fin, dentro de 15:00–18:00) que la academia libera para los partidos
--    infantiles. Sin solapes por cancha y día; no se puede borrar una
--    franja que ya tenga un partido infantil programado. No bloquea la
--    cancha: el bloqueo lo crea cada partido al programarse.
-- 3. torneo_partidos.handicap_inscripcion_id: la pareja del Mixto que
--    empieza cada game con 15-0 (null = sin handicap).
-- 4. torneos.programacion_publicada_at/_por.
-- 5. torneo_programar_partidos: guarda (o quita) el horario de varios
--    partidos en una transacción, creando, moviendo o borrando su fila en
--    bloqueos_cancha.

-- 1. Nivel academia ----------------------------------------------------------

alter table public.administradores drop constraint administradores_nivel_check;
alter table public.administradores add constraint administradores_nivel_check
  check (nivel in ('completo', 'pagos', 'academia'));

-- 2. Franjas de la academia --------------------------------------------------

create table public.torneo_franjas_academia (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid not null references public.torneos(id) on delete cascade,
  fecha date not null,
  cancha text not null check (cancha in ('HGV1', 'HGV2')),
  hora_inicio time not null,
  hora_fin time not null,
  liberada_por uuid not null references public.administradores(id),
  created_at timestamptz not null default now(),
  constraint torneo_franjas_academia_ventana check (hora_inicio >= '15:00' and hora_fin <= '18:00' and hora_inicio < hora_fin)
);

create index torneo_franjas_academia_torneo_idx on public.torneo_franjas_academia (torneo_id, fecha);

-- Solo rutas server con service role (como torneo_disponibilidad).
alter table public.torneo_franjas_academia enable row level security;

create function public.torneo_franjas_academia_validar()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_inicio timestamptz;
  v_fin timestamptz;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    if exists (
      select 1 from public.torneo_franjas_academia f
      where f.torneo_id = new.torneo_id and f.fecha = new.fecha and f.cancha = new.cancha and f.id <> new.id
        and f.hora_inicio < new.hora_fin and new.hora_inicio < f.hora_fin
    ) then
      raise exception 'La franja se solapa con otra de la misma cancha ese día';
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    -- Hora de pared en Caracas (UTC-4 fijo).
    v_inicio := (old.fecha + old.hora_inicio) at time zone 'America/Caracas';
    v_fin := (old.fecha + old.hora_fin) at time zone 'America/Caracas';
    if exists (
      select 1 from public.torneo_partidos p
      join public.torneo_categorias c on c.id = p.categoria_id
      where c.torneo_id = old.torneo_id and c.es_infantil
        and p.cancha = old.cancha and p.fecha_hora >= v_inicio and p.fecha_hora < v_fin
    ) then
      raise exception 'La franja ya tiene un partido programado: reprograma o quita ese partido antes';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger torneo_franjas_academia_validar
  before insert or update or delete on public.torneo_franjas_academia
  for each row execute function public.torneo_franjas_academia_validar();

-- 3. Handicap del Mixto ------------------------------------------------------

alter table public.torneo_partidos
  add column handicap_inscripcion_id uuid null references public.torneo_inscripciones(id),
  add constraint torneo_partidos_handicap_es_rival check (
    -- "is not distinct from": con un rival todavía null, "in (a, null)" daría null y pasaría.
    handicap_inscripcion_id is null
    or handicap_inscripcion_id is not distinct from inscripcion_a
    or handicap_inscripcion_id is not distinct from inscripcion_b
  );

create function public.torneo_partidos_validar_handicap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.handicap_inscripcion_id is not null and not exists (
    select 1 from public.torneo_categorias c where c.id = new.categoria_id and c.genero = 'mixto'
  ) then
    raise exception 'El handicap solo se usa en la categoría Mixto';
  end if;
  return new;
end;
$$;

create trigger torneo_partidos_validar_handicap
  before insert or update of handicap_inscripcion_id, categoria_id on public.torneo_partidos
  for each row execute function public.torneo_partidos_validar_handicap();

-- 4. Publicación de la programación ------------------------------------------

alter table public.torneos
  add column programacion_publicada_at timestamptz null,
  add column programacion_publicada_por uuid null references public.administradores(id),
  add constraint torneos_programacion_publicada_completa check (
    (programacion_publicada_at is null) = (programacion_publicada_por is null)
  );

-- 5. Programar partidos -------------------------------------------------------

-- p_asignaciones: [{ partido_id, cancha, inicio }] — cancha e inicio null
-- quitan el horario (y borran el bloqueo). Las reglas de horario y de
-- jugadores las revisa el servidor (lib/torneoProgramacion.ts); aquí se
-- repite lo que no puede fallar: partido abierto, cancha sin dos partidos
-- del torneo a la vez.
create function public.torneo_programar_partidos(p_admin_id uuid, p_asignaciones jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_a jsonb;
  v_p record;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_motivo text;
  v_bloqueo uuid;
begin
  if jsonb_typeof(p_asignaciones) <> 'array' then
    raise exception 'Asignaciones no válidas';
  end if;

  for v_a in select * from jsonb_array_elements(p_asignaciones) loop
    select p.id, p.estado, p.fase, p.bloqueo_id, p.categoria_id, c.duracion_min, c.nombre as categoria, g.letra
      into v_p
    from public.torneo_partidos p
    join public.torneo_categorias c on c.id = p.categoria_id
    left join public.torneo_grupos g on g.id = p.grupo_id
    where p.id = (v_a->>'partido_id')::uuid
    for update of p;

    if v_p.id is null then
      raise exception 'Partido no encontrado';
    end if;
    if v_p.estado in ('jugado', 'wo', 'doble_wo') then
      raise exception 'El partido de % ya tiene resultado: no se puede mover', v_p.categoria;
    end if;

    if (v_a->>'cancha') is null then
      update public.torneo_partidos
         set cancha = null, fecha_hora = null, estado = 'pendiente', bloqueo_id = null
       where id = v_p.id;
      if v_p.bloqueo_id is not null then
        delete from public.bloqueos_cancha where id = v_p.bloqueo_id;
      end if;
      continue;
    end if;

    v_inicio := (v_a->>'inicio')::timestamptz;
    v_fin := v_inicio + make_interval(mins => v_p.duracion_min);
    v_motivo := 'Torneo Navidad – ' || v_p.categoria || ' – ' ||
      case v_p.fase
        when 'grupo' then 'Grupo ' || v_p.letra
        when 'cuartos' then 'Cuartos de final'
        when 'semis' then 'Semifinal'
        else 'Final'
      end;

    if v_p.bloqueo_id is not null then
      update public.bloqueos_cancha
         set cancha = v_a->>'cancha', inicio = v_inicio, fin = v_fin, motivo = v_motivo
       where id = v_p.bloqueo_id;
      v_bloqueo := v_p.bloqueo_id;
    else
      insert into public.bloqueos_cancha (cancha, inicio, fin, motivo, creado_por)
      values (v_a->>'cancha', v_inicio, v_fin, v_motivo, p_admin_id)
      returning id into v_bloqueo;
    end if;

    update public.torneo_partidos
       set cancha = v_a->>'cancha', fecha_hora = v_inicio, estado = 'programado', bloqueo_id = v_bloqueo
     where id = v_p.id;
  end loop;

  -- Red de seguridad: dos partidos del torneo no comparten cancha a la vez.
  if exists (
    select 1
    from public.torneo_partidos a
    join public.bloqueos_cancha ba on ba.id = a.bloqueo_id
    join public.torneo_partidos b on b.id <> a.id and b.bloqueo_id is not null
    join public.bloqueos_cancha bb on bb.id = b.bloqueo_id
    where ba.cancha = bb.cancha and ba.inicio < bb.fin and bb.inicio < ba.fin
  ) then
    raise exception 'Dos partidos del torneo quedarían en la misma cancha a la vez';
  end if;
end;
$$;

revoke execute on function public.torneo_franjas_academia_validar() from public, anon, authenticated;
revoke execute on function public.torneo_partidos_validar_handicap() from public, anon, authenticated;
revoke execute on function public.torneo_programar_partidos(uuid, jsonb) from public, anon, authenticated;
