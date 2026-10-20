-- Torneo Navidad HGV 2026 — sorteo de grupos (docs/torneo-navidad/SPEC.md §3,
-- decisiones del 20-oct-2026).
--
-- 1. torneo_inscripciones.bombo: lo asigna el admin para el sorteo por
--    bombos (las siembras 1..G son el bombo 1, cabezas de grupo).
-- 2. torneos: método del sorteo publicado, quién lo publicó y cuándo.
-- 3. torneo_publicar_sorteo: escribe en una transacción los grupos, sus
--    miembros, los partidos de grupo y la llave que armó la vista previa
--    (lib/torneoSorteo.ts), y pasa el torneo de 'inscripcion' a 'sorteado'.
--    Vuelve a revisar lo esencial: estado del torneo, que no haya un sorteo
--    previo, que estén todas las categorías y, en cada una, exactamente sus
--    inscripciones confirmadas.

alter table public.torneo_inscripciones
  add column bombo integer null check (bombo between 1 and 26);

alter table public.torneos
  add column sorteo_metodo text null check (sorteo_metodo in ('bombos', 'serpentina')),
  add column sorteo_publicado_por uuid null references public.administradores(id),
  add column sorteo_publicado_at timestamptz null,
  add constraint torneos_sorteo_completo check (
    (sorteo_metodo is null) = (sorteo_publicado_por is null)
    and (sorteo_metodo is null) = (sorteo_publicado_at is null)
  );

-- p_plan: [{ categoria_id, grupos: [{ letra, miembros: [inscripcion_id…] }],
--            partidos: [{ fase, letra, orden, origen_a, origen_b, inscripcion_a, inscripcion_b }] }]
create function public.torneo_publicar_sorteo(p_torneo_id uuid, p_metodo text, p_admin_id uuid, p_plan jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_estado text;
  v_cat record;
  v_plan_cat jsonb;
  v_grupo jsonb;
  v_partido jsonb;
  v_grupo_id uuid;
  v_esperadas uuid[];
  v_recibidas uuid[];
  v_pos integer;
  v_letras jsonb;
begin
  if p_metodo not in ('bombos', 'serpentina') then
    raise exception 'Método de sorteo no válido';
  end if;

  select estado into v_estado from public.torneos where id = p_torneo_id for update;
  if v_estado is null then
    raise exception 'Torneo no encontrado';
  end if;
  if v_estado <> 'inscripcion' then
    raise exception 'El sorteo se hace con el torneo en inscripción (está en %)', v_estado;
  end if;

  if exists (
    select 1 from public.torneo_grupos g
    join public.torneo_categorias c on c.id = g.categoria_id
    where c.torneo_id = p_torneo_id
  ) or exists (
    select 1 from public.torneo_partidos p
    join public.torneo_categorias c on c.id = p.categoria_id
    where c.torneo_id = p_torneo_id
  ) then
    raise exception 'El torneo ya tiene grupos o partidos: el sorteo ya se hizo';
  end if;

  if jsonb_typeof(p_plan) <> 'array' then
    raise exception 'Plan de sorteo no válido';
  end if;

  -- Bloquea las inscripciones del torneo: nadie se confirma ni se retira a
  -- mitad de la publicación.
  perform 1 from public.torneo_inscripciones i
  join public.torneo_categorias c on c.id = i.categoria_id
  where c.torneo_id = p_torneo_id
  for update of i;

  for v_cat in select id, nombre from public.torneo_categorias where torneo_id = p_torneo_id order by orden loop
    v_plan_cat := null;
    select e into v_plan_cat from jsonb_array_elements(p_plan) e where (e->>'categoria_id')::uuid = v_cat.id;
    if v_plan_cat is null then
      raise exception 'Falta la categoría % en el sorteo', v_cat.nombre;
    end if;

    select coalesce(array_agg(id order by id), '{}') into v_esperadas
    from public.torneo_inscripciones
    where categoria_id = v_cat.id and estado = 'confirmada';

    select coalesce(array_agg(m::uuid order by m::uuid), '{}') into v_recibidas
    from jsonb_array_elements(v_plan_cat->'grupos') g, jsonb_array_elements_text(g->'miembros') m;

    if array_length(v_esperadas, 1) is null or array_length(v_esperadas, 1) < 3 then
      raise exception '%: hacen falta al menos 3 inscripciones confirmadas para sortear', v_cat.nombre;
    end if;
    if v_esperadas <> v_recibidas then
      raise exception '%: las inscripciones confirmadas cambiaron desde la vista previa. Repite el sorteo.', v_cat.nombre;
    end if;

    v_letras := '{}'::jsonb;
    for v_grupo in select * from jsonb_array_elements(v_plan_cat->'grupos') loop
      insert into public.torneo_grupos (categoria_id, letra)
      values (v_cat.id, v_grupo->>'letra')
      returning id into v_grupo_id;
      v_letras := v_letras || jsonb_build_object(v_grupo->>'letra', v_grupo_id);

      v_pos := 0;
      for v_partido in select * from jsonb_array_elements(v_grupo->'miembros') loop
        v_pos := v_pos + 1;
        insert into public.torneo_grupo_miembros (grupo_id, inscripcion_id, siembra)
        values (v_grupo_id, (v_partido #>> '{}')::uuid, v_pos);
      end loop;
    end loop;

    for v_partido in select * from jsonb_array_elements(v_plan_cat->'partidos') loop
      if (v_partido->>'fase') = 'grupo' and not (v_letras ? (v_partido->>'letra')) then
        raise exception '%: partido de un grupo que no existe', v_cat.nombre;
      end if;
      insert into public.torneo_partidos
        (categoria_id, fase, grupo_id, orden, origen_a, origen_b, inscripcion_a, inscripcion_b)
      values (
        v_cat.id,
        v_partido->>'fase',
        case when (v_partido->>'fase') = 'grupo' then (v_letras->>(v_partido->>'letra'))::uuid end,
        (v_partido->>'orden')::integer,
        v_partido->>'origen_a',
        v_partido->>'origen_b',
        (v_partido->>'inscripcion_a')::uuid,
        (v_partido->>'inscripcion_b')::uuid
      );
    end loop;
  end loop;

  -- Un partido de grupo solo cruza miembros de su grupo.
  if exists (
    select 1 from public.torneo_partidos p
    join public.torneo_categorias c on c.id = p.categoria_id
    where c.torneo_id = p_torneo_id and p.fase = 'grupo'
      and (
        not exists (select 1 from public.torneo_grupo_miembros m where m.grupo_id = p.grupo_id and m.inscripcion_id = p.inscripcion_a)
        or not exists (select 1 from public.torneo_grupo_miembros m where m.grupo_id = p.grupo_id and m.inscripcion_id = p.inscripcion_b)
      )
  ) then
    raise exception 'Hay un partido de grupo entre inscripciones que no son de ese grupo';
  end if;

  update public.torneos
     set estado = 'sorteado',
         sorteo_metodo = p_metodo,
         sorteo_publicado_por = p_admin_id,
         sorteo_publicado_at = now()
   where id = p_torneo_id;
end;
$$;

revoke execute on function public.torneo_publicar_sorteo(uuid, text, uuid, jsonb) from public, anon, authenticated;
