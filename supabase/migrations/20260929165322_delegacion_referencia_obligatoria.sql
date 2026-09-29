-- Referencia obligatoria en pagos de delegación salvo efectivo — antes solo
-- la validaba la ruta server-side; ahora también la base (espacios en
-- blanco cuentan como vacía).
alter table public.pagos_delegacion
  add constraint referencia_obligatoria check (tipo_pago = 'efectivo' or nullif(trim(referencia), '') is not null);
