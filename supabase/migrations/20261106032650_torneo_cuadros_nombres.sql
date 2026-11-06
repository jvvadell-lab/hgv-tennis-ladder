-- Torneo Navidad HGV 2026 — nombres del formato cuadros (docs/torneo-navidad/SPEC.md §16).
--
-- "1ª ronda · J1" pasa a "Primera ronda · Partido 1": en tenis, "juego" es un
-- game. Solo cambia ese texto: la lógica, los códigos internos (C1–C8, S1–S4,
-- F1–F2) y los nombres Cuadro A y Cuadro B siguen igual.
--
-- 1. torneo_programar_partidos: el motivo del bloqueo usa los nombres nuevos.
-- 2. torneo_crear_llave_cuadros: igual, para los bloqueos que rotula.
-- 3. Renombra los bloqueos que ya existen en las categorías con este formato.

-- 1. Motivo del bloqueo -------------------------------------------------------

create or replace function public.torneo_programar_partidos(p_admin_id uuid, p_asignaciones jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_a jsonb;
  v_p record;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_etapa text;
  v_motivo text;
  v_bloqueo uuid;
begin
  if jsonb_typeof(p_asignaciones) <> 'array' then
    raise exception 'Asignaciones no válidas';
  end if;

  for v_a in select * from jsonb_array_elements(p_asignaciones) loop
    select p.id, p.estado, p.fase, p.orden, p.bloqueo_id, p.categoria_id, c.duracion_min, c.nombre as categoria, c.formato_llave, g.letra
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
    v_etapa := case v_p.fase
      when 'grupo' then 'Grupo ' || v_p.letra
      when 'cuartos' then 'Cuartos de final'
      when 'semis' then 'Semifinal'
      else 'Final'
    end;
    if v_p.formato_llave = 'cuadros' then
      v_etapa := case
        when v_p.fase = 'grupo' then 'Primera ronda · Partido ' || (ascii(v_p.letra) - 64)
        when v_p.orden > case v_p.fase when 'cuartos' then 4 when 'semis' then 2 else 1 end then 'Cuadro B – ' || v_etapa
        else 'Cuadro A – ' || v_etapa
      end;
    end if;
    v_motivo := 'Torneo Navidad – ' || v_p.categoria || ' – ' || v_etapa;

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

-- 2. Crear la llave -----------------------------------------------------------

create or replace function public.torneo_crear_llave_cuadros(p_categoria_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_nombre text;
begin
  select nombre into v_nombre from public.torneo_categorias where id = p_categoria_id for update;
  if v_nombre is null then
    raise exception 'Categoría no encontrada: %', p_categoria_id;
  end if;

  -- La primera ronda tiene que ser exactamente 8 grupos (A–H) de 2, con un partido cada uno.
  if (
    select count(*) from public.torneo_grupos g
    where g.categoria_id = p_categoria_id
      and g.letra in ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')
      and (select count(*) from public.torneo_grupo_miembros m where m.grupo_id = g.id) = 2
      and (select count(*) from public.torneo_partidos p where p.grupo_id = g.id and p.fase = 'grupo') = 1
  ) <> 8 or (select count(*) from public.torneo_grupos g where g.categoria_id = p_categoria_id) <> 8 then
    raise exception '%: la primera ronda no son 8 grupos de 2 con un partido cada uno', v_nombre;
  end if;

  -- Una llave de otro formato no se pisa.
  if exists (
    select 1 from public.torneo_partidos p
    left join (values
      ('cuartos', 1, '1A', '1B'), ('cuartos', 2, '1C', '1D'), ('cuartos', 3, '1E', '1F'), ('cuartos', 4, '1G', '1H'),
      ('cuartos', 5, '2A', '2B'), ('cuartos', 6, '2C', '2D'), ('cuartos', 7, '2E', '2F'), ('cuartos', 8, '2G', '2H'),
      ('semis', 1, 'G:C1', 'G:C2'), ('semis', 2, 'G:C3', 'G:C4'), ('semis', 3, 'G:C5', 'G:C6'), ('semis', 4, 'G:C7', 'G:C8'),
      ('final', 1, 'G:S1', 'G:S2'), ('final', 2, 'G:S3', 'G:S4')
    ) as l(fase, orden, origen_a, origen_b)
      on l.fase = p.fase and l.orden = p.orden and l.origen_a = p.origen_a and l.origen_b = p.origen_b
    where p.categoria_id = p_categoria_id and p.fase <> 'grupo' and l.fase is null
  ) then
    raise exception '%: ya tiene una llave de otro formato', v_nombre;
  end if;

  update public.torneo_categorias set formato_llave = 'cuadros' where id = p_categoria_id;

  insert into public.torneo_partidos (categoria_id, fase, orden, origen_a, origen_b)
  select p_categoria_id, l.fase, l.orden, l.origen_a, l.origen_b
  from (values
    ('cuartos', 1, '1A', '1B'), ('cuartos', 2, '1C', '1D'), ('cuartos', 3, '1E', '1F'), ('cuartos', 4, '1G', '1H'),
    ('cuartos', 5, '2A', '2B'), ('cuartos', 6, '2C', '2D'), ('cuartos', 7, '2E', '2F'), ('cuartos', 8, '2G', '2H'),
    ('semis', 1, 'G:C1', 'G:C2'), ('semis', 2, 'G:C3', 'G:C4'), ('semis', 3, 'G:C5', 'G:C6'), ('semis', 4, 'G:C7', 'G:C8'),
    ('final', 1, 'G:S1', 'G:S2'), ('final', 2, 'G:S3', 'G:S4')
  ) as l(fase, orden, origen_a, origen_b)
  on conflict (categoria_id, fase, orden) where fase <> 'grupo' do nothing;

  -- Partidos que se validaron antes de crear la llave: sus lugares en los
  -- cuartos. (Un doble WO previo lo resuelve el avance en la próxima validación.)
  update public.torneo_partidos l
     set equipo_a = case left(l.origen_a, 1) when '1' then j.ganador else j.perdedor end
    from (
      select g.letra, p.ganador_equipo_id as ganador,
             case when p.ganador_equipo_id = p.equipo_a then p.equipo_b else p.equipo_a end as perdedor
      from public.torneo_partidos p
      join public.torneo_grupos g on g.id = p.grupo_id
      where p.categoria_id = p_categoria_id and p.fase = 'grupo' and p.validado and p.ganador_equipo_id is not null
    ) j
   where l.categoria_id = p_categoria_id and l.fase = 'cuartos' and l.equipo_a is null and right(l.origen_a, 1) = j.letra;

  update public.torneo_partidos l
     set equipo_b = case left(l.origen_b, 1) when '1' then j.ganador else j.perdedor end
    from (
      select g.letra, p.ganador_equipo_id as ganador,
             case when p.ganador_equipo_id = p.equipo_a then p.equipo_b else p.equipo_a end as perdedor
      from public.torneo_partidos p
      join public.torneo_grupos g on g.id = p.grupo_id
      where p.categoria_id = p_categoria_id and p.fase = 'grupo' and p.validado and p.ganador_equipo_id is not null
    ) j
   where l.categoria_id = p_categoria_id and l.fase = 'cuartos' and l.equipo_b is null and right(l.origen_b, 1) = j.letra;

  -- Los bloqueos ya creados de los 8 partidos decían "Grupo X".
  update public.bloqueos_cancha b
     set motivo = 'Torneo Navidad – ' || v_nombre || ' – Primera ronda · Partido ' || (ascii(g.letra) - 64)
    from public.torneo_partidos p
    join public.torneo_grupos g on g.id = p.grupo_id
   where p.categoria_id = p_categoria_id and p.bloqueo_id = b.id;
end;
$$;

revoke execute on function public.torneo_programar_partidos(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.torneo_crear_llave_cuadros(uuid) from public, anon, authenticated;

-- 3. Bloqueos existentes ------------------------------------------------------

update public.bloqueos_cancha b
   set motivo = 'Torneo Navidad – ' || c.nombre || ' – ' || case
     when p.fase = 'grupo' then 'Primera ronda · Partido ' || (ascii(g.letra) - 64)
     else
       case when p.orden > case p.fase when 'cuartos' then 4 when 'semis' then 2 else 1 end then 'Cuadro B' else 'Cuadro A' end
       || ' – ' || case p.fase when 'cuartos' then 'Cuartos de final' when 'semis' then 'Semifinal' else 'Final' end
   end
  from public.torneo_partidos p
  join public.torneo_categorias c on c.id = p.categoria_id
  left join public.torneo_grupos g on g.id = p.grupo_id
 where p.bloqueo_id = b.id and c.formato_llave = 'cuadros';
