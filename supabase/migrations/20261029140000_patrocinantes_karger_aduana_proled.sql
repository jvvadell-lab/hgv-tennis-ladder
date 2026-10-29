-- Nuevos patrocinantes del Torneo Navidad 2026 (29-oct) y el Instagram de
-- Ma-Nolo, que antes no lo tenía. Los logos van en public/patrocinantes/.
-- Aduana y Transporte L&M no tiene Instagram.
update public.patrocinantes
   set instagram = 'manolopizzas', updated_at = now()
 where nombre = 'Ma-Nolo';

insert into public.patrocinantes (nombre, logo_url, instagram, fondo, orden) values
  ('Karger C.A.', '/patrocinantes/karger.webp', 'kargergroup', 'claro', 80),
  ('Aduana y Transporte L&M', '/patrocinantes/aduana-lm.webp', null, 'claro', 90),
  ('Proled Group', '/patrocinantes/proled.webp', 'proledgroupve', 'oscuro', 100);
