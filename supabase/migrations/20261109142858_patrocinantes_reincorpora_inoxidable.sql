-- 9-nov-2026 (10:28): el usuario vuelve a incluir a Inoxidable del Centro,
-- retirado esa misma mañana (20261109140241). Va en tarjeta oscura (orden
-- 160) y Servifletes, que sirve en ambos fondos, pasa a clara al final
-- (170). Con 17 logos la alternancia solo se repite al reiniciar la cinta
-- (Servifletes claro → CVP claro).
update public.patrocinantes
   set activo = true, orden = 160, fondo = 'oscuro', updated_at = now()
 where nombre = 'Inoxidable del Centro';

update public.patrocinantes
   set orden = 170, fondo = 'claro', updated_at = now()
 where nombre = 'Servifletes Torres';
