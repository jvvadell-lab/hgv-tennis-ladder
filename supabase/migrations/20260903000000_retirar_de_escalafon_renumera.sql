-- Retirar a un jugador del escalafón (app/api/admin/retirar-de-escalafon/route.ts) borraba
-- su fila de ladder_posiciones sin renumerar a los que quedaban detrás, dejando un hueco
-- permanente en esa posición. Pasó en producción el 8 de agosto en sexta/caballeros de
-- ESCALERA RETOS HGV 2026 (posición 11 nunca se volvió a ocupar) y se corrigió a mano.
--
-- Esta función hace el borrado + renumerado en una sola transacción (una función plpgsql
-- es atómica por statement) para que un fallo a mitad de camino no deje el escalafón en un
-- estado peor que antes (renumeración parcial). El renumerado usa un paso intermedio a
-- valores negativos porque UNIQUE(temporada_id, categoria, genero, posicion) no es
-- deferrable: un UPDATE directo de posicion = posicion - 1 sobre varias filas puede chocar
-- contra ese constraint según el orden interno en que Postgres procese las filas.
--
-- Solo se renumera `posicion` (el standing actual), nunca `posicion_inicial` — esa columna
-- es el resultado histórico del sorteo y se usa para calcular cuánto subió cada jugador
-- desde entonces (ver app/admin/page.tsx:4419); correrla cada vez que alguien se retira
-- reescribiría esa historia para todos los que quedaron detrás.
create or replace function public.retirar_de_escalafon(p_posicion_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_temporada_id uuid;
  v_categoria varchar;
  v_genero varchar;
  v_posicion integer;
  v_jugador_id uuid;
  v_renumerados integer := 0;
begin
  select temporada_id, categoria, genero, posicion, jugador_id
    into v_temporada_id, v_categoria, v_genero, v_posicion, v_jugador_id
  from ladder_posiciones
  where id = p_posicion_id
  for update;

  if not found then
    raise exception 'No se encontró esa posición en el escalafón' using errcode = 'P0002';
  end if;

  delete from ladder_posiciones where id = p_posicion_id;

  if v_posicion is not null then
    update ladder_posiciones
    set posicion = -posicion
    where temporada_id = v_temporada_id
      and categoria = v_categoria
      and genero = v_genero
      and posicion > v_posicion;

    get diagnostics v_renumerados = row_count;

    update ladder_posiciones
    set posicion = -posicion - 1
    where temporada_id = v_temporada_id
      and categoria = v_categoria
      and genero = v_genero
      and posicion < 0;
  end if;

  return jsonb_build_object(
    'jugador_id', v_jugador_id,
    'posicion_liberada', v_posicion,
    'renumerados', v_renumerados
  );
end;
$$;
