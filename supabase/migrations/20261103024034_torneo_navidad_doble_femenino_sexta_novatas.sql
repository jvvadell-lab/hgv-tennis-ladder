-- 2-nov-2026 (ya aplicada en producción con esta misma versión): nueva
-- categoría "Doble Femenino Sexta Novatas" (decisión de la Comisión: el
-- nivel entre sexta y sexta novatas es muy distinto). Solo admite
-- sexta_novatos (nivelesAdmitidos), mismo formato que los dobles de adultos.
-- Cupo como máximo (grupos flexibles al sortear). Si al cierre no llega a 3
-- duplas, se fusiona con Doble Femenino Sexta desde el admin.
do $$
declare
  v_torneo uuid;
begin
  select torneo_id into v_torneo from public.torneo_categorias where nombre = 'Doble Femenino Sexta';
  if v_torneo is null then raise exception 'No se encontró el Doble Femenino Sexta'; end if;
  if exists (select 1 from public.torneo_categorias where torneo_id = v_torneo and nombre = 'Doble Femenino Sexta Novatas') then
    return;
  end if;

  -- Hace lugar en el orden: va justo después del Doble Femenino Sexta.
  update public.torneo_categorias
     set orden = orden + 1
   where torneo_id = v_torneo and not es_infantil and orden >= 3;

  insert into public.torneo_categorias
    (torneo_id, nombre, modalidad, genero, categoria_nivel, cupo, num_grupos, tamano_grupo, clasifican_por_grupo,
     llave_desde, duracion_min, orden, es_infantil, formato_partido, inscripciones_abiertas)
  values
    (v_torneo, 'Doble Femenino Sexta Novatas', 'doble', 'damas', 'sexta_novatos', 8, 2, 4, 2,
     'semis', 90, 3, false, 'dos_sets_stb', true);
end;
$$;
