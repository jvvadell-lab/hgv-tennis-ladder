-- Backfill: esta migración ya se aplicó directamente al proyecto remoto (ver
-- commit 8f589ae, "Corregir regla de 1 rechazo por temporada") pero nunca se
-- guardó como archivo local — este archivo solo documenta en el repo lo que
-- ya existe en producción, no cambia nada nuevo.
--
-- Separamos el estado 'cancelado' (usado por admin/cancelar-reto) del estado
-- 'rechazado' (usado por el jugador retado) — antes ambos flujos reutilizaban
-- 'rechazado', lo que inflaba el conteo de "1 rechazo por temporada" de
-- jugadores con cancelaciones administrativas que no eran su culpa.
ALTER TABLE public.retos DROP CONSTRAINT retos_estado_check;
ALTER TABLE public.retos ADD CONSTRAINT retos_estado_check
  CHECK (estado::text = ANY (ARRAY['pendiente'::text, 'aceptado'::text, 'rechazado'::text, 'jugado'::text, 'no_presentado'::text, 'cancelado'::text]));
