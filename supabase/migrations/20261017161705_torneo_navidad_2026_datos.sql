-- Torneo Navidad HGV 2026 y sus 4 categorías (docs/torneo-navidad/SPEC.md §0).
-- Queda en 'borrador': el admin abre las inscripciones desde la pestaña
-- Torneo. Idempotente por nombre, por si se corre dos veces.
--
-- Mixto con handicap: categoria_nivel null = se admite cualquier nivel.

do $$
declare
  v_torneo uuid;
begin
  select id into v_torneo from public.torneos where nombre = 'Torneo Navidad HGV 2026';
  if v_torneo is not null then
    return;
  end if;

  insert into public.torneos (nombre, fecha_inicio, fecha_fin, estado, monto_inscripcion_eur)
  values ('Torneo Navidad HGV 2026', '2026-11-02', '2026-12-11', 'borrador', 15)
  returning id into v_torneo;

  insert into public.torneo_categorias
    (torneo_id, nombre, modalidad, genero, categoria_nivel, cupo, num_grupos, tamano_grupo, clasifican_por_grupo, llave_desde, duracion_min, orden)
  values
    (v_torneo, 'Doble Masculino Sexta',   'doble',  'caballeros', 'sexta',  12, 4, 3, 2, 'cuartos', 90, 1),
    (v_torneo, 'Doble Femenino Sexta',    'doble',  'damas',      'sexta',  12, 4, 3, 2, 'cuartos', 90, 2),
    (v_torneo, 'Mixto con handicap',      'doble',  'mixto',      null,     12, 4, 3, 2, 'cuartos', 90, 3),
    (v_torneo, 'Single Caballeros Quinta','single', 'caballeros', 'quinta',  8, 2, 4, 2, 'semis',   90, 4);
end;
$$;
