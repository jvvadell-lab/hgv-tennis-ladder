-- Copa Navidad HGV 2026: edades definitivas de las categorías infantiles
-- (decisión de la Comisión, 4-nov). Edad cumplida al 31-dic-2026.
--   Pelota Roja 4–6 (sin cambio) · Pelota Naranja 7–8 · Pelota Verde 9–10
--   "12 años" 11–12 y "14 años" 13–14, niños y niñas juntos (antes Infantil
--   Caballeros / Infantil Damas 12–14) · Juvenil 15–17 sin cambio.
-- El formato de partido queda como estaba hasta que la Comisión lo confirme.
-- (Los niños que cambiaron de categoría se movieron aparte, a mano: Ahavti C.
-- y Natalia P. a Verde, Isaac M. a 14 años, Lena S., Sara P. y Alexavitt A.
-- a 12 años, con aviso a sus representantes.)
update public.torneo_categorias c
   set edad_min = v.edad_min, edad_max = v.edad_max, nombre = v.nombre_nuevo, genero = v.genero
  from public.torneos t,
       (values ('Pelota Naranja', 'Pelota Naranja', 7, 8, 'abierto'),
               ('Pelota Verde', 'Pelota Verde', 9, 10, 'abierto'),
               ('Infantil Caballeros', '12 años', 11, 12, 'abierto'),
               ('Infantil Damas', '14 años', 13, 14, 'abierto')) as v(nombre, nombre_nuevo, edad_min, edad_max, genero)
 where t.id = c.torneo_id and t.nombre = 'Torneo Navidad HGV 2026' and c.es_infantil and c.nombre = v.nombre;
