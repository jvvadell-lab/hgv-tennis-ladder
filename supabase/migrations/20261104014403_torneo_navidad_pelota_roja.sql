-- Copa Navidad HGV 2026: categoría Pelota Roja (4 a 6 años cumplidos al
-- 31-dic-2026). Festival como Pelota Naranja (sets a 4 games, sin llave,
-- mínimo 3 partidos por niño) pero con turnos de 30 min. Mismo horario de
-- escuela que las demás infantiles. Va antes de Naranja (orden 10).
insert into public.torneo_categorias
  (torneo_id, nombre, modalidad, genero, categoria_nivel, cupo, num_grupos, tamano_grupo,
   clasifican_por_grupo, llave_desde, duracion_min, orden, es_infantil, edad_min, edad_max,
   formato_partido, plantilla_turnos, partidos_minimos, inscripciones_abiertas)
select c.torneo_id, 'Pelota Roja', 'single', 'abierto', null, 16, 4, 4,
       1, 'sin_llave', 30, 10, true, 4, 6,
       'festival_4games', c.plantilla_turnos, 3, true
from public.torneo_categorias c
join public.torneos t on t.id = c.torneo_id
where t.nombre = 'Torneo Navidad HGV 2026' and c.nombre = 'Pelota Naranja'
  and not exists (
    select 1 from public.torneo_categorias x where x.torneo_id = c.torneo_id and x.nombre = 'Pelota Roja'
  );
