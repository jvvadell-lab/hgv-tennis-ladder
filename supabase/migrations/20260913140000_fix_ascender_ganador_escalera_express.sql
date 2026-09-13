-- Fix: ascender_ganador_escalera_express fallaba con "duplicate key value
-- violates unique constraint ...temporada_id_categoria_genero_posicion_key"
-- cada vez que el RETADOR ganaba (el único caso en que hay cascada real).
--
-- Causa: la función movía la cascada [objetivo, vieja_ganador) a sus valores
-- finales (posicion+1 cada uno) ANTES de sacar al propio ganador de su
-- puesto viejo (vieja_ganador). La última fila de la cascada siempre termina
-- asentándose justo en vieja_ganador — el puesto que el ganador todavía
-- ocupaba en ese momento — y choca contra la constraint UNIQUE(temporada_id,
-- categoria, genero, posicion), que no es deferrable.
--
-- Reproducido y verificado en una tabla temporal con datos reales
-- (Alejandra Arias pos 4 vs Maria Horta pos 1, categoría sexta damas):
-- la lógica vieja revienta con unique_violation; esta corregida no.
--
-- Corrección: se vacía primero el puesto del propio ganador (mismo paso a
-- valor negativo temporal que ya se usa para la cascada — y que ya usa
-- retirar_de_escalafon, ver 20260903000000_retirar_de_escalafon_renumera.sql),
-- así el hueco en vieja_ganador ya está libre cuando la cascada llega ahí.
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

  -- Vacía primero el puesto del propio ganador (a un valor temporal negativo)
  -- para que la cascada, más abajo, pueda asentarse ahí sin chocar.
  UPDATE ladder_posiciones
  SET posicion = -posicion
  WHERE temporada_id = v_temporada_id AND jugador_id = v_retador_id;

  UPDATE ladder_posiciones
  SET posicion = -posicion
  WHERE temporada_id = v_temporada_id
    AND categoria = v_categoria
    AND genero = v_genero
    AND posicion >= v_objetivo
    AND posicion < v_vieja_ganador;

  GET DIAGNOSTICS v_corridos = ROW_COUNT;

  -- Asienta la cascada en sus valores finales — excluye al ganador (que
  -- sigue en su temporal negativo) para no tocarlo aquí.
  UPDATE ladder_posiciones
  SET posicion = -posicion + 1
  WHERE temporada_id = v_temporada_id
    AND categoria = v_categoria
    AND genero = v_genero
    AND posicion < 0
    AND jugador_id <> v_retador_id;

  -- El puesto objetivo ya quedó libre (la cascada lo corrió) — asienta al ganador ahí.
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
