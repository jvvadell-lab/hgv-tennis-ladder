-- Igual que 20260820144547_cerrar_insert_directo_retos.sql: las reservas de
-- cancha ahora se crean vía app/api/jugador/crear-reserva (service role, con
-- jugador_id de la sesión y todas las validaciones revalidadas server-side).
DROP POLICY "Jugadores pueden crear su reserva" ON public.reservas_cancha;
