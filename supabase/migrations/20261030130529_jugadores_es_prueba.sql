-- Cuentas de prueba / demo (30-oct-2026). Se marcan con jugadores.es_prueba
-- para que sigan sirviendo para entrar y probar, pero no aparezcan en los
-- desplegables (pareja del torneo, pagos, permisos, delegación, anotar en la
-- escalera, representante de un menor) ni cuenten en el total del panel.
-- En el listado de Jugadores del admin siguen visibles con la etiqueta "Prueba".

alter table public.jugadores
  add column es_prueba boolean not null default false;

update public.jugadores
   set es_prueba = true
 where email in (
   'test-no-usar-1@example.invalid',
   'test-no-usar-2@example.invalid',
   'hgvtennisclub+wilsondemo@gmail.com'
 );
