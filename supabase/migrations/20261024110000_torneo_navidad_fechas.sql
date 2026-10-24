-- Torneo Navidad HGV 2026 — fechas decididas el 23-oct-2026 (hora de Caracas,
-- UTC-4 fijo):
--   * cierre de inscripciones: domingo 1-nov-2026, 23:59 (cuenta regresiva y
--     vencimiento de las invitaciones de dobles; el cierre lo hace el admin);
--   * sorteo: lunes 2-nov-2026 (informativo: se publica por categoría);
--   * primeros partidos: miércoles 4-nov-2026 = fecha_inicio (la
--     programación de adultos empieza ahí);
--   * finales y premiación: viernes 11-dic-2026 = fecha_fin (sin cambios).
-- Va después de torneo_inscripcion_individual (cierre_inscripciones_at).

alter table public.torneos add column fecha_sorteo date null;

update public.torneos
   set fecha_inicio = '2026-11-04',
       fecha_sorteo = '2026-11-02',
       cierre_inscripciones_at = '2026-11-01 23:59:00-04'
 where nombre = 'Torneo Navidad HGV 2026';
