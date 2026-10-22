-- Datos base del entorno de pruebas LOCAL (Supabase en Docker). Solo para
-- staging: NUNCA correr en producción. Lo carga scripts/staging-db.sh
-- después del esquema y de las migraciones pendientes. Idempotente.
--
-- El torneo y sus categorías salen de las migraciones de datos del repo
-- (torneo_navidad_2026_datos, torneo_infantil_datos), que el script corre
-- antes que este archivo.

-- Tasas BCV de ejemplo (no son reales): una por día hábil del torneo y
-- de las semanas previas, para que el reporte de pagos tenga tasa.
insert into public.tasas_bcv (fecha_vigencia, usd, eur, fuente)
select d::date, 880.00, 990.00, 'dolarapi'
from generate_series('2026-10-01'::date, '2026-12-31'::date, interval '1 day') d
where extract(isodow from d) < 6
  and not exists (select 1 from public.tasas_bcv t where t.fecha_vigencia = d::date);

-- Cuentas de prueba (solo existen en tu Supabase local). Se entra en
-- /login con el correo y el PIN de cada una.
insert into public.administradores (nombre, email, pin, nivel)
select 'Admin Staging', 'admin@staging.local', '9642', 'completo'
where not exists (select 1 from public.administradores where email = 'admin@staging.local');

-- "Prueba 01" es la jugadora de prueba con la que se entra a /login: el
-- script de simulación la usa como integrante de la pareja 1 (y "reset" no
-- la borra). Las otras 23 jugadoras (Prueba 02..24) las crea el script.
insert into public.jugadores (nombre, telefono, email, pin, categoria, genero, numero_accion, activo, estado_verificacion, email_verificado, categoria_torneo)
select 'Prueba 01', '', 'prueba01@staging.local', '1964', 'sexta', 'damas', 'SIM-01', true, 'verificado', true, 'sexta'
where not exists (select 1 from public.jugadores where email = 'prueba01@staging.local');
