-- Escalera Express: evento especial jugado el sábado 12 de septiembre de 2026.
-- Los retos de este evento se marcan con escalera_express = true y usan un
-- mecanismo de actualización de posición distinto al normal (ver la función
-- más abajo), en vez del swap directo de app/api/admin/aprobar-resultado.

-- 1) Columna que marca inequívocamente qué retos pertenecen al evento —
--    preferible a inferirlo por fecha, porque la fecha del partido (sábado 12)
--    es la misma para todos, pero la fecha de CREACIÓN es lo que en realidad
--    distingue un reto Express de uno que alguien intente colar después.
ALTER TABLE public.retos ADD COLUMN escalera_express boolean NOT NULL DEFAULT false;

-- 2) Un horario+cancha del evento solo lo puede ocupar un reto pendiente o
--    aceptado a la vez — a prueba de condición de carrera entre dos jugadores
--    que intenten agarrar el mismo cupo casi simultáneamente (mismo patrón que
--    jugadores_ocupados en 20260831000000_jugadores_ocupados_unico_reto_activo.sql,
--    pero aquí el recurso en disputa es el cupo horario×cancha, no el jugador).
CREATE UNIQUE INDEX ux_retos_escalera_express_slot
  ON public.retos (fecha_propuesta, cancha)
  WHERE escalera_express AND estado IN ('pendiente', 'aceptado');

-- 3) Mecanismo de "cuela en la fila" para cuando el retador le gana al
--    retado en un reto Escalera Express (llamado desde
--    app/api/admin/aprobar-resultado/route.ts):
--
--    El ganador toma la posición del retado (posición objetivo). Todos los
--    que estaban entre esa posición objetivo (inclusive, ahí está el
--    perdedor) y la vieja posición del ganador (exclusive) bajan un puesto
--    cada uno. El perdedor no cae hasta el fondo — solo baja un puesto,
--    porque es parte de ese mismo grupo que se corre.
--
--    Ej.: ganador estaba en 10, le gana al de la posición 7 → ganador pasa a
--    7; los que estaban en 7, 8 y 9 pasan a 8, 9 y 10 respectivamente.
--
--    Si quien gana es el retado (el defensor se queda con su puesto), no se
--    mueve nada — igual que en el mecanismo normal.
--
--    Usa el mismo paso intermedio a valores negativos que
--    retirar_de_escalafon (ver 20260903000000_retirar_de_escalafon_renumera.sql)
--    porque UNIQUE(temporada_id, categoria, genero, posicion) no es deferrable:
--    un UPDATE directo de posicion + 1 sobre varias filas puede chocar contra
--    ese constraint según el orden interno en que Postgres procese las filas.
CREATE OR REPLACE FUNCTION public.ascender_ganador_escalera_express(p_reto_id uuid, p_ganador_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_temporada_id uuid;
  v_retador_id uuid;
  v_retado_id uuid;
  v_categoria varchar;
  v_genero varchar;
  v_pos_retador integer;
  v_pos_retado integer;
  v_objetivo integer;
  v_vieja_ganador integer;
  v_corridos integer := 0;
BEGIN
  SELECT temporada_id, retador_id, retado_id
    INTO v_temporada_id, v_retador_id, v_retado_id
  FROM retos
  WHERE id = p_reto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró el reto %', p_reto_id USING errcode = 'P0002';
  END IF;

  -- Si quien ganó fue el retado (defensor), no hay ascenso que aplicar.
  IF p_ganador_id IS DISTINCT FROM v_retador_id THEN
    RETURN jsonb_build_object('cambio', false, 'motivo', 'ganó el retado, no hay ascenso');
  END IF;

  SELECT categoria, genero, posicion INTO v_categoria, v_genero, v_pos_retador
  FROM ladder_posiciones
  WHERE temporada_id = v_temporada_id AND jugador_id = v_retador_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la posición del retador' USING errcode = 'P0002';
  END IF;

  SELECT posicion INTO v_pos_retado
  FROM ladder_posiciones
  WHERE temporada_id = v_temporada_id AND jugador_id = v_retado_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la posición del retado' USING errcode = 'P0002';
  END IF;

  -- El retador solo "asciende" si de verdad estaba detrás (número mayor =
  -- peor puesto) del retado — invariante que ya garantiza la creación del
  -- reto, pero se vuelve a chequear aquí por seguridad.
  IF v_pos_retador IS NULL OR v_pos_retado IS NULL OR v_pos_retador <= v_pos_retado THEN
    RETURN jsonb_build_object('cambio', false, 'motivo', 'posiciones inválidas o el retador ya estaba adelante');
  END IF;

  v_objetivo := v_pos_retado;
  v_vieja_ganador := v_pos_retador;

  UPDATE ladder_posiciones
  SET posicion = -posicion
  WHERE temporada_id = v_temporada_id
    AND categoria = v_categoria
    AND genero = v_genero
    AND posicion >= v_objetivo
    AND posicion < v_vieja_ganador;

  GET DIAGNOSTICS v_corridos = ROW_COUNT;

  UPDATE ladder_posiciones
  SET posicion = -posicion + 1
  WHERE temporada_id = v_temporada_id
    AND categoria = v_categoria
    AND genero = v_genero
    AND posicion < 0;

  UPDATE ladder_posiciones
  SET posicion = v_objetivo
  WHERE temporada_id = v_temporada_id
    AND jugador_id = v_retador_id;

  RETURN jsonb_build_object(
    'cambio', true,
    'posicion_objetivo', v_objetivo,
    'posicion_vieja_ganador', v_vieja_ganador,
    'corridos', v_corridos
  );
END;
$$;
