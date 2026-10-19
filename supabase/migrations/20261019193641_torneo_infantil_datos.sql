-- Categorías infantiles del Torneo Navidad HGV 2026 (docs/torneo-navidad/SPEC.md §14).
-- Idempotente: no hace nada si el torneo ya tiene categorías infantiles.
--
-- Aprobado (19-oct-2026): corte de edad al 31-dic-2026, duraciones 40/60/90/90
-- min, cupos como máximo. Naranja y Verde mixtas ('abierto'); Infantil y
-- Juvenil separadas por género [CONFIRMAR si hay inscritos suficientes; si
-- no, se fusionan antes del sorteo, SPEC §14.1].
-- Horario escuela inicial: lunes a viernes de 15:00 a 18:00 en HGV1 y HGV2
-- [CONFIRMAR con el profesor]; se edita desde el admin.

do $$
declare
  v_torneo uuid;
  v_escuela jsonb := '{"dias": [1, 2, 3, 4, 5], "desde": "15:00", "hasta": "18:00", "canchas": ["HGV1", "HGV2"]}';
begin
  select id into v_torneo from public.torneos where nombre = 'Torneo Navidad HGV 2026';
  if v_torneo is null then
    raise exception 'No existe el Torneo Navidad HGV 2026';
  end if;
  if exists (select 1 from public.torneo_categorias where torneo_id = v_torneo and es_infantil) then
    return;
  end if;

  update public.torneos set fecha_corte_edad = '2026-12-31' where id = v_torneo;

  insert into public.torneo_categorias
    (torneo_id, nombre, modalidad, genero, categoria_nivel, cupo, num_grupos, tamano_grupo, clasifican_por_grupo, llave_desde, duracion_min, orden,
     es_infantil, edad_min, edad_max, formato_partido, plantilla_turnos, partidos_minimos)
  values
    (v_torneo, 'Pelota Naranja', 'single', 'abierto', null, 16, 4, 4, 1, 'sin_llave', 40, 11, true,  8, 10, 'festival_4games', v_escuela, 3),
    (v_torneo, 'Pelota Verde',   'single', 'abierto', null, 16, 4, 4, 2, 'cuartos',   60, 12, true,  9, 11, 'un_set_6_tb',     v_escuela, null),
    (v_torneo, 'Infantil Caballeros', 'single', 'caballeros', null, 8, 2, 4, 2, 'semis', 90, 13, true, 12, 14, 'dos_sets_stb', v_escuela, null),
    (v_torneo, 'Infantil Damas',      'single', 'damas',      null, 8, 2, 4, 2, 'semis', 90, 14, true, 12, 14, 'dos_sets_stb', v_escuela, null),
    (v_torneo, 'Juvenil Caballeros',  'single', 'caballeros', null, 8, 2, 4, 2, 'semis', 90, 15, true, 15, 17, 'dos_sets_stb', v_escuela, null),
    (v_torneo, 'Juvenil Damas',       'single', 'damas',      null, 8, 2, 4, 2, 'semis', 90, 16, true, 15, 17, 'dos_sets_stb', v_escuela, null);
end;
$$;
