-- Teléfono de los invitados (inscritos con nombre libre, sin ficha en
-- jugadores). Para los jugadores registrados el teléfono sale de
-- jugadores.telefono; este campo queda null.
alter table public.pagos_delegacion add column telefono_externo text null;
