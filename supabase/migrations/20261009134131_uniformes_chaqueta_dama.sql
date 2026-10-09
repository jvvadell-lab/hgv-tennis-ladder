-- Nueva prenda: chaqueta dama ($42, tallas XS–XXL, sin manga).
--
-- El tipo existente 'chaqueta' queda como está en la base (solo cambia su
-- etiqueta en la UI a "Chaqueta caballero"): ya hay prendas registradas con
-- ese valor, una de ellas en el Lote #1, en fábrica.
--
-- Tallas válidas por prenda:
--   franela_dama                 XS–XXL  (+ manga obligatoria: corta | sin_mangas)
--   chaqueta_dama                XS–XXL
--   franela_caballero, chaqueta  XS–XXXL
--   franela_nino                 2–16, solo pares
--
-- manga_solo_dama no cambia: la chaqueta dama no lleva manga.
-- modificar_prenda_uniforme no cambia: toma el precio de precios_prendas.

alter table public.pedido_uniforme_items drop constraint pedido_uniforme_items_tipo_prenda_check;
alter table public.pedido_uniforme_items add constraint pedido_uniforme_items_tipo_prenda_check
  check (tipo_prenda in ('franela_dama', 'franela_caballero', 'chaqueta', 'franela_nino', 'chaqueta_dama'));

alter table public.precios_prendas drop constraint precios_prendas_tipo_prenda_check;
alter table public.precios_prendas add constraint precios_prendas_tipo_prenda_check
  check (tipo_prenda in ('franela_dama', 'franela_caballero', 'chaqueta', 'franela_nino', 'chaqueta_dama'));
insert into public.precios_prendas (tipo_prenda, precio_usd) values ('chaqueta_dama', 42);

alter table public.pedido_uniforme_items drop constraint talla_segun_prenda;
alter table public.pedido_uniforme_items add constraint talla_segun_prenda check (
  (tipo_prenda in ('franela_dama', 'chaqueta_dama') and talla in ('XS', 'S', 'M', 'L', 'XL', 'XXL'))
  or (tipo_prenda in ('franela_caballero', 'chaqueta') and talla in ('XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'))
  or (tipo_prenda = 'franela_nino' and talla in ('2', '4', '6', '8', '10', '12', '14', '16'))
);
