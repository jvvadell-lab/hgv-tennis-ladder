-- "Ya llegué" con geolocalización (Fase 1: observación) y penalidad
-- levantable por el admin.
--
-- Al confirmar llegada se registra cómo: con ubicación (distancia al club y
-- precisión del GPS, en metros — nunca las coordenadas), sin ubicación
-- (permiso negado / sin GPS / timeout) o por un admin. Las 'usada' previas a
-- este cambio quedan con confirmacion_metodo null ("antes de geolocalización").
--
-- penalidad_anulada_*: el admin puede quitar la penalidad de 5 días de una
-- reserva que quedó sin confirmar SIN marcarla 'usada' (no sabemos si se
-- jugó); crear-reserva ignora esas reservas al calcular la penalidad.

alter table public.reservas_cancha
  add column confirmado_at timestamptz,
  add column confirmado_por uuid references public.administradores(id),
  add column confirmacion_distancia_m integer check (confirmacion_distancia_m >= 0),
  add column confirmacion_precision_m integer check (confirmacion_precision_m >= 0),
  add column confirmacion_metodo text check (confirmacion_metodo in ('ubicacion', 'sin_ubicacion', 'admin')),
  add column penalidad_anulada_at timestamptz,
  add column penalidad_anulada_por uuid references public.administradores(id),
  add constraint distancia_solo_con_ubicacion
    check (confirmacion_distancia_m is null or confirmacion_metodo = 'ubicacion'),
  add constraint confirmado_por_solo_admin
    check ((confirmado_por is not null) = (confirmacion_metodo = 'admin')),
  add constraint penalidad_anulada_completa
    check ((penalidad_anulada_at is null) = (penalidad_anulada_por is null));

-- La tabla tiene lectura pública (policy SELECT para anon: la usan la
-- portada, la escalera, /reservas y el admin desde el navegador). Los datos
-- de confirmación y de penalidad NO deben ser públicos: anon (y
-- authenticated, que no tiene policy) solo pueden leer las columnas de
-- siempre. El admin lee las nuevas por /api/admin/reservas/confirmaciones
-- (service role). Toda consulta desde el cliente debe nombrar columnas:
-- un select('*') con anon falla por permisos.
revoke select on public.reservas_cancha from anon, authenticated;
grant select (id, jugador_id, cancha, fecha_hora, estado, created_at, duracion_min, tipo_juego, fecha_hora_fin)
  on public.reservas_cancha to anon, authenticated;
