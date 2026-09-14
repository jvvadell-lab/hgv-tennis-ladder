-- Backfill: esta migración ya se aplicó directamente al proyecto remoto (ver
-- commit 8f589ae, "Corregir regla de 1 rechazo por temporada") pero nunca se
-- guardó como archivo local — este archivo solo documenta en el repo lo que
-- ya existe en producción, no cambia nada nuevo.
--
-- Índice único parcial: un jugador solo puede tener UN reto en estado
-- 'rechazado' por temporada (como retado). Es el respaldo atómico, a prueba
-- de condiciones de carrera, del conteo que hace responder-reto/route.ts
-- antes de actualizar — si el conteo se equivoca por una carrera, este
-- índice es quien realmente lo impide (capturado como error 23505).
CREATE UNIQUE INDEX ux_retos_un_rechazo_por_temporada
  ON public.retos (retado_id, temporada_id)
  WHERE (estado::text = 'rechazado'::text);
