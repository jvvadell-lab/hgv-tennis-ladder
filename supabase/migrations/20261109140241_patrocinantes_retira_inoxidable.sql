-- 9-nov-2026: se retira Inoxidable del Centro de los patrocinantes de la
-- Copa (queda inactivo: no sale en la cinta ni en las piezas de difusión;
-- se conservan la fila y el logo por si vuelve).
-- La cinta se recompone para seguir alternando claro/oscuro con 16 logos
-- (8 y 8, también al reiniciar): Proled (su logo ahora es un bloque negro)
-- pasa a tarjeta oscura y se reordenan Feng Blades, Ol'Blue, Proled,
-- Grupo Artesano y Servifletes.
update public.patrocinantes
   set activo = false, updated_at = now()
 where nombre = 'Inoxidable del Centro';

update public.patrocinantes p
   set orden = v.orden, fondo = v.fondo, updated_at = now()
  from (values
    ('CVP Contable', 10, 'claro'),
    ('Granos Vicone', 20, 'oscuro'),
    ('Cauchos Q''Barato', 30, 'claro'),
    ('DLogística Integrada', 40, 'oscuro'),
    ('PetSmall', 50, 'claro'),
    ('Timoboll', 60, 'oscuro'),
    ('Karger C.A.', 70, 'claro'),
    ('Ma-Nolo', 80, 'oscuro'),
    ('Aduana y Transporte L&M', 90, 'claro'),
    ('Grupo Arad', 100, 'oscuro'),
    ('Feng Blades', 110, 'claro'),
    ('Wilson', 120, 'oscuro'),
    ('Ol''Blue', 130, 'claro'),
    ('Proled Group', 140, 'oscuro'),
    ('Grupo Artesano', 150, 'claro'),
    ('Servifletes Torres', 160, 'oscuro')
  ) as v(nombre, orden, fondo)
 where p.nombre = v.nombre;
