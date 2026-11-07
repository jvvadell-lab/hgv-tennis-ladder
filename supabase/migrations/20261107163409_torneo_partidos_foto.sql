-- Torneo Navidad HGV 2026 — foto de los partidos (docs/torneo-navidad/SPEC.md §17).
--
-- Una foto por partido, igual que resultados.foto_url en la escalera. Como allá,
-- foto_url no lleva check de formato: la escribe solo el servidor, que sube el
-- archivo él mismo, y nunca recibe la URL del navegador.
--
-- foto_subida_por es un jugador o un admin (tablas distintas): por eso no tiene
-- llave foránea y se guarda el rol al lado.
--
-- Solo agrega columnas nulas: el código actual sigue funcionando con ellas. El
-- código nuevo las lee, así que esta migración va ANTES de desplegarlo.
--
-- Rollback:
--   alter table public.torneo_partidos
--     drop constraint torneo_partidos_foto_con_autor,
--     drop column foto_subida_at,
--     drop column foto_subida_rol,
--     drop column foto_subida_por,
--     drop column foto_url;

alter table public.torneo_partidos
  add column foto_url text null,
  add column foto_subida_por uuid null,
  add column foto_subida_rol text null check (foto_subida_rol in ('jugador', 'admin')),
  add column foto_subida_at timestamptz null,
  add constraint torneo_partidos_foto_con_autor check (
    (foto_url is null) = (foto_subida_por is null)
    and (foto_url is null) = (foto_subida_rol is null)
    and (foto_url is null) = (foto_subida_at is null)
  );
