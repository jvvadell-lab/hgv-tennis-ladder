-- Igual que 20260820144547_cerrar_insert_directo_retos.sql y
-- 20260820160000_cerrar_insert_directo_reservas.sql: los resultados ahora se
-- crean vía app/api/jugador/registrar-resultado y app/api/admin/registrar-resultado
-- (service role, con jugador_id/ganador_id calculados y validados server-side).
DROP POLICY "Cualquiera puede insertar resultados" ON public.resultados;
