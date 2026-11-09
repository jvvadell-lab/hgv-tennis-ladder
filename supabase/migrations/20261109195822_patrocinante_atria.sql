-- 9-nov-2026: nuevo patrocinante de la Copa, Pegatodo Atria (@pegatodoatria).
-- Su logo (amarillo con borde azul marino) solo se lee en tarjeta clara:
-- entra en claro con orden 170 y Servifletes, que sirve en ambos fondos,
-- pasa al final en oscuro (180). Con 18 logos la cinta alterna sin
-- repetir color, también al reiniciar.
insert into public.patrocinantes (nombre, logo_url, instagram, fondo, orden) values
  ('Pegatodo Atria', '/patrocinantes/atria.webp', 'pegatodoatria', 'claro', 170);

update public.patrocinantes
   set orden = 180, fondo = 'oscuro', updated_at = now()
 where nombre = 'Servifletes Torres';
