-- Cierra la tabla jugadores a la clave anónima (hallazgo del 20-oct-2026).
--
-- La clave anónima es pública (va en el navegador). Hasta ahora anon (y
-- authenticated, que la app no usa) tenía todos los privilegios de tabla
-- sobre jugadores y la policy "Cualquiera puede ver jugadores" (using true):
-- cualquiera podía leer pin, email y token_verificacion de todos los
-- jugadores — y el login es email + PIN. La policy "Cualquiera puede
-- registrarse" (with check true) dejaba además que el registro anónimo
-- escribiera cualquier columna (estado_verificacion, email_verificado,
-- categoria_torneo, verificado_por...).
--
-- Desde ahora:
-- 1. anon/authenticated solo leen las columnas públicas (las que se ven en el
--    escalafón, la portada y los selectores del admin). Todo lo demás (pin,
--    email, teléfono, token, N.º de acción, carné, verificación...) se lee
--    desde rutas server con service role (/api/jugador/perfil,
--    /api/admin/jugadores). Una columna nueva NO queda visible para anon
--    salvo que se agregue a este grant a propósito.
-- 2. El registro pasa por /api/registro (service role, valida y escribe solo
--    los campos permitidos): anon ya no inserta, actualiza ni borra.

do $$
declare
  v_columna text;
begin
  -- Privilegios de tabla (incluye truncate/trigger/references, que no pasan por RLS).
  revoke all on table public.jugadores from anon, authenticated;

  -- Y cualquier privilegio que haya quedado a nivel de columna.
  for v_columna in
    select attname from pg_attribute
    where attrelid = 'public.jugadores'::regclass and attnum > 0 and not attisdropped
  loop
    execute format('revoke all (%I) on table public.jugadores from anon, authenticated', v_columna);
  end loop;
end;
$$;

grant select (id, nombre, categoria, genero, activo) on table public.jugadores to anon, authenticated;

drop policy if exists "Cualquiera puede registrarse" on public.jugadores;
