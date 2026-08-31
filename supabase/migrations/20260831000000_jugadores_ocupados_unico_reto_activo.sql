-- Cierra la condición de carrera check-then-insert en app/api/jugador/crear-reto/route.ts:
-- dos requests casi simultáneos podían pasar el chequeo "no tiene reto pendiente" antes de
-- que el primero terminara su INSERT, porque no había ningún constraint en la BD que lo
-- impidiera como última línea de defensa. Ocurrió en producción: dos filas idénticas
-- (mismo retador, mismo retado, misma temporada) creadas con 117ms de diferencia.

-- 0) Dato existente a resolver antes de poder crear el UNIQUE: el duplicado real detectado
--    en producción. Se deja activa la fila más antigua (creada primero, 20:41:01.919) y se
--    marca la más nueva como rechazada — el reto legítimo del jugador sigue en pie.
update public.retos
set estado = 'rechazado'
where id = '6687ce97-ba26-44f9-8969-09b01f29b870'
  and estado = 'pendiente';

-- 1) Tabla auxiliar: cada jugador aparece en, como máximo, una fila —
--    la PK (jugador_id) es el UNIQUE real que hace esto atómico por diseño,
--    sin depender de locks manuales en la app.
create table public.jugadores_ocupados (
  jugador_id uuid primary key references public.jugadores(id) on delete cascade,
  reto_id uuid not null references public.retos(id) on delete cascade,
  ocupado_desde timestamptz not null default now()
);

create index jugadores_ocupados_reto_id_idx on public.jugadores_ocupados (reto_id);

alter table public.jugadores_ocupados enable row level security;
-- Sin políticas: igual que "retos" (ver 20260820144547_cerrar_insert_directo_retos.sql),
-- solo el service role la toca. Nadie necesita leerla ni escribirla desde el cliente.

-- 2) Función que mantiene la tabla sincronizada con el estado real de "retos".
--    Se dispara al crear un reto (ocupa a ambos jugadores) y al cambiar su estado
--    (libera cuando deja de estar pendiente/aceptado; vuelve a ocupar si un admin
--    revierte un reto rechazado a aceptado — ver admin/page.tsx:316-318).
create or replace function public.sync_jugadores_ocupados()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  estados_ocupan constant text[] := array['pendiente', 'aceptado'];
  ocupaba_antes boolean := (tg_op = 'UPDATE') and (old.estado = any(estados_ocupan));
  ocupa_ahora boolean := new.estado = any(estados_ocupan);
begin
  if ocupaba_antes and not ocupa_ahora then
    delete from public.jugadores_ocupados where reto_id = new.id;
  end if;

  if ocupa_ahora and not ocupaba_antes then
    begin
      insert into public.jugadores_ocupados (jugador_id, reto_id)
      values (new.retador_id, new.id), (new.retado_id, new.id);
    exception when unique_violation then
      raise exception 'RETO_JUGADOR_OCUPADO: uno de los dos jugadores ya tiene un reto pendiente o en curso'
        using errcode = 'P0001';
    end;
  end if;

  return new;
end;
$$;

create trigger trg_retos_sync_ocupados
after insert or update of estado on public.retos
for each row
execute function public.sync_jugadores_ocupados();

-- 3) Backfill: ocupar a los jugadores de los retos ya activos hoy (8 pares únicos,
--    tras resolver el duplicado en el paso 0).
insert into public.jugadores_ocupados (jugador_id, reto_id)
select retador_id, id from public.retos where estado in ('pendiente', 'aceptado')
union all
select retado_id, id from public.retos where estado in ('pendiente', 'aceptado');
