-- Torneo Navidad HGV 2026 — cambio de fechas decidido el 27-oct-2026 (hora de
-- Caracas, UTC-4 fijo). Reemplaza las de 20261024034209_torneo_navidad_fechas:
--   * cierre de inscripciones: miércoles 4-nov-2026, 23:59 (= 5-nov 03:59 UTC;
--     cuenta regresiva y vencimiento de las invitaciones de dobles);
--   * sorteo: jueves 5-nov-2026 (fecha_sorteo, informativa);
--   * primeros partidos: viernes 6-nov-2026 = fecha_inicio (la programación
--     de adultos empieza ahí);
--   * finales y premiación: viernes 11-dic-2026 = fecha_fin (sin cambios).

update public.torneos
   set fecha_inicio = '2026-11-06',
       fecha_sorteo = '2026-11-05',
       cierre_inscripciones_at = '2026-11-04 23:59:00-04'
 where nombre = 'Torneo Navidad HGV 2026';
