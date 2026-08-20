-- Aplicada manualmente por el usuario vía SQL Editor de Supabase (no vía apply_migration),
-- por lo que no quedó registrada en supabase_migrations.schema_migrations. El timestamp de
-- este archivo es aproximado — solo importa que preceda a las otras 3 migraciones de esta sesión.
ALTER TABLE public.reservas_cancha DROP CONSTRAINT reservas_cancha_estado_check;
ALTER TABLE public.reservas_cancha ADD CONSTRAINT reservas_cancha_estado_check
  CHECK (estado = ANY (ARRAY['activa'::text, 'cancelada'::text, 'usada'::text]));
