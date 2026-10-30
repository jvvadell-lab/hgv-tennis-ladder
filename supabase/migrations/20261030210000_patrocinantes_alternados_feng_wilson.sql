-- Cinta de patrocinantes alternada: una tarjeta clara, una oscura (pedido
-- del 30-oct). Los logos blancos (DLogística, Timoboll, Grupo Arad, Wilson)
-- solo se ven en oscuro y los negros (CVP, Cauchos, PetSmall, Karger,
-- Aduana, Feng Blades) solo en claro; Vicone, Ma-Nolo y Proled sirven en
-- ambos y se usan para cuadrar la alternancia. Con 13 logos, al reiniciar
-- la cinta quedan dos claros seguidos (Feng Blades → CVP).
-- Agrega Feng Blades (@fengblades) y Wilson (sin Instagram).
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
    ('Proled Group', 110, 'claro')
  ) as v(nombre, orden, fondo)
 where p.nombre = v.nombre;

insert into public.patrocinantes (nombre, logo_url, instagram, fondo, orden) values
  ('Wilson', '/patrocinantes/wilson.webp', null, 'oscuro', 120),
  ('Feng Blades', '/patrocinantes/feng-blades.webp', 'fengblades', 'claro', 130);
