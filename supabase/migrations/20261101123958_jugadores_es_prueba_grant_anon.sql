-- Hotfix 1-nov-2026 (ya aplicado en producción con esta misma versión).
--
-- 20261030130529_jugadores_es_prueba agregó jugadores.es_prueba y el panel
-- del admin filtra por esa columna desde el navegador (clave anónima), pero
-- 20261022124304_jugadores_cerrar_columnas_anon deja a anon leer solo las
-- columnas a las que se les da grant a propósito. Sin este grant, esas
-- consultas fallaban en silencio y quedaban vacíos el total del Dashboard y
-- los desplegables de jugadores (Pagos, Permisos médicos, anotar en la
-- escalera, Delegación).
--
-- es_prueba es un booleano sin datos personales. Arreglo de fondo: que esas
-- consultas pasen por el servidor; cuando ya ningún código del navegador
-- filtre por es_prueba, se puede revocar este grant.

grant select (es_prueba) on public.jugadores to anon;
