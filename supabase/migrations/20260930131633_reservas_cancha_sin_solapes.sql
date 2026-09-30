-- Impide en la BD que dos reservas casuales que ocupan cancha (activa o usada)
-- se solapen en la misma cancha. Última línea de defensa detrás de la
-- validación de crear-reserva / extender-reserva (lib/reservas.ts,
-- ESTADOS_RESERVA_OCUPAN_CANCHA) — cubre también la carrera entre dos
-- requests casi simultáneos. No cubre choques con retos (otra tabla), que se
-- siguen validando en código.
--
-- Antes de esto, "Ya llegué" (estado 'usada') liberaba la franja y se podía
-- reservar encima (caso real: 13/09/2026, HGV2, 17:00 y 17:15).

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- Fin de la reserva = inicio + duración en minutos. `timestamptz + interval` es
-- STABLE en Postgres (porque intervalos de días/meses dependen de la zona
-- horaria), así que no se puede usar directo en una columna generada. Aquí
-- solo se suman MINUTOS, que no dependen de la zona horaria — por eso es
-- seguro declararla IMMUTABLE.
CREATE OR REPLACE FUNCTION public.fin_reserva_cancha(inicio timestamptz, duracion_min integer)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT inicio + make_interval(mins => COALESCE(duracion_min, 60))
$$;

ALTER TABLE public.reservas_cancha
  ADD COLUMN fecha_hora_fin timestamptz
  GENERATED ALWAYS AS (public.fin_reserva_cancha(fecha_hora, duracion_min)) STORED;

-- Fecha de corte 14/09/2026 00:00 Caracas (= 04:00 UTC): deja fuera el único
-- solape histórico (13/09, HGV2, reservas 36dd1cb1 y 2736fd31, ambas 'usada'),
-- que no se toca. Rango '[)': una reserva que termina 20:00 no choca con otra
-- que empieza 20:00.
ALTER TABLE public.reservas_cancha
  ADD CONSTRAINT reservas_cancha_sin_solapes
  EXCLUDE USING gist (
    cancha WITH =,
    tstzrange(fecha_hora, fecha_hora_fin, '[)') WITH &&
  )
  WHERE (estado IN ('activa', 'usada') AND fecha_hora >= '2026-09-14 04:00:00+00'::timestamptz);
