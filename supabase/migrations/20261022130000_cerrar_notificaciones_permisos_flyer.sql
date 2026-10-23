-- Cierra a la clave anónima tres tablas que quedaban abiertas (revisión de
-- seguridad del 22-oct-2026, después de cerrar jugadores):
--
-- 1. notificaciones: la policy "Cualquiera puede ver notificaciones" dejaba
--    leer los avisos de todos los jugadores. La campana ahora lee
--    /api/jugador/notificaciones (con la sesión).
-- 2. permisos_medicos: se podían leer el motivo y el informe médico. Solo
--    quedan públicas las columnas que necesitan /ladder y Mi Perfil (quién
--    está de permiso, días, fechas y estado). El motivo y el informe los lee
--    el admin por /api/admin/permisos-medicos.
-- 3. plantillas_flyer: la policy "service role full access" era en realidad
--    para todos (rol public): cualquiera podía crear, editar o borrar. La
--    tabla está vacía y la app no la usa; el service role no necesita policy.
--
-- Todas las escrituras de estas tablas ya iban por rutas server con service role.

-- 1. Notificaciones
drop policy if exists "Cualquiera puede ver notificaciones" on public.notificaciones;
revoke all on table public.notificaciones from anon, authenticated;

-- 2. Permisos médicos
do $$
declare
  v_columna text;
begin
  revoke all on table public.permisos_medicos from anon, authenticated;
  for v_columna in
    select attname from pg_attribute
    where attrelid = 'public.permisos_medicos'::regclass and attnum > 0 and not attisdropped
  loop
    execute format('revoke all (%I) on table public.permisos_medicos from anon, authenticated', v_columna);
  end loop;
end;
$$;

grant select (id, jugador_id, temporada_id, dias, fecha_inicio, fecha_fin, estado, created_at)
  on table public.permisos_medicos to anon, authenticated;

-- 3. Plantillas de flyer
drop policy if exists "service role full access" on public.plantillas_flyer;
revoke all on table public.plantillas_flyer from anon, authenticated;
